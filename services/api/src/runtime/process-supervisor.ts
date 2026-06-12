/**
 * Process supervisor for deployed long-lived app servers — the non-root /
 * non-systemd activation path.
 *
 * Why this exists
 * ───────────────
 * The {@link node-standalone} runtime adapter activates a published SSR app by
 * writing a `/etc/systemd/system/doable-app@<slug>.service.d` drop-in and
 * running `systemctl`. That assumes the API can manage systemd — i.e. it runs
 * as root. The secure-by-default install runs the API as an UNPRIVILEGED user
 * (`doable`) whose sudoers allow-list grants only `sandbox-spawn` + scoped
 * `chown`/`chmod` — NOT `systemctl` and NOT writing `/etc/systemd`. So the
 * systemd path throws EACCES, the app server never starts, and the published
 * URL falls through Caddy's wildcard to the platform site.
 *
 * The PREVIEW runtime already runs per-project Node servers without root or
 * systemd: a child process the API supervises, reverse-proxied by port. This
 * module brings the DEPLOY path to the same model — a detached, supervised
 * child process bound to 127.0.0.1:PORT that the existing Caddy `addProcessRoute`
 * reverse-proxies. Works unprivileged AND on hosts with no systemd at all
 * (Docker), so SSR apps deploy out-of-the-box everywhere.
 *
 * Lifecycle:
 *   - startProcessApp(): kill any prior instance, spawn `node dist-server/<entry>`
 *     DETACHED (own process group, unref'd) so it survives API/tsx-watch reloads,
 *     write a pidfile, and health-probe the port before returning.
 *   - stopProcessApp(): SIGTERM the recorded process group, drop the pidfile.
 *   - reconcileProcessAppsOnBoot(): on API start, re-spawn any process-kind
 *     deploy whose port is no longer listening (host reboot recovery) — the
 *     userspace analogue of systemd's Restart=on-failure + reconcile.
 *
 * Security: the child inherits a CURATED env (PATH/HOME/locale + the adapter's
 * per-app env), never the API's full secret-bearing environment. It runs at the
 * same trust level as the API user; per-project UID isolation via sandbox-spawn
 * is a follow-up hardening layer (the preview path's model).
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { createConnection } from "node:net";
import path from "node:path";
import { sql } from "../db/index.js";
import { getProjectPath } from "../ai/project-files.js";

const PIDFILE = ".doable-runtime.json";
const LOGFILE = ".doable-server.log";

interface RuntimeState {
  pid: number;
  port: number;
  host: string;
  entry: string;
}

function distServerDirFor(projectDir: string): string {
  return path.join(projectDir, "dist-server");
}

function pidfilePath(distServerDir: string): string {
  return path.join(distServerDir, PIDFILE);
}

export function readRuntimeState(distServerDir: string): RuntimeState | null {
  try {
    return JSON.parse(readFileSync(pidfilePath(distServerDir), "utf-8")) as RuntimeState;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Short TCP connect probe — true when something is accepting on host:port. */
export function tcpProbe(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    const done = (ok: boolean): void => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.once("timeout", () => done(false));
  });
}

/** Entry priority mirrors node-standalone.resolveStandaloneEntry. */
function resolveEntry(distServerDir: string): string {
  for (const candidate of ["server.js", "index.mjs", "index.js", "entry.mjs"]) {
    if (existsSync(path.join(distServerDir, candidate))) return candidate;
  }
  return "server.js";
}

/** Curated env — never leak the API's secret-bearing process.env to the app. */
function curatedEnv(extra: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["PATH", "HOME", "LANG", "LC_ALL", "TZ", "TERM"]) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return { ...out, ...extra };
}

/** SIGTERM the recorded process group (and drop the pidfile). Idempotent. */
export function stopProcessApp(projectDir: string): void {
  const distServerDir = distServerDirFor(projectDir);
  const st = readRuntimeState(distServerDir);
  if (st?.pid && st.pid > 0) {
    // detached child is a process-group leader → negative pid kills the group.
    try {
      process.kill(-st.pid, "SIGTERM");
    } catch {
      try {
        process.kill(st.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
  try {
    rmSync(pidfilePath(distServerDir), { force: true });
  } catch {
    /* ignore */
  }
}

export interface StartProcessAppInput {
  projectDir: string;
  /** Entry filename under dist-server/ (e.g. "index.mjs"). Auto-resolved if omitted. */
  entry?: string;
  host: string;
  port: number;
  /** Per-app env from the runtime adapter (NODE_ENV/PORT/HOST/etc). */
  env?: Record<string, string>;
}

/**
 * Start (or restart) a deployed app server as a detached child process bound to
 * host:port. Resolves with the pid once the port is accepting connections;
 * rejects if the process exits early or never binds.
 */
export async function startProcessApp(input: StartProcessAppInput): Promise<number> {
  const distServerDir = distServerDirFor(input.projectDir);
  if (!existsSync(distServerDir)) {
    throw new Error(`dist-server not staged at ${distServerDir}`);
  }
  const entry = input.entry ?? resolveEntry(distServerDir);
  const entryPath = path.join(distServerDir, entry);
  if (!existsSync(entryPath)) {
    throw new Error(`deploy server entry not found: ${entryPath}`);
  }

  // Replace any prior instance for this project before binding the port.
  stopProcessApp(input.projectDir);

  const logPath = path.join(distServerDir, LOGFILE);
  let logFd: number;
  try {
    logFd = openSync(logPath, "a");
  } catch {
    logFd = openSync("/dev/null", "a");
  }

  const env = curatedEnv({
    ...(input.env ?? {}),
    NODE_ENV: "production",
    PORT: String(input.port),
    HOST: input.host,
    HOSTNAME: input.host,
  });

  const child = spawn(process.execPath, [entryPath], {
    cwd: distServerDir,
    env,
    stdio: ["ignore", logFd, logFd],
    detached: true,
  });
  child.unref();

  const pid = child.pid ?? -1;
  if (pid <= 0) {
    throw new Error("failed to spawn deploy server (no pid)");
  }
  try {
    writeFileSync(
      pidfilePath(distServerDir),
      JSON.stringify({ pid, port: input.port, host: input.host, entry } satisfies RuntimeState),
      "utf-8",
    );
  } catch {
    /* non-fatal — reconcile can re-resolve entry */
  }

  // Wait for the port to accept connections (≤ ~15s), failing fast if the
  // process dies first.
  for (let i = 0; i < 30; i++) {
    if (await tcpProbe(input.host, input.port, 800)) return pid;
    if (!pidAlive(pid)) {
      let tail = "";
      try {
        tail = readFileSync(logPath, "utf-8").slice(-600);
      } catch {
        /* ignore */
      }
      throw new Error(
        `deploy server (pid ${pid}) exited before binding ${input.host}:${input.port}. Log tail:\n${tail}`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `deploy server did not bind ${input.host}:${input.port} within 15s (see ${logPath})`,
  );
}

/**
 * Boot-time reconcile: re-spawn any process-kind deploy whose port is no longer
 * listening. Recovers from a host reboot (all detached children gone) without
 * systemd. No-op when the project_runtime table / dist-server is absent.
 */
export async function reconcileProcessAppsOnBoot(): Promise<void> {
  let rows: Array<{ project_id: string; listen_addr: string | null }>;
  try {
    rows = await sql<{ project_id: string; listen_addr: string | null }[]>`
      SELECT project_id, listen_addr
      FROM project_runtime
      WHERE runtime_kind = 'process'
        AND state = 'running'
        AND systemd_unit LIKE 'doable-proc:%'
        AND listen_addr IS NOT NULL
    `;
  } catch {
    return;
  }
  for (const row of rows) {
    const [host, portStr] = String(row.listen_addr ?? "").split(":");
    const port = parseInt(portStr ?? "", 10);
    if (!host || !Number.isFinite(port)) continue;
    if (await tcpProbe(host, port, 800)) continue; // already serving
    const projectDir = getProjectPath(row.project_id);
    if (!existsSync(distServerDirFor(projectDir))) continue;
    try {
      const pid = await startProcessApp({ projectDir, host, port });
      console.log(
        `[process-supervisor] reconciled deployed app ${row.project_id} on ${host}:${port} (pid ${pid})`,
      );
    } catch (err) {
      console.warn(
        `[process-supervisor] reconcile failed for ${row.project_id}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
