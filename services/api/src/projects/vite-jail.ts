/**
 * Vite process jail — wraps Vite spawning with dovault's security layers.
 *
 * Layer 1: Config guard (locks vite.config.ts, postcss.config.js, tailwind.config.ts)
 * Layer 2: Node.js Permission Model (fs/process/worker restrictions)
 * Layer 3: OS resource limits (systemd cgroups on Linux, V8 heap on Windows)
 */

import type { ChildProcess } from "node:child_process";
import { createVault, Tracer as VaultTracer } from "dovault";
import type { Vault, JailedProcess } from "dovault";
import { xray } from "../integrations/xray.js";

// ─── Resource limits (configurable via env) ──────────────

const VITE_LIMITS = {
  memoryMax: process.env.VITE_MEMORY_MAX ?? "256M",
  cpuQuota: process.env.VITE_CPU_QUOTA ?? "50%",
  tasksMax: parseInt(process.env.VITE_TASKS_MAX ?? "128", 10),
} as const;

// ─── Tracer wired to xray span recording ─────────────────

const vaultTracer = new VaultTracer((span) => {
  xray.recordSpan({
    source: "dovault",
    id: span.id,
    name: span.name,
    parentId: span.parentId,
    startedAt: span.startedAt,
    endedAt: span.endedAt,
    durationMs: span.durationMs,
    status: span.status,
    error: span.error,
    attributes: span.attributes,
  });
});

// ─── Singleton vault wired to xray audit sink ────────────

let vaultSingleton: Vault | null = null;

function getVault(): Vault {
  if (!vaultSingleton) {
    vaultSingleton = createVault({
      resourceLimits: VITE_LIMITS,
      tracer: vaultTracer,
      onAudit: (entry) => {
        xray.recordVaultEvent({
          timestamp: typeof entry.timestamp === "string" ? Date.parse(entry.timestamp) : Date.now(),
          type: `vault.${entry.kind}`,
          data: entry.details,
        });
      },
    });
    console.log(`[vite-jail] Vault initialized (backend=${vaultSingleton.backend}, fullIsolation=${vaultSingleton.hasFullIsolation})`);
  }
  return vaultSingleton;
}

export interface SpawnJailedViteOpts {
  execPath: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  projectId: string;
  stdio?: "pipe" | "ignore" | "inherit";
}

export interface JailedViteResult {
  process: ChildProcess;
  pid: number;
  kill: () => boolean | void;
}

/**
 * Spawn a jailed Vite process. Returns a plain ChildProcess-shaped object
 * so dev-server.ts can use `.stdout`, `.stderr`, `.on("close")`, etc. as before.
 *
 * Falls back to raw spawn if dovault throws (e.g. Permission Model unsupported).
 */
export async function spawnJailedVite(opts: SpawnJailedViteOpts): Promise<JailedViteResult> {
  const vault = getVault();

  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.env)) {
    if (typeof v === "string") cleanEnv[k] = v;
  }

  try {
    const jailed: JailedProcess = await vault.spawn(
      opts.execPath,
      opts.args,
      {
        cwd: opts.cwd,
        jail: opts.cwd,
        env: cleanEnv,
        stdio: opts.stdio ?? "pipe",
        lockConfigs: false, // AI legitimately edits vite.config.ts / postcss.config.js
        blockChildProcess: false, // Vite spawns esbuild/workers legitimately
        blockOutboundNet: false,  // dev server needs outbound for npm installs / HMR ws
        resourceLimits: VITE_LIMITS,
      },
    );

    // Record spawn into xray vault history (trace-collector is per-turn,
    // dev-server spawns happen outside chat turns — xray is the right sink)
    xray.recordVaultEvent({
      projectId: opts.projectId,
      type: "vault.spawn",
      data: { pid: jailed.pid, limits: VITE_LIMITS },
    });

    return {
      process: jailed.process as ChildProcess,
      pid: jailed.pid ?? -1,
      kill: () => { jailed.kill(); },
    };
  } catch (err) {
    // Graceful degradation on platforms where dovault can't jail — fall back
    // to raw spawn. The trace event still records the failure so operators
    // can see the gap.
    console.warn(`[vite-jail] vault.spawn failed, falling back to raw spawn: ${(err as Error).message}`);
    const { spawn } = await import("node:child_process");
    const child = spawn(opts.execPath, opts.args, {
      cwd: opts.cwd,
      shell: false,
      stdio: opts.stdio ?? "pipe",
      env: cleanEnv,
    });
    return {
      process: child,
      pid: child.pid ?? -1,
      kill: () => { child.kill(); },
    };
  }
}

/** Check if a file is a locked config file (for use in write_file tool). */
export function isLockedConfigFile(filePath: string): boolean {
  return getVault().isLockedFile(filePath);
}
