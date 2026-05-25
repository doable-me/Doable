/**
 * Per-app DB worker pool (PRD per-app-db 02 §"Pool management", 03 §Lifecycle).
 *
 * One supervised PGlite worker process per project. Mirrors the shape of
 * services/api/src/projects/dev-server-core.ts (registry Map + startingWorkers
 * race map + idle sweeper with .unref()) but keys on projectId and the value is
 * a WorkerHandle, not a DevServerInstance.
 *
 * The API owns the IPC listener: net.createServer().listen(endpoint) is created
 * BEFORE the worker is spawned, so the worker connects on boot and accept() is
 * race-free, and restarting the API implicitly invalidates every worker socket.
 *
 * Public API (the data-plane routes and the builtin MCP transport call this):
 *   - acquireWorker(projectId, opts?)         spawn-or-reuse, awaits ready
 *   - sendToWorker(handle, req)               one IPC round-trip
 *   - runOnProject(projectId, req)            acquire + send convenience
 *   - sweepIdleWorkers / startDataPoolSweeper / shutdownDataPool
 *   - getDataPoolSnapshot                     admin/test introspection
 */

import net from "node:net";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm, chmod } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { FrameDecoder, encodeFrame } from "./ipc.js";
import { composeSandboxPlan } from "./sandbox-args.js";
import { recordWorkerSpawned, recordWorkerExited, recordQuery } from "./telemetry.js";
import {
  DOABLE_APP_DB_READY_MS,
  DOABLE_APP_DB_IDLE_MS,
  DOABLE_APP_DB_SWEEP_MS,
  DOABLE_APP_DB_MAX_WORKERS,
  DOABLE_APP_DB_MEMORY_MB,
  DOABLE_APP_DB_ROW_CAP,
  DOABLE_APP_DB_QUERY_TIMEOUT_MS,
  DOABLE_APP_DB_EXEC_TIMEOUT_MS,
  DOABLE_APP_DB_SHUTDOWN_GRACE_MS,
  DOABLE_APP_DB_QUEUE_DEPTH,
} from "./config.js";
import type { WorkerRequest, WorkerResponse } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Sudo wrapper that validates args + execs setpriv (installed by setup-v3). */
const SANDBOX_SPAWN_PATH = "/opt/doable/bin/sandbox-spawn";

/**
 * Apply the per-project UID drop to the worker spawn — the SAME mechanism
 * vite-jail uses for the preview process (setpriv, or sudo + sandbox-spawn when
 * the API is unprivileged). The worker is the UNTRUSTED side (it runs PGlite +
 * arbitrary RLS-gated SQL), so it must run as the project's sandbox uid, not the
 * API uid. Gated on `uid !== null`: acquireDevUid only hands out a uid when a
 * drop path is actually viable (API is root, OR the sudo sandbox-spawn wrapper is
 * installed), so this is a transparent no-op on dev/Docker hosts that lack the
 * sandbox infra (there the worker keeps running as the API user, as before).
 * NOTE: on the dist/bwrap path `command` is `bwrap`, so the wrap becomes
 * `setpriv -- bwrap …` (uid-drop then namespace). The setpriv/sudo drop itself is
 * proven by vite-jail; the setpriv+bwrap stacking should be smoke-tested on a
 * hardened dist runner before prod flag-on (per the original TODO).
 */
function applyUidDrop(
  command: string,
  args: string[],
  uid: number | null,
  useWrapper: boolean,
  projectId: string,
): { command: string; args: string[] } {
  if (process.platform !== "linux" || typeof uid !== "number") {
    return { command, args };
  }
  if (useWrapper) {
    return {
      command: "sudo",
      args: ["-n", SANDBOX_SPAWN_PATH, String(uid), projectId, command, ...args],
    };
  }
  return {
    command: "setpriv",
    args: ["--reuid", String(uid), "--regid", String(uid), "--clear-groups", "--", command, ...args],
  };
}

interface PendingRequest {
  resolve: (r: WorkerResponse) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

export interface WorkerHandle {
  projectId: string;
  uid: number | null;
  endpoint: string;
  dataDir: string;
  server: net.Server;
  process: ChildProcess;
  sock: net.Socket | null;
  startedAt: Date;
  lastActivityAt: Date;
  inflight: Map<string, PendingRequest>;
  ready: boolean;
  readyPromise: Promise<void>;
  /** Why the worker was asked to stop (idle|lru|shutdown); undefined => crash. */
  exitReason?: string;
}

export interface AcquireOpts {
  /** Override the PGlite data dir (tests). Default: <projectPath>/.doable/app.db */
  dataDir?: string;
  /** Override the IPC endpoint (tests). Default: pipe (win) / db.sock (unix). */
  endpoint?: string;
}

class DataPoolError extends Error {
  constructor(public code: "DATA_POOL_EXHAUSTED" | "WORKER_READY_TIMEOUT" | "WORKER_CRASHED" | "TIMEOUT", message: string) {
    super(message);
    this.name = "DataPoolError";
  }
}
export { DataPoolError };

const workers = new Map<string, WorkerHandle>();
const startingWorkers = new Map<string, Promise<WorkerHandle>>();

// Lazy import to avoid a hard module cycle with file-manager at load time.
async function defaultProjectDataDir(projectId: string): Promise<string> {
  const { getProjectPath } = await import("../projects/file-manager.js");
  return path.join(getProjectPath(projectId), ".doable", "app.db");
}

function defaultEndpoint(projectId: string, dataDir: string): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\doable-db-${projectId}`;
  }
  // unix domain socket alongside the data dir's parent (.doable/db.sock)
  return path.join(path.dirname(dataDir), "db.sock");
}

/**
 * Resolve how to launch the worker. In a built deployment we run the compiled
 * dist entry under node; under tsx (dev/test) we run the .ts source via the tsx
 * loader. On Linux the bwrap plan from sandbox-args wraps the invocation; on
 * win32/macOS/dev it degrades to a plain child (documented in sandbox-args).
 */
function workerInvocation(workerArgs: string[], opts: { projectId: string; dataDir: string; endpoint: string; uid: number | null }): { command: string; args: string[] } {
  const isDist = __dirname.split(path.sep).includes("dist");
  const entry = path.join(__dirname, isDist ? "index.js" : "index.ts");

  if (process.platform === "linux" && isDist) {
    const plan = composeSandboxPlan({
      projectId: opts.projectId,
      dataDir: opts.dataDir,
      socketPath: opts.endpoint,
      workerEntry: entry,
      memoryMb: DOABLE_APP_DB_MEMORY_MB,
      idleShutdownMs: DOABLE_APP_DB_IDLE_MS + 60_000,
      rowCap: DOABLE_APP_DB_ROW_CAP,
      queryTimeoutMs: DOABLE_APP_DB_QUERY_TIMEOUT_MS,
      uid: opts.uid,
    });
    // plan.uid is applied by applyUidDrop() in spawnWorker (setpriv / sudo+
    // sandbox-spawn), the same mechanism vite-jail uses — so the worker drops to
    // the per-project DAC uid on top of this bwrap mount-namespace isolation.
    // (The setpriv+bwrap stacking wants a smoke test on a hardened dist runner;
    // off-Linux/dev hosts return uid=null and run unwrapped, as before.)
    return { command: plan.command, args: plan.args };
  }

  const pre = isDist ? [] : ["--import", "tsx"];
  return { command: process.execPath, args: [...pre, entry, ...workerArgs] };
}

function evictIfAtCap(): void {
  if (workers.size < DOABLE_APP_DB_MAX_WORKERS) return;
  // Prefer evicting an idle worker with zero inflight; pick the LRU.
  let victim: WorkerHandle | null = null;
  for (const h of workers.values()) {
    if (h.inflight.size > 0) continue;
    if (!victim || h.lastActivityAt.getTime() < victim.lastActivityAt.getTime()) victim = h;
  }
  if (!victim) {
    throw new DataPoolError("DATA_POOL_EXHAUSTED", "all workers busy at MAX_WORKERS cap");
  }
  killWorker(victim, "lru");
}

export async function acquireWorker(projectId: string, opts: AcquireOpts = {}): Promise<WorkerHandle> {
  const existing = workers.get(projectId);
  if (existing && existing.process.exitCode === null) {
    existing.lastActivityAt = new Date();
    await existing.readyPromise;
    return existing;
  }
  const starting = startingWorkers.get(projectId);
  if (starting) return starting;

  const startPromise = spawnWorker(projectId, opts).finally(() => startingWorkers.delete(projectId));
  startingWorkers.set(projectId, startPromise);
  return startPromise;
}

/**
 * chown a path to `uid:apiGid` via `sudo -n chown -R` (the same NOPASSWD wrapper
 * dev-server-start uses). The API runs unprivileged (euid 5000), so it cannot
 * chown to a sandbox uid directly — it must shell out through sudo, which the
 * v3 sudoers allowlist permits ONLY for `chown -R <num>:<num> .../projects/*`
 * (the `-R` and the numeric `uid:gid` shape are part of the sudoers pattern —
 * a non-recursive `chown` is rejected, so we always pass `-R`; it is harmless
 * on a single file/socket). Best-effort: resolves regardless of outcome
 * (off-Linux / wrapper-absent dev hosts run the worker as the API uid and never
 * need this).
 */
async function chownForWorker(targetPath: string, uid: number, apiGid: number, useSudo: boolean): Promise<void> {
  const ownerArg = `${uid}:${apiGid}`;
  const cmd = useSudo ? "sudo" : "chown";
  const args = useSudo ? ["-n", "chown", "-R", ownerArg, targetPath] : ["-R", ownerArg, targetPath];
  await new Promise<void>((resolve) => {
    const ch = spawn(cmd, args, { stdio: "ignore" });
    ch.on("exit", () => resolve());
    ch.on("error", () => resolve());
  });
}

async function spawnWorker(projectId: string, opts: AcquireOpts): Promise<WorkerHandle> {
  const spawnT0 = Date.now();
  evictIfAtCap();

  const dataDir = opts.dataDir ?? (await defaultProjectDataDir(projectId));
  await mkdir(dataDir, { recursive: true });
  const endpoint = opts.endpoint ?? defaultEndpoint(projectId, dataDir);

  // Per-project uid (same identity as vite-jail). null off-Linux/dev.
  // Resolved BEFORE the data-dir/socket permission setup because the worker
  // runs as this uid (uid-drop), so the on-disk PGlite store and the IPC
  // socket must be owned/accessible by it, not by the API uid.
  let uid: number | null = null;
  let useWrapper = false;
  try {
    const m = await import("../runtime/dev-uid-allocator.js");
    uid = m.acquireDevUid(projectId);
    useWrapper = m.isSandboxWrapperAvailable();
  } catch {
    uid = null;
  }

  // Data-dir ownership / permissions (POSIX; no-op on Windows — NTFS ACLs).
  // The worker process opens PGlite *as the dropped uid*, so when a uid drop is
  // in effect the data dir (and its .doable parent) must be owned by that uid —
  // otherwise PGlite.create() gets EACCES and the worker dies before "ready"
  // (surfaced upstream as WORKER_UNAVAILABLE). Group stays the API gid so the
  // API keeps group access. When uid is null (off-Linux / dev / no wrapper) the
  // worker runs as the API uid, so the original owner-only 0700/0750 is correct.
  if (process.platform !== "win32") {
    if (typeof uid === "number") {
      const apiGid = process.getegid?.() ?? uid;
      // chmod 0770 FIRST (the API still owns the dir here, so it may chmod; once
      // we chown to the worker uid the API loses chmod rights on it). 0770 keeps
      // API-gid access; the worker (owner) gets full access. Then chown
      // recursively to the worker uid (group = API gid) so PGlite, running as the
      // dropped uid, can open the store. `chown -R` on the data dir also covers
      // anything beneath it; the .doable parent is chowned too so the dropped uid
      // can traverse into app.db. Both go through the same sudo path.
      await chmod(dataDir, 0o770).catch(() => {});
      await chmod(path.dirname(dataDir), 0o770).catch(() => {});
      await chownForWorker(dataDir, uid, apiGid, useWrapper).catch(() => {});
      await chownForWorker(path.dirname(dataDir), uid, apiGid, useWrapper).catch(() => {});
    } else {
      await chmod(dataDir, 0o700).catch(() => {});
      await chmod(path.dirname(dataDir), 0o750).catch(() => {});
    }
  }

  // Listener up BEFORE spawn so the worker can connect immediately.
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // On unix, remove a stale socket file first.
    if (process.platform !== "win32") {
      rm(endpoint, { force: true }).finally(() => server.listen(endpoint, () => resolve()));
    } else {
      server.listen(endpoint, () => resolve());
    }
  });

  // Tighten the IPC socket so no sibling uid can connect (PRD 03 §IPC / 04 §3
  // layer 8). Windows named pipes use SDDL instead. When the worker drops to a
  // per-project uid it must be able to *connect* to the socket — a 0600 socket
  // owned by the API uid would reject the worker's connect() with EACCES (the
  // worker then exits 2 with no "ready", surfaced as WORKER_UNAVAILABLE). So we
  // hand the socket to the worker uid (group = API gid, mode 0660: worker owner
  // + API group, still closed to all other sandbox uids).
  if (process.platform !== "win32") {
    if (typeof uid === "number") {
      const apiGid = process.getegid?.() ?? uid;
      // chmod FIRST (API still owns the socket), THEN chown to the worker uid so
      // the dropped worker can connect() (a 0600 socket owned by the API uid
      // rejects the worker's connect with EACCES). 0660 = worker owner + API
      // group, still closed to all other sandbox uids.
      await chmod(endpoint, 0o660).catch(() => {});
      await chownForWorker(endpoint, uid, apiGid, useWrapper).catch(() => {});
    } else {
      await chmod(endpoint, 0o600).catch(() => {});
    }
  }

  const workerArgs = [
    "--project-id", projectId,
    process.platform === "win32" ? "--pipe-name" : "--socket-path", endpoint,
    "--data-dir", dataDir,
    "--memory-mb", String(DOABLE_APP_DB_MEMORY_MB),
    "--row-cap", String(DOABLE_APP_DB_ROW_CAP),
    "--query-timeout-ms", String(DOABLE_APP_DB_QUERY_TIMEOUT_MS),
    "--exec-timeout-ms", String(DOABLE_APP_DB_EXEC_TIMEOUT_MS),
    "--idle-shutdown-ms", String(DOABLE_APP_DB_IDLE_MS + 60_000),
  ];
  const invocation = workerInvocation(workerArgs, { projectId, dataDir, endpoint, uid });
  // Drop to the per-project sandbox uid (no-op when uid is null — see applyUidDrop).
  const { command, args } = applyUidDrop(invocation.command, invocation.args, uid, useWrapper, projectId);
  if (typeof uid === "number") {
    console.log(`[data-pool] uid-drop (${useWrapper ? "sudo+sandbox-spawn" : "setpriv"}): project=${projectId} uid=${uid}`);
  }

  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });

  let resolveReady!: () => void;
  let rejectReady!: (e: Error) => void;
  const readyPromise = new Promise<void>((res, rej) => { resolveReady = res; rejectReady = rej; });

  const handle: WorkerHandle = {
    projectId, uid, endpoint, dataDir, server, process: child, sock: null,
    startedAt: new Date(), lastActivityAt: new Date(),
    inflight: new Map(), ready: false, readyPromise,
  };

  const readyTimer = setTimeout(() => {
    if (!handle.ready) {
      rejectReady(new DataPoolError("WORKER_READY_TIMEOUT", `worker for ${projectId} did not signal ready in ${DOABLE_APP_DB_READY_MS}ms`));
      killWorker(handle, "ready_timeout");
    }
  }, DOABLE_APP_DB_READY_MS);
  readyTimer.unref();

  server.on("connection", (sock) => {
    handle.sock = sock;
    const decoder = new FrameDecoder();
    sock.on("data", (chunk: Buffer) => {
      let frames: object[];
      try {
        frames = decoder.push(chunk);
      } catch {
        return; // malformed frame from worker — ignore, crash handler covers exit
      }
      for (const f of frames) {
        const obj = f as Record<string, unknown>;
        if (obj.event === "ready") {
          handle.ready = true;
          clearTimeout(readyTimer);
          resolveReady();
          continue;
        }
        const id = obj.id as string | undefined;
        if (id && handle.inflight.has(id)) {
          const pending = handle.inflight.get(id)!;
          clearTimeout(pending.timer);
          handle.inflight.delete(id);
          pending.resolve(obj as unknown as WorkerResponse);
        }
      }
    });
    sock.on("error", () => {});
  });

  child.on("exit", (code, signal) => {
    clearTimeout(readyTimer);
    recordWorkerExited(projectId, (handle.exitReason ?? "crash") as import("./telemetry.js").EvictionReason);
    const err = new DataPoolError("WORKER_CRASHED", `worker for ${projectId} exited (code=${code} signal=${signal})`);
    if (!handle.ready) rejectReady(err);
    for (const [, pending] of handle.inflight) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    handle.inflight.clear();
    try { server.close(); } catch { /* noop */ }
    if (workers.get(projectId) === handle) workers.delete(projectId);
    if (uid !== null) {
      import("../runtime/dev-uid-allocator.js").then((m) => m.releaseDevUid(projectId)).catch(() => {});
    }
  });

  workers.set(projectId, handle);

  try {
    await readyPromise;
  } catch (err) {
    workers.delete(projectId);
    throw err;
  }
  handle.lastActivityAt = new Date();
  recordWorkerSpawned(projectId, Date.now() - spawnT0);
  return handle;
}

export function sendToWorker(handle: WorkerHandle, req: Omit<WorkerRequest, "id"> & { id?: string }): Promise<WorkerResponse> {
  if (!handle.sock || handle.process.exitCode !== null) {
    return Promise.reject(new DataPoolError("WORKER_CRASHED", `worker for ${handle.projectId} is not connected`));
  }
  // Per-project pending-queue cap (PRD 07): a worker is single-conn and serial,
  // so unbounded inflight just grows memory behind a slow query. Reject past the
  // configured depth so the caller surfaces 503/backpressure instead.
  if (handle.inflight.size >= DOABLE_APP_DB_QUEUE_DEPTH) {
    return Promise.reject(new DataPoolError("DATA_POOL_EXHAUSTED", `worker for ${handle.projectId} queue depth ${DOABLE_APP_DB_QUEUE_DEPTH} exceeded`));
  }
  const id = req.id ?? randomUUID();
  const timeoutMs = (req.timeout_ms ?? DOABLE_APP_DB_QUERY_TIMEOUT_MS) + DOABLE_APP_DB_SHUTDOWN_GRACE_MS;
  handle.lastActivityAt = new Date();
  const t0 = Date.now();
  const promise = new Promise<WorkerResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      handle.inflight.delete(id);
      reject(new DataPoolError("TIMEOUT", `request ${id} to ${handle.projectId} timed out`));
    }, timeoutMs);
    timer.unref();
    handle.inflight.set(id, { resolve, reject, timer });
    try {
      handle.sock!.write(encodeFrame({ ...req, id }));
    } catch (err) {
      clearTimeout(timer);
      handle.inflight.delete(id);
      reject(err as Error);
    }
  });
  return promise.then((resp) => {
    // The pool layer does not parse SQL; exec frames are DDL-ish, query frames
    // cover SELECT/DML. The precise statement type is recorded at the audit layer.
    const stmtType = req.op === "exec" ? "ddl" : "other";
    recordQuery(handle.projectId, stmtType, Date.now() - t0, resp.ok, resp.ok ? undefined : resp.error.code);
    return resp;
  });
}

export async function runOnProject(projectId: string, req: Omit<WorkerRequest, "id">, opts?: AcquireOpts): Promise<WorkerResponse> {
  const handle = await acquireWorker(projectId, opts);
  return sendToWorker(handle, req);
}

function killWorker(handle: WorkerHandle, reason: string): void {
  handle.exitReason = reason;
  try {
    // graceful: ask the worker to flush+close, then SIGTERM, then SIGKILL.
    if (handle.sock && handle.process.exitCode === null) {
      handle.sock.write(encodeFrame({ id: "__shutdown__", op: "shutdown" }));
    }
  } catch { /* noop */ }
  setTimeout(() => {
    if (handle.process.exitCode === null) {
      try { handle.process.kill("SIGTERM"); } catch { /* noop */ }
      setTimeout(() => {
        if (handle.process.exitCode === null) {
          try { handle.process.kill("SIGKILL"); } catch { /* noop */ }
        }
      }, 2000).unref();
    }
  }, 200).unref();
}

export function sweepIdleWorkers(now: number = Date.now()): string[] {
  if (DOABLE_APP_DB_IDLE_MS <= 0) return [];
  const swept: string[] = [];
  for (const [projectId, handle] of workers) {
    if (handle.inflight.size > 0) continue;
    if (now - handle.lastActivityAt.getTime() < DOABLE_APP_DB_IDLE_MS) continue;
    if (handle.process.exitCode !== null) continue;
    killWorker(handle, "idle");
    swept.push(projectId);
  }
  return swept;
}

let sweeperTimer: NodeJS.Timeout | null = null;
export function startDataPoolSweeper(): void {
  if (sweeperTimer) return;
  if (DOABLE_APP_DB_IDLE_MS <= 0) return;
  sweeperTimer = setInterval(() => {
    try { sweepIdleWorkers(); } catch { /* noop */ }
  }, DOABLE_APP_DB_SWEEP_MS);
  sweeperTimer.unref();
}

export async function shutdownDataPool(): Promise<void> {
  if (sweeperTimer) { clearInterval(sweeperTimer); sweeperTimer = null; }
  const all = [...workers.values()];
  for (const handle of all) killWorker(handle, "shutdown");
  // give workers a moment to exit
  await new Promise((r) => setTimeout(r, 300));
  for (const handle of all) {
    if (handle.process.exitCode === null) { try { handle.process.kill("SIGKILL"); } catch { /* noop */ } }
    try { handle.server.close(); } catch { /* noop */ }
  }
  workers.clear();
}

export interface DataWorkerSnapshot {
  projectId: string;
  pid: number | undefined;
  uid: number | null;
  ready: boolean;
  inflight: number;
  startedAt: string;
  uptimeMs: number;
  idleMs: number;
  alive: boolean;
}

export function getDataPoolSnapshot(): DataWorkerSnapshot[] {
  const now = Date.now();
  return [...workers.values()].map((h) => ({
    projectId: h.projectId,
    pid: h.process.pid,
    uid: h.uid,
    ready: h.ready,
    inflight: h.inflight.size,
    startedAt: h.startedAt.toISOString(),
    uptimeMs: now - h.startedAt.getTime(),
    idleMs: now - h.lastActivityAt.getTime(),
    alive: h.process.exitCode === null,
  }));
}
