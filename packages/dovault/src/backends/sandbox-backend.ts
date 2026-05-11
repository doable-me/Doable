/**
 * SandboxBackend — richer, profile-driven backend interface.
 *
 * This module is the Wave 1 replacement for ResourceBackend (./types.ts).
 * Both interfaces coexist during migration; backend implementations will be
 * refactored to this contract in Wave 2.
 *
 * See SandboxAgnosticSandboxingPRD/06-architecture-sandbox-agnostic.md
 * (section "SandboxBackend") for the authoritative spec.
 *
 * MODULARITY CONTRACT
 * -------------------
 * This file is INTERFACE-ONLY plus the registry class. No backend
 * implementations live here. Each concrete backend (bubblewrap, psroot,
 * sandbox-exec, …) imports from this module and self-registers.
 */

import type { SandboxProfile } from "../profile.js";

// ═══════════════════════════════════════════════════════════════════════════
// Availability
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of probing whether a backend can actually run on this host right
 * now. `reason` is human-readable (shown in admin diagnostics) and must be
 * present whenever `ok` is false.
 */
export type BackendAvailability =
  | { ok: true }
  | { ok: false; reason: string };

// ═══════════════════════════════════════════════════════════════════════════
// DeclaredLayers — what isolation a backend natively provides.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Per-layer self-declaration. The orchestrator uses this to decide which
 * layer composers (e.g. user-mode procMask, nft egress jail) need to run
 * on top of the backend's native isolation.
 *
 *  - `fs`         : "full" = bind/overlay-mount fs jail, "partial" = path
 *                   confinement only (e.g. landlock without bind mounts),
 *                   "none" = no fs isolation.
 *  - `pidNs`      : true if the backend hides host PIDs.
 *  - `netNs`      : true if the backend creates a separate network ns.
 *  - `seccomp`    : true if the backend applies a seccomp filter.
 *  - `cgroups`    : true if the backend enforces cgroup-level limits.
 *  - `capsDrop`   : true if the backend drops Linux capabilities.
 *  - `procMask`   : true if the backend masks `/proc` paths natively.
 *  - `etcSynth`   : true if the backend synthesizes `/etc` files natively.
 *  - `landlock`   : true if the backend uses Linux landlock.
 *  - `nftEgress`  : true if the backend installs nft egress rules.
 */
export interface DeclaredLayers {
  fs: "full" | "partial" | "none";
  pidNs: boolean;
  netNs: boolean;
  seccomp: boolean;
  cgroups: boolean;
  capsDrop: boolean;
  procMask: boolean;
  etcSynth: boolean;
  landlock: boolean;
  nftEgress: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle steps
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pre-spawn side effect: e.g. mount tmpfs, write a synthetic /etc/passwd,
 * install an nft chain. Steps run in declared order; a failure aborts the
 * spawn and any already-completed steps' teardown hooks are invoked.
 */
export interface PreflightStep {
  id: string;
  run(): Promise<void>;
}

/**
 * Post-exit side effect: e.g. unmount tmpfs, remove nft chain, free a uid.
 * Steps run in reverse-declared order. Each step must be idempotent — it
 * may be invoked as part of normal teardown or as part of preflight rollback.
 */
export interface TeardownStep {
  id: string;
  run(): Promise<void>;
}

/**
 * Output of `SandboxBackend.buildSpawn`. The orchestrator spawns
 * `argv[0]` with `argv.slice(1)` and `env`, after running every
 * `preflight` step to completion, and runs every `teardown` step
 * after the child exits (in reverse order).
 */
export interface BuildSpawnResult {
  argv: string[];
  env: Record<string, string>;
  preflight: PreflightStep[];
  teardown: TeardownStep[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SandboxBackend
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A pluggable sandbox provider. One backend per host platform / mechanism
 * (e.g. `bubblewrap`, `psroot`, `sandbox-exec`). Backends are pure functions
 * over (profile, command, args, cwd): they produce an argv/env plus a list
 * of preflight/teardown side effects but do not themselves perform spawns.
 */
export interface SandboxBackend {
  /** Stable identifier (e.g. "bubblewrap", "psroot", "sandbox-exec"). */
  readonly id: string;

  /** Auto-detection priority. Higher = preferred. */
  readonly priority: number;

  /** Probe the host: can this backend actually run right now? */
  available(): Promise<BackendAvailability>;

  /** Self-declare which isolation layers this backend provides natively. */
  declaredLayers(): DeclaredLayers;

  /**
   * Translate a profile + command into a concrete spawn plan. Pure: no I/O.
   * Any side effects must be emitted as `preflight` / `teardown` steps so
   * the orchestrator can sequence and roll them back.
   */
  buildSpawn(
    profile: SandboxProfile,
    command: string,
    args: string[],
    cwd: string,
  ): BuildSpawnResult;
}

// ═══════════════════════════════════════════════════════════════════════════
// Errors
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Thrown by `SandboxBackendRegistry.resolve` when:
 *  - a `preferredId` was supplied but that backend is unregistered or
 *    reports `available() === { ok: false, … }`, OR
 *  - no backend at all is registered/available on the host.
 */
export class BackendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUnavailableError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

/**
 * In-process registry of sandbox backends. Backends self-register at module
 * import time; the orchestrator calls `resolve()` once per spawn (or once
 * per process if it caches).
 *
 * Resolution order:
 *   1. If `preferredId` is set, return that backend iff registered AND
 *      `available() === { ok: true }`. Otherwise throw
 *      `BackendUnavailableError`.
 *   2. Otherwise, iterate registered backends in descending `priority`
 *      order and return the first whose `available()` returns ok.
 *   3. If no backend is available, throw `BackendUnavailableError`.
 */
export class SandboxBackendRegistry {
  private readonly backends: SandboxBackend[] = [];

  /**
   * Register a backend. If a backend with the same `id` is already
   * registered, it is replaced — this lets tests swap implementations
   * without rewiring import order.
   */
  register(b: SandboxBackend): void {
    const existing = this.backends.findIndex((x) => x.id === b.id);
    if (existing >= 0) {
      this.backends[existing] = b;
    } else {
      this.backends.push(b);
    }
  }

  /**
   * Resolve the backend to use for the next spawn. See class-level docs
   * for the resolution order.
   */
  async resolve(preferredId?: string): Promise<SandboxBackend> {
    if (preferredId !== undefined) {
      const preferred = this.backends.find((b) => b.id === preferredId);
      if (!preferred) {
        throw new BackendUnavailableError(
          `Preferred sandbox backend "${preferredId}" is not registered`,
        );
      }
      const probe = await preferred.available();
      if (!probe.ok) {
        throw new BackendUnavailableError(
          `Preferred sandbox backend "${preferredId}" is unavailable: ${probe.reason}`,
        );
      }
      return preferred;
    }

    const ordered = [...this.backends].sort(
      (a, b) => b.priority - a.priority,
    );
    for (const backend of ordered) {
      const probe = await backend.available();
      if (probe.ok) {
        return backend;
      }
    }

    throw new BackendUnavailableError(
      "No sandbox backend is available on this host",
    );
  }

  /**
   * Probe every registered backend in parallel and return a map of
   * `id -> availability`. Used by admin diagnostics.
   */
  async probeAll(): Promise<Record<string, BackendAvailability>> {
    const entries = await Promise.all(
      this.backends.map(
        async (b): Promise<[string, BackendAvailability]> => [
          b.id,
          await b.available(),
        ],
      ),
    );
    const out: Record<string, BackendAvailability> = {};
    for (const [id, avail] of entries) {
      out[id] = avail;
    }
    return out;
  }
}
