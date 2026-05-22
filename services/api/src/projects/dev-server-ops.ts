/**
 * Dev server stop, query, and lifecycle operations.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { getProjectPath } from "../ai/project-files.js";
import {
  type StartDevServerOptions,
  servers,
  startingServers,
  cleanup,
} from "./dev-server-core.js";
import { startDevServer } from "./dev-server-start.js";
import { ensureDependencies } from "./file-manager.js";

// ─── Public API ──────────────────────────────────────────

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
  return `http://127.0.0.1:${instance.port}`;
}

/**
 * Same as `getDevServerInternalUrl` but awaits a pending start/restart
 * and the instance's `readyPromise` so the caller never receives a URL
 * pointing at a Vite process that hasn't yet bound its port. This closes
 * the window where preview-proxy would fetch a listening-but-not-ready
 * Vite and get ECONNREFUSED → 502 (bug-20). Returns null only when the
 * server is genuinely not running (no instance, no in-flight start).
 */
export async function getDevServerInternalUrlWhenReady(
  projectId: string,
): Promise<string | null> {
  // If a start or restart is in flight (e.g. triggered by install_package),
  // wait for it to settle before checking the servers map.
  const inflight = startingServers.get(projectId);
  if (inflight) {
    try {
      await inflight;
    } catch {
      // Start failed — fall through so we return null below.
    }
  }

  const instance = servers.get(projectId);
  if (!instance) return null;
  if (instance.process.exitCode !== null) {
    cleanup(projectId);
    return null;
  }

  // Instance exists but may still be warming up (ready === false between
  // spawn + Vite's "ready in" signal + health check). Await its ready
  // promise so the proxy doesn't fire an HTTP request at a closed port.
  if (!instance.ready) {
    try {
      await instance.readyPromise;
    } catch {
      return null;
    }
  }
  return `http://127.0.0.1:${instance.port}`;
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
 * Restart the dev server for a project.
 * Stops the existing server (if running), clears Vite's dependency
 * pre-bundle cache, and starts a fresh server. This is needed after
 * installing new npm packages so Vite re-discovers them.
 */
export async function restartDevServer(
  projectId: string,
  opts?: StartDevServerOptions,
): Promise<{ url: string; port: number }> {
  console.log(`[DevServer] Restarting server for project ${projectId}`);
  await stopDevServer(projectId);

  // Clear Vite's dependency pre-bundle cache so newly installed
  // packages are picked up on the next start.
  const { rm } = await import("node:fs/promises");
  const viteCacheDir = path.join(getProjectPath(projectId), "node_modules", ".vite");
  try {
    await rm(viteCacheDir, { recursive: true, force: true });
    console.log(`[DevServer] Cleared Vite cache at ${viteCacheDir}`);
  } catch {
    // Cache dir may not exist yet — that's fine
  }

  // Re-verify the framework's build tool is still resolvable. install_package
  // calls `npm install <pkg>` which can prune the pnpm-installed devDeps
  // (including vite itself) when there's no package-lock.json. Without this
  // re-check, every install_package → restart cycle dies once with
  // `Cannot find module .../vite/bin/vite.js` before the lazy preview-proxy
  // re-install path eventually re-populates node_modules.
  try {
    await ensureDependencies(projectId);
  } catch (err) {
    console.warn(`[DevServer] ensureDependencies failed during restart for ${projectId}:`, err);
  }

  return startDevServer(projectId, opts);
}

/**
 * Stop all running dev servers. Call on process exit.
 */
export async function stopAllDevServers(): Promise<void> {
  const projectIds = Array.from(servers.keys());
  await Promise.allSettled(projectIds.map((id) => stopDevServer(id)));
}

// ─── Graceful Shutdown ───────────────────────────────────

process.on("SIGINT", () => {
  stopAllDevServers().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  stopAllDevServers().finally(() => process.exit(0));
});
