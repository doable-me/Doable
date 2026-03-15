/**
 * Vite Dev Server Manager
 *
 * Spawns and manages Vite dev servers for each project.
 * Each project gets a unique port in the range 3100-3200.
 * The preview iframe in the editor points to these dev servers.
 *
 * Key invariant: each project ID maps to exactly ONE dev server
 * on a unique port, serving files from that project's directory.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { getProjectPath } from "../ai/project-files.js";

// ─── Configuration ───────────────────────────────────────

const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 3200;
const DEV_SERVER_HOST = process.env.DEV_SERVER_HOST ?? "0.0.0.0";
const STARTUP_TIMEOUT_MS = 30_000;

// ─── Types ───────────────────────────────────────────────

interface DevServerInstance {
  projectId: string;
  port: number;
  process: ChildProcess;
  url: string;
  startedAt: Date;
  ready: boolean;
  readyPromise: Promise<void>;
}

// ─── Server Registry ─────────────────────────────────────

const servers = new Map<string, DevServerInstance>();
const usedPorts = new Set<number>();

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
    server.listen(port, "0.0.0.0");
  });
}

/**
 * Allocate the next available port in the range.
 * Checks both our in-memory registry AND the actual OS to detect
 * orphaned processes from previous server runs.
 */
async function allocatePort(): Promise<number> {
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
function releasePort(port: number): void {
  usedPorts.delete(port);
}

// ─── Public API ──────────────────────────────────────────

/**
 * Start a Vite dev server for the given project.
 * If already running, returns the existing server info.
 */
export async function startDevServer(
  projectId: string,
): Promise<{ url: string; port: number }> {
  // Return existing server if running and the process is still alive
  const existing = servers.get(projectId);
  if (existing) {
    if (existing.process.exitCode === null) {
      // Process is still alive — wait for it to be ready
      await existing.readyPromise;
      // Return proxy-based URL, not the internal localhost URL
      return { url: `/preview/${projectId}/`, port: existing.port };
    }
    // Process died — clean up the stale entry before starting fresh
    console.warn(
      `[DevServer] Stale server entry for project ${projectId} (process exited with code ${existing.process.exitCode}) — cleaning up`,
    );
    cleanup(projectId);
  }

  const port = await allocatePort();
  const projectPath = getProjectPath(projectId);
  // Internal URL for the reverse proxy to forward to (always localhost)
  const url = `http://localhost:${port}`;

  console.log(
    `[DevServer] Starting Vite dev server for project ${projectId} on port ${port}`,
  );
  console.log(`[DevServer]   Directory: ${projectPath}`);

  // Use a settled flag to prevent race between timeout, close, and ready
  let settled = false;
  let resolveReady: () => void;
  let rejectReady: (err: Error) => void;
  const readyPromise = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const child = spawn(
    "npx",
    ["vite", "--host", DEV_SERVER_HOST, "--port", String(port), "--strictPort"],
    {
      cwd: projectPath,
      shell: true,
      stdio: "pipe",
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        // Prevent Vite from opening browser
        BROWSER: "none",
      },
    },
  );

  const instance: DevServerInstance = {
    projectId,
    port,
    process: child,
    url,
    startedAt: new Date(),
    ready: false,
    readyPromise,
  };

  servers.set(projectId, instance);

  // Listen for "ready" signal from Vite
  let outputBuffer = "";

  const markReady = () => {
    if (settled) return;
    settled = true;
    instance.ready = true;
    console.log(`[DevServer] Project ${projectId} ready at ${url}`);
    resolveReady!();
  };

  const markFailed = (err: Error) => {
    if (settled) return;
    settled = true;
    cleanup(projectId);
    rejectReady!(err);
  };

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    outputBuffer += text;

    // Vite prints the local URL when ready
    if (!settled && (text.includes("Local:") || text.includes("ready in"))) {
      markReady();
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    outputBuffer += text;
    // Vite sometimes outputs to stderr too
    if (!settled && (text.includes("Local:") || text.includes("ready in"))) {
      markReady();
    }
  });

  child.on("error", (err) => {
    console.error(`[DevServer] Error for project ${projectId}:`, err.message);
    markFailed(new Error(`Dev server failed to start: ${err.message}`));
  });

  child.on("close", (code) => {
    console.log(
      `[DevServer] Server for project ${projectId} exited with code ${code}`,
    );
    if (!settled) {
      // Process died before becoming ready — this is a failure
      markFailed(
        new Error(
          `Dev server exited with code ${code} before becoming ready.\nOutput: ${outputBuffer.slice(-500)}`,
        ),
      );
    } else {
      // Process died after becoming ready — clean up the registry
      // so the next call to startDevServer will spawn a new one
      cleanup(projectId);
    }
  });

  // Timeout: if Vite doesn't signal ready in STARTUP_TIMEOUT_MS,
  // check if the process is still alive before assuming ready.
  const startupTimeout = setTimeout(() => {
    if (settled) return;

    if (child.exitCode !== null) {
      // Process already exited — don't assume ready
      markFailed(
        new Error(
          `Dev server process exited (code ${child.exitCode}) without signaling ready.\nOutput: ${outputBuffer.slice(-500)}`,
        ),
      );
    } else {
      // Process is still alive but hasn't printed the expected output.
      // This can happen if the Vite output format changed. Assume ready.
      console.log(
        `[DevServer] Project ${projectId} startup timeout — process is alive, assuming ready at ${url}`,
      );
      markReady();
    }
  }, STARTUP_TIMEOUT_MS);

  // Clean up timeout when settled
  readyPromise
    .then(() => clearTimeout(startupTimeout))
    .catch(() => clearTimeout(startupTimeout));

  await readyPromise;
  // Return the proxy-based URL (relative path) — the frontend prepends the API base
  return { url: `/preview/${projectId}/`, port };
}

/**
 * Stop the dev server for a project.
 */
export async function stopDevServer(projectId: string): Promise<void> {
  const instance = servers.get(projectId);
  if (!instance) return;

  console.log(`[DevServer] Stopping server for project ${projectId}`);

  // If already exited, just clean up
  if (instance.process.exitCode !== null) {
    cleanup(projectId);
    return;
  }

  // On Windows, shell: true means the child is cmd.exe; SIGTERM doesn't
  // propagate to the grandchild (node/vite). Use taskkill for tree-kill.
  if (process.platform === "win32" && instance.process.pid) {
    try {
      spawn("taskkill", ["/pid", String(instance.process.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } catch {
      // Fall back to regular kill
      instance.process.kill("SIGTERM");
    }
  } else {
    instance.process.kill("SIGTERM");
  }

  // Force kill after 5 seconds (non-Windows fallback)
  const forceKillTimeout = setTimeout(() => {
    try {
      instance.process.kill("SIGKILL");
    } catch {
      // Process may already be dead
    }
  }, 5_000);

  // Wait for process to exit
  await new Promise<void>((resolve) => {
    instance.process.on("close", () => {
      clearTimeout(forceKillTimeout);
      resolve();
    });

    // If already exited
    if (instance.process.exitCode !== null) {
      clearTimeout(forceKillTimeout);
      resolve();
    }
  });

  cleanup(projectId);
}

/**
 * Get the proxy-based preview URL for a project.
 * This is what the frontend iframe should load — it goes through
 * the API server's reverse proxy so it works from any machine.
 * Returns null if no server is running.
 */
export function getDevServerUrl(projectId: string): string | null {
  const instance = servers.get(projectId);
  if (!instance) return null;
  // Verify the process is still alive
  if (instance.process.exitCode !== null) {
    cleanup(projectId);
    return null;
  }
  // Return the proxy path — the frontend will prepend the API base URL
  return `/preview/${projectId}/`;
}

/**
 * Get the internal (localhost) URL for the Vite dev server.
 * Used by the reverse proxy to forward requests. This always
 * points to localhost because the proxy runs on the same machine.
 * Returns null if no server is running.
 */
export function getDevServerInternalUrl(projectId: string): string | null {
  const instance = servers.get(projectId);
  if (!instance) return null;
  // Verify the process is still alive
  if (instance.process.exitCode !== null) {
    cleanup(projectId);
    return null;
  }
  return `http://localhost:${instance.port}`;
}

/**
 * Check if a dev server is running for the project.
 */
export function isRunning(projectId: string): boolean {
  const instance = servers.get(projectId);
  if (!instance) return false;
  if (instance.process.exitCode !== null) {
    // Process died — clean up the stale entry
    cleanup(projectId);
    return false;
  }
  return true;
}

/**
 * Get info about all running dev servers.
 */
export function getRunningServers(): Array<{
  projectId: string;
  port: number;
  url: string;
  startedAt: Date;
  ready: boolean;
}> {
  return Array.from(servers.values())
    .filter((s) => s.process.exitCode === null)
    .map((s) => ({
      projectId: s.projectId,
      port: s.port,
      url: `/preview/${s.projectId}/`,
      startedAt: s.startedAt,
      ready: s.ready,
    }));
}

/**
 * Stop all running dev servers. Call on process exit.
 */
export async function stopAllDevServers(): Promise<void> {
  const projectIds = Array.from(servers.keys());
  await Promise.allSettled(projectIds.map((id) => stopDevServer(id)));
}

// ─── Cleanup ─────────────────────────────────────────────

function cleanup(projectId: string): void {
  const instance = servers.get(projectId);
  if (instance) {
    releasePort(instance.port);
    servers.delete(projectId);
  }
}

// ─── Graceful Shutdown ───────────────────────────────────

process.on("SIGINT", () => {
  stopAllDevServers().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  stopAllDevServers().finally(() => process.exit(0));
});
