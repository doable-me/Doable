/**
 * Sandbox argv composer for the per-app data worker.
 *
 * This module is a PURE function — it composes the spawn argv/options for a
 * data worker process but does NOT spawn anything. The pool passes the
 * resulting SandboxSpawnPlan to child_process.spawn.
 *
 * Three profiles:
 *   "bwrap"        — Linux + bwrap binary available. Full namespace isolation.
 *                    degraded=false. Production target.
 *   "sandbox-exec" — macOS. Best-effort dev convenience. degraded=true (v1).
 *   "plain"        — Windows, or Linux fallback when bwrap/uid is unavailable.
 *                    degraded=true.
 *
 * IMPORTANT — kernel-level isolation gap in "plain" and "sandbox-exec" profiles:
 *   Memory and CPU enforcement (cgroup/Job Object), network namespace isolation,
 *   and process-count limits are NOT applied in these degraded paths. This
 *   mirrors how vite-jail degrades off-Linux on dev boxes. Production Linux
 *   deployments always run under the "bwrap" profile which provides full
 *   isolation. A teammate may later wrap the Windows "plain" path in a
 *   Win32 Job Object (JOB_OBJECT_LIMIT_PROCESS_MEMORY + KILL_ON_JOB_CLOSE)
 *   for partial resource capping without kernel namespaces.
 *
 * Missing bwrap binary (Linux only):
 *   The linux branch is gated on process.platform only. The bwrap binary path
 *   is configurable via DOABLE_APP_DB_BWRAP (default "/usr/bin/bwrap") but is
 *   NOT checked for existence here. A missing binary is an operator error
 *   surfaced at spawn time by the pool (child_process.spawn ENOENT). This
 *   matches the vite-jail pattern of treating absent helper binaries as
 *   operator-side misconfiguration rather than a reason to silently degrade.
 */

import * as path from "node:path";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SandboxSpawnPlan {
  /** Executable to pass as the first argument to child_process.spawn. */
  command: string;
  /** Remaining argv (everything after the command). */
  args: string[];
  /** Environment variables to pass to the spawned process. */
  env: Record<string, string>;
  /** Working directory for the spawned process (undefined = inherit). */
  cwd?: string;
  /**
   * Numeric UID from acquireDevUid(), carried through so the pool can apply
   * setpriv/sudo uid-drop the same way vite-jail does. Only meaningful on
   * Linux; undefined on other platforms.
   */
  uid?: number;
  /**
   * true  → kernel-level memory/CPU/network isolation NOT applied.
   * false → full bwrap isolation active (Linux production path).
   */
  degraded: boolean;
  /** Which sandbox profile was selected. */
  profile: "bwrap" | "plain" | "sandbox-exec";
}

export interface ComposeOpts {
  /** UUID of the project this worker serves. */
  projectId: string;
  /**
   * Absolute host-side path to the worker's database directory
   * (e.g. /srv/doable/projects/<id>/.doable/app.db).
   * path.dirname(dataDir) is treated as the .doable dir and bind-mounted
   * into /work/.doable inside the bwrap namespace.
   */
  dataDir: string;
  /** Unix socket path (Linux/macOS). Pool creates the socket before spawn. */
  socketPath?: string;
  /** Named pipe name (Windows). Pool creates before spawn. */
  pipeName?: string;
  /** Absolute path to the worker entrypoint JS/TS file. */
  workerEntry: string;
  /** Node executable to use. Defaults to process.execPath. */
  nodeExec?: string;
  /** Memory cap in MiB. Passed as --memory-mb and NODE_OPTIONS max-old-space-size. */
  memoryMb: number;
  /** Worker self-kill timeout in ms if the pool goes away. */
  idleShutdownMs: number;
  /** Per-query row cap. */
  rowCap: number;
  /** Per-query statement timeout in ms. */
  queryTimeoutMs: number;
  /**
   * UID from acquireDevUid(). Pass null or undefined on non-Linux or when
   * the UID pool is exhausted. The pool is responsible for deciding whether
   * to abort or continue when this is null.
   */
  uid?: number | null;
}

// ─── Internal: platform-parameterised composer ────────────────────────────────

/**
 * Composes the spawn plan for a given platform string. Exported separately from
 * composeSandboxPlan so unit tests can exercise both branches deterministically
 * without mocking process.platform.
 */
export function composeForPlatform(
  platform: NodeJS.Platform,
  opts: ComposeOpts,
): SandboxSpawnPlan {
  const node = opts.nodeExec ?? process.execPath;
  // V8 heap cap: reserve 32 MiB of the budget for the worker runtime overhead,
  // leave the rest as the JS heap. Mirrors the bwrap template in 03-worker-process.md.
  const heapMb = Math.max(64, opts.memoryMb - 32);

  if (platform === "linux") {
    return composeLinuxBwrap(opts, node, heapMb);
  }

  if (platform === "darwin") {
    // TODO(v2): implement sandbox-exec profile with network deny + fs bind-mount.
    // For now, return the plain plan with profile="sandbox-exec" as a best-effort
    // dev marker. The pool will NOT apply any sandbox-exec wrapper in v1.
    return composePlain(opts, node, heapMb, "sandbox-exec");
  }

  // win32 + any other platform
  return composePlain(opts, node, heapMb, "plain");
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Compose the spawn plan for a data worker on the current platform.
 * Returns a SandboxSpawnPlan that can be passed directly to child_process.spawn:
 *   spawn(plan.command, plan.args, { env: plan.env, cwd: plan.cwd })
 */
export function composeSandboxPlan(opts: ComposeOpts): SandboxSpawnPlan {
  return composeForPlatform(process.platform, opts);
}

// ─── Profile composers ────────────────────────────────────────────────────────

function composeLinuxBwrap(
  opts: ComposeOpts,
  node: string,
  heapMb: number,
): SandboxSpawnPlan {
  const bwrap = process.env.DOABLE_APP_DB_BWRAP ?? "/usr/bin/bwrap";

  // The .doable directory is path.dirname(dataDir) — e.g. /srv/.../app.db -> /srv/.../.doable
  const doableDir = path.dirname(opts.dataDir);

  // Socket path inside the namespace: always /work/.doable/db.sock
  // The bind mount maps host doableDir -> /work/.doable so the inode is shared.
  const jailSocketPath = "/work/.doable/db.sock";
  const jailDataDir = "/work/.doable/app.db";

  // bwrap namespace args (per 03-worker-process.md §"Linux: bwrap argv")
  const bwrapArgs: string[] = [
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",
    "--proc", "/proc",
    "--dev", "/dev",
    "--tmpfs", "/tmp",
    // Bind the host-side .doable dir as /work/.doable (rw — worker writes db files)
    "--bind", doableDir, "/work/.doable",
    "--chdir", "/work",
    "--setenv", "DOABLE_PROJECT_ID", opts.projectId,
    "--setenv", "PGLITE_TMPDIR", "/tmp",
    "--setenv", "NODE_OPTIONS", `--max-old-space-size=${heapMb}`,
    "--unshare-net",
    "--unshare-pid",
    "--unshare-uts",
    "--unshare-ipc",
    "--new-session",
    "--die-with-parent",
    "--cap-drop", "ALL",
    "--",
    node,
    opts.workerEntry,
    "--project-id", opts.projectId,
    "--socket-path", jailSocketPath,
    "--data-dir", jailDataDir,
    "--memory-mb", String(opts.memoryMb),
    "--idle-shutdown-ms", String(opts.idleShutdownMs),
    "--row-cap", String(opts.rowCap),
    "--query-timeout-ms", String(opts.queryTimeoutMs),
  ];

  return {
    command: bwrap,
    args: bwrapArgs,
    env: {
      // bwrap inherits a clean env via --setenv directives; we still need to
      // seed a minimal env for the host-side bwrap binary itself.
      PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    },
    uid: typeof opts.uid === "number" ? opts.uid : undefined,
    degraded: false,
    profile: "bwrap",
  };
}

function composePlain(
  opts: ComposeOpts,
  node: string,
  heapMb: number,
  profile: "plain" | "sandbox-exec",
): SandboxSpawnPlan {
  // Derive pipe name for Windows IPC if not supplied.
  const pipeName =
    opts.pipeName ?? `\\\\.\\pipe\\doable-db-${opts.projectId}`;

  const workerArgs: string[] = [
    opts.workerEntry,
    "--project-id", opts.projectId,
    "--pipe-name", pipeName,
    "--data-dir", opts.dataDir,
    "--memory-mb", String(opts.memoryMb),
    "--idle-shutdown-ms", String(opts.idleShutdownMs),
    "--row-cap", String(opts.rowCap),
    "--query-timeout-ms", String(opts.queryTimeoutMs),
  ];

  const env: Record<string, string> = {
    NODE_OPTIONS: `--max-old-space-size=${heapMb}`,
  };
  // Inherit PATH and HOME so the node process can find its own dependencies.
  if (process.env.PATH) env.PATH = process.env.PATH;
  if (process.env.HOME) env.HOME = process.env.HOME;

  return {
    command: node,
    args: workerArgs,
    env,
    cwd: path.dirname(opts.dataDir),
    degraded: true,
    profile,
  };
}
