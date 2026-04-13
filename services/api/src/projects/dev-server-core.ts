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

// ─── Types ───────────────────────────────────────────────

export interface DevServerInstance {
  projectId: string;
  port: number;
  process: ChildProcess;
  url: string;
  startedAt: Date;
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
