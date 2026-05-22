/**
 * Dev server shared state, types, and port management.
 */

import { type ChildProcess } from "node:child_process";
import { createServer as createTcpServer } from "node:net";

// ─── Configuration ───────────────────────────────────────

export const PORT_RANGE_START = 3100;
export const PORT_RANGE_END = 3200;
export const DEV_SERVER_HOST = process.env.DEV_SERVER_HOST ?? "127.0.0.1";
export const STARTUP_TIMEOUT_MS = 90_000;

// Idle dev servers eat ~666 MB each (next-server + launcher). Sweep every
// 5 minutes; kill any server with no preview-proxy traffic for IDLE_MS.
// Defaults: enabled, 15-minute idle timeout. Set DEV_SERVER_IDLE_MS=0 to
// disable. Lower it for tight memory budgets, raise it for laptops where
// devs leave previews open all day. Each touch from the preview-proxy
// resets the timer (touchActivity below).
export const DEV_SERVER_IDLE_MS = parseInt(
  process.env.DEV_SERVER_IDLE_MS ?? String(15 * 60 * 1000),
  10,
);
export const DEV_SERVER_SWEEP_INTERVAL_MS = parseInt(
  process.env.DEV_SERVER_SWEEP_INTERVAL_MS ?? String(5 * 60 * 1000),
  10,
);

// ─── Types ───────────────────────────────────────────────

export interface DevServerInstance {
  projectId: string;
  port: number;
  process: ChildProcess;
  url: string;
  startedAt: Date;
  /** Last preview-proxy hit (touchActivity). Drives idle eviction. */
  lastActivityAt: Date;
  ready: boolean;
  readyPromise: Promise<void>;
}

/**
 * Optional caller context for dev-server startup.
 *
 * `userId` enables vault-backed integration credentials to be injected into
 * the spawned Vite process via `resolveProjectEnvVars`. Without it, only the
 * user's `env_vars` table is consulted (legacy behavior). The workspace is
 * looked up from the project record inside `resolveProjectEnvVars`, so callers
 * never need to pass it.
 */
export interface StartDevServerOptions {
  userId?: string;
}

// ─── Server Registry ─────────────────────────────────────

export const servers = new Map<string, DevServerInstance>();
export const usedPorts = new Set<number>();

/**
 * In-flight start promises. Prevents two concurrent startDevServer()
 * calls for the same project from spawning two Vite processes.
 */
export const startingServers = new Map<string, Promise<{ url: string; port: number }>>();

// ─── Port Management ─────────────────────────────────────

/**
 * Check if a port is actually free on the system.
 * This catches orphaned Vite processes from previous API server runs
 * that are still occupying ports even though our in-memory set is empty.
 */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createTcpServer();
    server.once("error", () => {
      // Port is in use (EADDRINUSE or similar)
      resolve(false);
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, DEV_SERVER_HOST);
  });
}

/**
 * Allocate the next available port in the range.
 * Checks both our in-memory registry AND the actual OS to detect
 * orphaned processes from previous server runs.
 */
export async function allocatePort(): Promise<number> {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (usedPorts.has(port)) continue;

    // Actually check if the port is free on the system
    const free = await isPortFree(port);
    if (free) {
      usedPorts.add(port);
      return port;
    }

    // Port is occupied by something outside our registry (orphaned process, etc.)
    console.warn(
      `[DevServer] Port ${port} is occupied by an external process — skipping`,
    );
  }
  throw new Error(
    `No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}. ` +
      `${usedPorts.size} ports are tracked, and others may be occupied by orphaned processes.`,
  );
}

/**
 * Release a port back to the pool.
 */
export function releasePort(port: number): void {
  usedPorts.delete(port);
}

// ─── Cleanup ─────────────────────────────────────────────

export function cleanup(projectId: string): void {
  const instance = servers.get(projectId);
  if (instance) {
    releasePort(instance.port);
    servers.delete(projectId);
  }
}

// ─── Idle eviction ───────────────────────────────────────

/**
 * Mark project as recently active. Called by the preview-proxy on every
 * proxied request so idle eviction can use real foreground traffic
 * (not just process aliveness) as the keep-alive signal.
 */
export function touchActivity(projectId: string): void {
  const inst = servers.get(projectId);
  if (inst) inst.lastActivityAt = new Date();
}

/**
 * Kill any dev server with no preview-proxy hit for DEV_SERVER_IDLE_MS.
 * Returns the projectIds that were swept so callers (admin views, tests)
 * can audit what happened.
 */
export function sweepIdleDevServers(now: number = Date.now()): string[] {
  if (DEV_SERVER_IDLE_MS <= 0) return [];
  const swept: string[] = [];
  for (const [projectId, inst] of servers) {
    const idleFor = now - inst.lastActivityAt.getTime();
    if (idleFor < DEV_SERVER_IDLE_MS) continue;
    if (inst.process.exitCode !== null) continue; // already dead
    try {
      inst.process.kill();
    } catch {
      /* swallow — close handler will still fire and call cleanup */
    }
    swept.push(projectId);
    console.log(
      `[DevServer] idle-evict project=${projectId} idle=${Math.round(idleFor / 1000)}s pid=${inst.process.pid}`,
    );
  }
  return swept;
}

let sweeperTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic idle sweeper. Idempotent — calling twice is a no-op.
 * Wired from `index.ts` once at API boot. Sweeper runs every
 * DEV_SERVER_SWEEP_INTERVAL_MS (default 5 min); .unref() lets the process
 * exit naturally without waiting for the next tick.
 */
export function startIdleEvictionSweeper(): void {
  if (sweeperTimer) return;
  if (DEV_SERVER_IDLE_MS <= 0) {
    console.log(`[DevServer] idle eviction disabled (DEV_SERVER_IDLE_MS=0)`);
    return;
  }
  sweeperTimer = setInterval(() => {
    try {
      sweepIdleDevServers();
    } catch (err) {
      console.warn(`[DevServer] sweepIdleDevServers failed:`, err);
    }
  }, DEV_SERVER_SWEEP_INTERVAL_MS);
  sweeperTimer.unref();
  console.log(
    `[DevServer] idle eviction enabled: sweep every ${Math.round(
      DEV_SERVER_SWEEP_INTERVAL_MS / 1000,
    )}s, kill after ${Math.round(DEV_SERVER_IDLE_MS / 1000)}s idle`,
  );
}

// ─── Admin snapshot ──────────────────────────────────────

export interface DevServerSnapshotEntry {
  projectId: string;
  port: number;
  pid: number | undefined;
  url: string;
  startedAt: string;
  uptimeMs: number;
  ready: boolean;
  alive: boolean;
}

/**
 * Serializable snapshot of every Vite dev-server currently tracked in
 * the in-memory `servers` map. Used by the platform-admin
 * /admin/dev-servers view to show editor sessions in flight.
 *
 * Note: `pid` may be undefined if the spawn already exited but the
 * registry hasn't been cleaned up yet — use `alive` to filter.
 */
export function getDevServersSnapshot(): DevServerSnapshotEntry[] {
  const now = Date.now();
  const out: DevServerSnapshotEntry[] = [];
  for (const inst of servers.values()) {
    out.push({
      projectId: inst.projectId,
      port: inst.port,
      pid: inst.process.pid,
      url: inst.url,
      startedAt: inst.startedAt.toISOString(),
      uptimeMs: now - inst.startedAt.getTime(),
      ready: inst.ready,
      alive: inst.process.exitCode === null,
    });
  }
  return out;
}
