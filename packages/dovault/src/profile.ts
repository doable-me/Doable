/**
 * Sandbox-agnostic profile object — a pure, serializable description of
 * "what world should this process see." Backends consume this object and
 * translate it into their native flags. Layer composers consume it to fill
 * gaps a backend doesn't natively provide.
 *
 * See SandboxAgnosticSandboxingPRD/06-architecture-sandbox-agnostic.md
 * (section "The interface — SandboxProfile") for the authoritative spec.
 *
 * MODULARITY CONTRACT
 * -------------------
 * This module is pure data + runtime validation.
 *  - No I/O. No backend-specific logic. No reach into services/api.
 *  - Only `zod` is imported.
 *  - Backwards-compatible with legacy types in ./types.ts (which stay).
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// Scalar / leaf shapes
// ═══════════════════════════════════════════════════════════════════════════

export type ScopeAction = "allow" | "deny";

export const ScopeActionSchema = z.enum(["allow", "deny"]);

// ═══════════════════════════════════════════════════════════════════════════
// ProcOverlay — synthetic /proc content driven by the profile, not the host.
// ═══════════════════════════════════════════════════════════════════════════

export interface ProcOverlay {
  cpuinfo: { cores: number; modelName: string; mhz: number };
  meminfo: { totalKb: number; availableKb: number };
  uptimeSec: number;
  loadavg: [number, number, number];
  /** Files to flat-mask with /dev/null. */
  mask: string[];
}

export const ProcOverlaySchema: z.ZodType<ProcOverlay> = z.object({
  cpuinfo: z.object({
    cores: z.number().int().nonnegative(),
    modelName: z.string(),
    mhz: z.number().nonnegative(),
  }),
  meminfo: z.object({
    totalKb: z.number().int().nonnegative(),
    availableKb: z.number().int().nonnegative(),
  }),
  uptimeSec: z.number().nonnegative(),
  loadavg: z.tuple([z.number(), z.number(), z.number()]),
  mask: z.array(z.string()),
});

// ═══════════════════════════════════════════════════════════════════════════
// SandboxProfile — the single shape every backend consumes.
// ═══════════════════════════════════════════════════════════════════════════

export interface SandboxProfile {
  /** Stable id, e.g. "ai-bash", "vite-preview", "build". */
  id: string;

  /** Filesystem view */
  fs: {
    /** Project root, bind-mounted rw at /work inside the jail */
    rootDir: string;
    /** Additional read-only binds: `[hostPath, jailPath]` */
    readOnlyBinds: Array<{ host: string; jail: string }>;
    /** tmpfs mounts inside the jail: `[jailPath, sizeBytes]` */
    tmpfs: Array<{ jail: string; sizeBytes: number }>;
    /** Files in /proc to overlay with synthetic content. */
    procOverlay: ProcOverlay;
    /** Synthetic /etc files. Key=jail path, value=content. */
    etcSynth: Record<string, string>;
    /** Paths explicitly *not* visible (mask). Higher-precedence than binds. */
    masks: string[];
  };

  /** Process / namespace knobs */
  ns: {
    pid: boolean;
    net: "none" | "loopback" | "egress-allowlist" | "host";
    uts: boolean;
    ipc: boolean;
    user: boolean;
  };

  /** UID drop */
  user: {
    uid: number;
    gid: number;
    /** Map of uid -> /etc/passwd line for visible users. */
    passwd: Record<number, string>;
  };

  /** Syscall / capability surface */
  syscalls: {
    capsKeep: string[];
    seccompDefault: "errno" | "kill" | "trap" | "log";
    seccompDeny: string[];
    /** When set, this is an allowlist (only these syscalls permitted). */
    seccompAllow?: string[];
  };

  /** Resource limits */
  limits: {
    memBytes: number;
    cpuQuotaPercent: number;
    nproc: number;
    nofile: number;
    cpuTimeSeconds: number;
  };

  /** Network egress allowlist (used only when ns.net = "egress-allowlist") */
  network: {
    defaultAction: ScopeAction;
    allow: string[];
    deny: string[];
  };

  /** Environment policy */
  env: {
    allowlist: string[];
    inject: Record<string, string>;
  };

  /** Timeout (orchestrator-enforced; not a backend concern) */
  timeoutMs: number;
}

export const SandboxProfileSchema: z.ZodType<SandboxProfile> = z.object({
  id: z.string().min(1),
  fs: z.object({
    rootDir: z.string().min(1),
    readOnlyBinds: z.array(
      z.object({
        host: z.string().min(1),
        jail: z.string().min(1),
      }),
    ),
    tmpfs: z.array(
      z.object({
        jail: z.string().min(1),
        sizeBytes: z.number().int().nonnegative(),
      }),
    ),
    procOverlay: ProcOverlaySchema,
    etcSynth: z.record(z.string(), z.string()),
    masks: z.array(z.string()),
  }),
  ns: z.object({
    pid: z.boolean(),
    net: z.enum(["none", "loopback", "egress-allowlist", "host"]),
    uts: z.boolean(),
    ipc: z.boolean(),
    user: z.boolean(),
  }),
  user: z.object({
    uid: z.number().int().nonnegative(),
    gid: z.number().int().nonnegative(),
    passwd: z.record(z.string(), z.string()),
  }),
  syscalls: z.object({
    capsKeep: z.array(z.string()),
    seccompDefault: z.enum(["errno", "kill", "trap", "log"]),
    seccompDeny: z.array(z.string()),
    seccompAllow: z.array(z.string()).optional(),
  }),
  limits: z.object({
    memBytes: z.number().int().nonnegative(),
    cpuQuotaPercent: z.number().int().nonnegative(),
    nproc: z.number().int().nonnegative(),
    nofile: z.number().int().nonnegative(),
    cpuTimeSeconds: z.number().nonnegative(),
  }),
  network: z.object({
    defaultAction: ScopeActionSchema,
    allow: z.array(z.string()),
    deny: z.array(z.string()),
  }),
  env: z.object({
    allowlist: z.array(z.string()),
    inject: z.record(z.string(), z.string()),
  }),
  timeoutMs: z.number().int().nonnegative(),
});

// ═══════════════════════════════════════════════════════════════════════════
// Defaults — safe baseline ("deny everything we don't need").
// ═══════════════════════════════════════════════════════════════════════════

/** Synthetic uid used for unmapped/anonymous workloads (matches `nobody`). */
const SYNTHETIC_UID = 65534;
const SYNTHETIC_GID = 65534;

/**
 * Build a safe baseline profile.
 *
 *  - 256 MB memory ceiling, 25% CPU, 32 max processes, 1024 fds, 60s cputime
 *  - No network egress
 *  - Project root bind-mounted at /work
 *  - Synthetic /etc/passwd with a single line for uid 65534 (nobody)
 *  - /proc/cpuinfo, /etc/passwd, /etc/shadow, /opt masked from the jail
 *  - Empty syscall allowlist semantics: deny-all unless caller adds entries
 */
export function defaultProfile(
  id: string,
  projectRoot: string,
): SandboxProfile {
  return {
    id,
    fs: {
      rootDir: projectRoot,
      readOnlyBinds: [],
      tmpfs: [],
      procOverlay: {
        cpuinfo: { cores: 1, modelName: "synthetic", mhz: 1000 },
        meminfo: { totalKb: 262144, availableKb: 262144 },
        uptimeSec: 0,
        loadavg: [0, 0, 0],
        mask: ["/proc/cpuinfo"],
      },
      etcSynth: {
        "/etc/passwd": `nobody:x:${SYNTHETIC_UID}:${SYNTHETIC_GID}:nobody:/work:/usr/sbin/nologin\n`,
      },
      masks: ["/proc/cpuinfo", "/etc/passwd", "/etc/shadow", "/opt"],
    },
    ns: {
      pid: true,
      net: "none",
      uts: true,
      ipc: true,
      user: true,
    },
    user: {
      uid: SYNTHETIC_UID,
      gid: SYNTHETIC_GID,
      passwd: {
        [SYNTHETIC_UID]: `nobody:x:${SYNTHETIC_UID}:${SYNTHETIC_GID}:nobody:/work:/usr/sbin/nologin`,
      },
    },
    syscalls: {
      capsKeep: [],
      seccompDefault: "errno",
      seccompDeny: [],
      seccompAllow: [],
    },
    limits: {
      memBytes: 256 * 1024 * 1024,
      cpuQuotaPercent: 25,
      nproc: 32,
      nofile: 1024,
      cpuTimeSeconds: 60,
    },
    network: {
      defaultAction: "deny",
      allow: [],
      deny: [],
    },
    env: {
      allowlist: [],
      inject: {},
    },
    timeoutMs: 60_000,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Overrides compiler — deep-merge a partial onto a base profile.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deep-merge `overrides` onto `base`. Arrays are *replaced* (not concatenated)
 * because partial array merges almost always produce surprising results
 * (e.g. dropping a deny rule by setting `deny: []` should empty it, not be
 * silently ignored). Plain-object branches recurse. Scalars and arrays at
 * a given key replace wholesale.
 *
 * The base is never mutated; a fresh profile is returned.
 */
export function compileProfileOverrides(
  base: SandboxProfile,
  overrides: Partial<SandboxProfile>,
): SandboxProfile {
  return deepMerge(base, overrides) as SandboxProfile;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    // Arrays, scalars, null — patch wins wholesale.
    return patch as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    const next = (patch as Record<string, unknown>)[key];
    if (next === undefined) continue;
    out[key] = deepMerge((base as Record<string, unknown>)[key], next);
  }
  return out as T;
}
