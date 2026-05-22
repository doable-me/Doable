/**
 * Vite process jail — wraps Vite spawning with dovault's security layers.
 *
 * Layer 1: Config guard (locks vite.config.ts, postcss.config.js, tailwind.config.ts)
 * Layer 2: Node.js Permission Model (fs/process/worker restrictions)
 * Layer 3: OS resource limits (systemd cgroups on Linux, V8 heap on Windows)
 */

// Feature flag DOABLE_SANDBOX_VITE=1: route vite spawn through the orchestrator's
// jailedSpawnLongRunning under the "vite-preview" profile. Default OFF preserves
// the legacy vault.spawn path.

import type { ChildProcess } from "node:child_process";
import { createVault, Tracer as VaultTracer } from "dovault";
import type { Vault, JailedProcess } from "dovault";
import { xray } from "../integrations/xray.js";
import { shouldJail, getHardeningLevel } from "../runtime/hardening-level.js";
import { isSandboxWrapperAvailable } from "../runtime/dev-uid-allocator.js";
import { jailedSpawnLongRunning } from "../sandbox/orchestrator.js";

const SANDBOX_SPAWN_PATH = "/opt/doable/bin/sandbox-spawn";

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
  /** Linux-only: per-project sandbox UID; spawn is wrapped with setpriv uid-drop. */
  uid?: number;
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
  if (process.env.DOABLE_SANDBOX_VITE === "1") {
    const hardening = (process.env.DOABLE_HARDENING_LEVEL as
      | "off"
      | "dev"
      | "staging"
      | "prod"
      | undefined) ?? "dev";
    const spawnCtx = {
      projectId: opts.projectId,
      workspaceId: null,
      userId: null, // no authenticated user at this layer
      sessionId: opts.projectId,
      hardening,
      // Pass host-side uid so bwrap's inside-NS uid matches the project dir owner.
      hostUid: typeof opts.uid === "number" ? opts.uid : undefined,
    };

    // Rewrite host absolute paths in args to the jail-internal /work prefix.
    const hostPrefix = opts.cwd;
    const jailPrefix = "/work";
    const rewriteArg = (a: string): string => {
      if (a === hostPrefix) return jailPrefix;
      if (a.startsWith(hostPrefix + "/")) {
        return jailPrefix + a.slice(hostPrefix.length);
      }
      return a;
    };
    const jailedArgs = opts.args.map(rewriteArg);
    const handle = await jailedSpawnLongRunning(
      opts.execPath,
      jailedArgs,
      spawnCtx,
      "vite-preview",
    );
    xray.recordVaultEvent({
      projectId: opts.projectId,
      type: "vault.spawn",
      data: {
        pid: handle.pid,
        backendId: handle.backendId,
        profileId: handle.profileId,
        composers: handle.composers,
        via: "jailedSpawnLongRunning",
      },
    });
    return {
      process: handle.process,
      pid: handle.pid ?? -1,
      kill: () => { void handle.shutdown(); },
    };
  }

  const cleanEnv: Record<string, string> = {};

  // Inherit a minimal allow-list of host env vars so the spawned process
  // can actually execute. Without PATH, `npx`/`pnpm`/`node` can't be
  // resolved and the process exits 127 — which is exactly the bug a
  // freshly-created Next.js project hit ("next dev" → exit 127).
  // We do NOT inherit anything secret-bearing (no DATABASE_URL, no
  // JWT_SECRET, no API keys). The opts.env coming from the framework
  // adapter still wins on conflict.
  for (const k of ["PATH", "HOME", "USER", "LANG", "LC_ALL", "TZ", "TERM", "SHELL"]) {
    const v = process.env[k];
    if (v) cleanEnv[k] = v;
  }

  for (const [k, v] of Object.entries(opts.env)) {
    if (typeof v === "string") cleanEnv[k] = v;
  }

  // Wave 29: route dev outbound HTTP through an operator-supplied proxy.
  // Vite/dev runs `npm install` for new packages too, so it benefits from the
  // same proxy as builder.ts. When BUILD_HTTP_PROXY is unset → no injection.
  const proxy = process.env.BUILD_HTTP_PROXY;
  if (proxy) {
    console.log(`[vite-jail] routing outbound through ${proxy}`);
    cleanEnv.HTTP_PROXY = proxy;
    cleanEnv.HTTPS_PROXY = proxy;
    cleanEnv.http_proxy = proxy;
    cleanEnv.https_proxy = proxy;
    cleanEnv.NO_PROXY = "127.0.0.1,localhost,::1";
    cleanEnv.no_proxy = "127.0.0.1,localhost,::1";
    cleanEnv.npm_config_proxy = proxy;
    cleanEnv.npm_config_https_proxy = proxy;
    cleanEnv.PIP_PROXY = proxy;
  }

  // UID-drop wrap for per-project isolation. Only applies on Linux when
  // the caller passed a uid from the dev-uid-allocator pool. Keeps
  // stdout/stderr pipes intact (no journalctl detour), so the existing
  // log capture pipeline works unchanged. nft rules in setup-server.sh
  // (UID range 10001-65000) block all egress except loopback for these
  // UIDs — Squid at 127.0.0.1:3128 handles npm/PyPI registry traffic.
  //
  // Two paths:
  //   (a) API runs as root → exec setpriv directly.
  //   (b) API unprivileged + sandbox-spawn wrapper installed →
  //       `sudo -n /opt/doable/bin/sandbox-spawn <uid> <projectId> ...`
  //       The wrapper validates args and ends with the same setpriv
  //       --reuid/--regid/--clear-groups exec.
  // dev-uid-allocator already refused to allocate when neither path is
  // open, so we don't need to fail-close here — but we do need to pick
  // the right command shape.
  const useUidDrop =
    process.platform === "linux" && typeof opts.uid === "number";
  const useWrapper = useUidDrop && isSandboxWrapperAvailable();
  let effectiveExec: string;
  let effectiveArgs: string[];
  if (useWrapper) {
    effectiveExec = "sudo";
    effectiveArgs = [
      "-n",
      SANDBOX_SPAWN_PATH,
      String(opts.uid),
      opts.projectId,
      opts.execPath,
      ...opts.args,
    ];
  } else if (useUidDrop) {
    effectiveExec = "setpriv";
    effectiveArgs = [
      "--reuid", String(opts.uid),
      "--regid", String(opts.uid),
      "--clear-groups",
      "--",
      opts.execPath,
      ...opts.args,
    ];
  } else {
    effectiveExec = opts.execPath;
    effectiveArgs = opts.args;
  }
  if (useUidDrop) {
    console.log(
      `[vite-jail] uid-drop wrap (${useWrapper ? "sudo+sandbox-spawn" : "setpriv"}): project=${opts.projectId} uid=${opts.uid}`,
    );
  }

  // Optional seccomp filter — gated by DOABLE_DEV_SECCOMP. Default OFF
  // (preserves debuggability for weird workflows: ptrace, perf, strace).
  // When ON, wraps the (already-uid-dropped) command inside
  // `systemd-run --scope --property=SystemCallFilter=...` so the dev
  // process gets a kernel-level syscall deny-list on top of UID drop.
  // `--scope` runs in the calling process's context and forwards
  // stdout/stderr — no journalctl detour, log capture pipeline unchanged.
  // Layered: cgroup (dovault) > scope (systemd-run + seccomp) >
  //          [sudo + sandbox-spawn | setpriv] (uid drop) > next dev.
  const useSeccomp =
    process.platform === "linux" &&
    (process.env.DOABLE_DEV_SECCOMP ?? "off").toLowerCase() === "on";
  let finalExec = effectiveExec;
  let finalArgs = effectiveArgs;
  if (useSeccomp) {
    const scfDeny = "~@debug @module @mount @raw-io @reboot @swap @privileged";
    finalExec = "systemd-run";
    finalArgs = [
      "--scope",
      "--quiet",
      "--collect=yes",
      `--property=SystemCallFilter=${scfDeny}`,
      "--property=NoNewPrivileges=yes",
      "--property=RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6",
      "--",
      effectiveExec,
      ...effectiveArgs,
    ];
    console.log(
      `[vite-jail] seccomp wrap enabled for project=${opts.projectId}`,
    );
  }

  // Raw-spawn helper — used both by the DOABLE_HARDENING=off short-circuit
  // and by the platform-incompatibility fallback below.
  const rawSpawnFallback = async (): Promise<JailedViteResult> => {
    const { spawn } = await import("node:child_process");
    // On Windows, bare commands like "npx" need shell:true to resolve .cmd extensions.
    // setpriv path is Linux-only so this stays Windows-only.
    const needsShell = process.platform === "win32" && !finalExec.includes("/") && !finalExec.includes("\\");
    // stdio: stdin=ignore prevents Next.js 15 / other dev servers from
    // self-exiting when they detect a piped-but-empty stdin (treated as
    // EOF mid-startup on Windows). stdout/stderr stay piped for log
    // capture. Caller can override with opts.stdio.
    const stdio: ["ignore", "pipe", "pipe"] | "ignore" | "inherit" =
      opts.stdio === "ignore" ? "ignore"
      : opts.stdio === "inherit" ? "inherit"
      : ["ignore", "pipe", "pipe"];
    const child = spawn(finalExec, finalArgs, {
      cwd: opts.cwd,
      shell: needsShell,
      stdio,
      env: cleanEnv,
    });
    return {
      process: child,
      pid: child.pid ?? -1,
      kill: () => { child.kill(); },
    };
  };

  // DOABLE_HARDENING=off short-circuits jailing across build, dev-server,
  // and runtime layers in lockstep (debug only).
  if (!shouldJail()) {
    console.log(
      `[vite-jail] DOABLE_HARDENING=${getHardeningLevel()} — skipping vault.spawn jail`,
    );
    return rawSpawnFallback();
  }

  const vault = getVault();

  try {
    // setpriv (and optional seccomp) wrapping flows into the vault.spawn
    // path too, so dovault cgroup limits + fs jail apply ON TOP of UID +
    // syscall isolation. vault.spawn becomes:
    //   cgroup(scope-with-seccomp(setpriv-uid-dropped(next dev ...))).
    // Egress for that uid is independently firewalled by nft.
    const jailed: JailedProcess = await vault.spawn(
      finalExec,
      finalArgs,
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
    return rawSpawnFallback();
  }
}

/** Check if a file is a locked config file (for use in write_file tool). */
export function isLockedConfigFile(filePath: string): boolean {
  return getVault().isLockedFile(filePath);
}
