/**
 * psroot-v2 — SandboxBackend adapter for the Windows Psroot CLI.
 *
 * Wave-2 replacement for the legacy ResourceBackend-shaped PsrootBackend in
 * ./psroot.ts. Same underlying binary, same isolation primitives (Windows
 * AppContainer + Job Objects); only the interface changes — profile-driven
 * instead of (limits, blockNetwork)-driven.
 *
 * MODULARITY CONTRACT
 * -------------------
 *  - Pure adapter: imports only types + node:child_process + node:fs.
 *  - No I/O at module load; binary resolution is lazy and cached.
 *  - buildSpawn is pure (no preflight / teardown side effects needed —
 *    psroot.exe owns the AppContainer + Job Object lifecycle itself).
 *
 * See SandboxAgnosticSandboxingPRD/06-architecture-sandbox-agnostic.md
 * and devframeworkPRD/11-cross-platform-sandbox.md §4.1.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BackendAvailability,
  BuildSpawnResult,
  DeclaredLayers,
  SandboxBackend,
} from "./sandbox-backend.js";
import type { SandboxProfile } from "../profile.js";

// ═══════════════════════════════════════════════════════════════════════════
// Binary resolution — mirrors ./psroot.ts so both adapters find the same exe.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cache of resolved psroot.exe path. `undefined` = not yet probed,
 * `null` = probed and not found, string = absolute path or bare name.
 */
let cachedPsrootPath: string | null | undefined = undefined;

/**
 * Resolve psroot.exe in priority order, identical to the legacy adapter:
 *   1. DOABLE_PSROOT_PATH env var (absolute path)
 *   2. vendor/psroot/psroot.exe relative to repo root
 *   3. system PATH (via `where psroot.exe`)
 *
 * Returns the absolute path (or bare "psroot.exe" if found on PATH), or
 * null if not found.
 */
function resolvePsrootPath(): string | null {
  if (cachedPsrootPath !== undefined) return cachedPsrootPath;

  const envOverride = process.env.DOABLE_PSROOT_PATH;
  if (envOverride && existsSync(envOverride)) {
    cachedPsrootPath = envOverride;
    return envOverride;
  }

  // src/backends/psroot-v2.ts -> src/backends -> src -> dovault -> packages -> repo
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(here, "..", "..", "..", "..", "..");
    const vendored = path.join(repoRoot, "vendor", "psroot", "psroot.exe");
    if (existsSync(vendored)) {
      cachedPsrootPath = vendored;
      return vendored;
    }
  } catch {
    // import.meta.url may be unavailable under some bundlers — fall through.
  }

  try {
    execSync("where psroot.exe", { stdio: "ignore" });
    cachedPsrootPath = "psroot.exe"; // rely on PATH at spawn time
    return "psroot.exe";
  } catch {
    cachedPsrootPath = null;
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Env filtering — allowlist + inject, per profile.env policy.
// ═══════════════════════════════════════════════════════════════════════════

function buildEnv(profile: SandboxProfile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of profile.env.allowlist) {
    const v = process.env[key];
    if (typeof v === "string") out[key] = v;
  }
  for (const [k, v] of Object.entries(profile.env.inject)) {
    out[k] = v;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// Adapter
// ═══════════════════════════════════════════════════════════════════════════

export const psrootBackend: SandboxBackend = {
  id: "psroot",
  /**
   * Priority 90 — highest-priority backend on Windows. Above the legacy
   * adapter (70) and the older Job-Objects-only WindowsBackend (60).
   */
  priority: 90,

  async available(): Promise<BackendAvailability> {
    if (process.platform !== "win32") {
      return { ok: false, reason: "psroot is Windows-only" };
    }
    const resolved = resolvePsrootPath();
    if (resolved === null) {
      return {
        ok: false,
        reason:
          "psroot.exe not found (checked DOABLE_PSROOT_PATH, vendor/psroot/psroot.exe, and PATH)",
      };
    }
    return { ok: true };
  },

  declaredLayers(): DeclaredLayers {
    // Psroot wraps Windows AppContainer (full FS jail + named-object isolation)
    // plus Job Objects (memory/CPU/proc caps, kill-on-close = pidNs-equivalent
    // and capability-drop-equivalent on Windows). No seccomp / cgroups /
    // landlock / nft on Windows; net isolation is policy-only (not a netns).
    return {
      fs: "full",
      pidNs: true,
      netNs: false,
      seccomp: false,
      cgroups: false,
      capsDrop: true,
      procMask: true,
      etcSynth: false,
      landlock: false,
      nftEgress: false,
    };
  },

  buildSpawn(
    profile: SandboxProfile,
    command: string,
    args: string[],
    _cwd: string,
  ): BuildSpawnResult {
    const binary = resolvePsrootPath() ?? "psroot.exe";
    const profileSpec = {
      rootDir: profile.fs.rootDir,
      masks: profile.fs.masks,
      memBytes: profile.limits.memBytes,
      cpuQuotaPercent: profile.limits.cpuQuotaPercent,
      netPolicy: profile.ns.net,
    };
    const argv = [
      binary,
      "--profile-json",
      JSON.stringify(profileSpec),
      "--",
      command,
      ...args,
    ];
    return {
      argv,
      env: buildEnv(profile),
      preflight: [],
      teardown: [],
    };
  },
};
