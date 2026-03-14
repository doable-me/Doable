/**
 * Vite Dev Server Manager
 *
 * Spawns and manages Vite dev servers for each project.
 * Each project gets a unique port in the range 3100-3200.
 * The preview iframe in the editor points to these dev servers.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { getProjectPath } from "../ai/project-files.js";

// ─── Configuration ───────────────────────────────────────

const PORT_RANGE_START = 3100;
const PORT_RANGE_END = 3200;
const DEV_SERVER_HOST = process.env.DEV_SERVER_HOST ?? "0.0.0.0";

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
 * Allocate the next available port in the range.
 */
function allocatePort(): number {
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  throw new Error(
    `No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}. ` +
      `${usedPorts.size} servers are running.`,
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
  // Return existing server if running
  const existing = servers.get(projectId);
  if (existing) {
    // Wait for it to be ready if it's still starting
    await existing.readyPromise;
    return { url: existing.url, port: existing.port };
  }

  const port = allocatePort();
  const projectPath = getProjectPath(projectId);
  const url = `http://localhost:${port}`;

  console.log(
    `[DevServer] Starting Vite dev server for project ${projectId} on port ${port}`,
  );

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

  child.stdout?.on("data", (data: Buffer) => {
    const text = data.toString();
    outputBuffer += text;

    // Vite prints the local URL when ready
    if (!instance.ready && (text.includes("Local:") || text.includes("ready in"))) {
      instance.ready = true;
      console.log(`[DevServer] Project ${projectId} ready at ${url}`);
      resolveReady!();
    }
  });

  child.stderr?.on("data", (data: Buffer) => {
    const text = data.toString();
    outputBuffer += text;
    // Vite sometimes outputs to stderr too
    if (!instance.ready && (text.includes("Local:") || text.includes("ready in"))) {
      instance.ready = true;
      console.log(`[DevServer] Project ${projectId} ready at ${url}`);
      resolveReady!();
    }
  });

  child.on("error", (err) => {
    console.error(`[DevServer] Error for project ${projectId}:`, err.message);
    cleanup(projectId);
    if (!instance.ready) {
      rejectReady!(new Error(`Dev server failed to start: ${err.message}`));
    }
  });

  child.on("close", (code) => {
    console.log(
      `[DevServer] Server for project ${projectId} exited with code ${code}`,
    );
    cleanup(projectId);
    if (!instance.ready) {
      rejectReady!(
        new Error(
          `Dev server exited with code ${code} before becoming ready.\nOutput: ${outputBuffer.slice(-500)}`,
        ),
      );
    }
  });

  // Timeout: if Vite doesn't signal ready in 30s, consider it ready anyway
  // (sometimes the output format changes between versions)
  const startupTimeout = setTimeout(() => {
    if (!instance.ready) {
      instance.ready = true;
      console.log(
        `[DevServer] Project ${projectId} startup timeout — assuming ready at ${url}`,
      );
      resolveReady!();
    }
  }, 30_000);

  // Clean up timeout when ready
  readyPromise.then(() => clearTimeout(startupTimeout)).catch(() => clearTimeout(startupTimeout));

  await readyPromise;
  return { url, port };
}

/**
 * Stop the dev server for a project.
 */
export async function stopDevServer(projectId: string): Promise<void> {
  const instance = servers.get(projectId);
  if (!instance) return;

  console.log(`[DevServer] Stopping server for project ${projectId}`);

  // Try graceful shutdown first
  instance.process.kill("SIGTERM");

  // Force kill after 5 seconds
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
 * Get the dev server URL for a project.
 * Returns null if no server is running.
 */
export function getDevServerUrl(projectId: string): string | null {
  const instance = servers.get(projectId);
  if (!instance) return null;
  return instance.url;
}

/**
 * Check if a dev server is running for the project.
 */
export function isRunning(projectId: string): boolean {
  const instance = servers.get(projectId);
  return instance !== undefined && instance.process.exitCode === null;
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
      url: s.url,
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
