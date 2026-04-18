/**
 * Dev server start and initialization logic.
 */

import path from "node:path";
import { getProjectPath } from "../ai/project-files.js";
import { ensureSourceAnnotationsPlugin } from "./vite-plugin-source-annotations.js";
import { spawnJailedVite } from "./vite-jail.js";
import { buildSafeEnv } from "./safe-env.js";
import {
  type DevServerInstance,
  type StartDevServerOptions,
  servers,
  startingServers,
  allocatePort,
  cleanup,
  DEV_SERVER_HOST,
  STARTUP_TIMEOUT_MS,
} from "./dev-server-core.js";

/**
 * Start a Vite dev server for the given project.
 * If already running, returns the existing server info.
 * If a start is already in-flight, waits for that instead of spawning a duplicate.
 */
export async function startDevServer(
  projectId: string,
  opts?: StartDevServerOptions,
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

  // If another caller is already starting this project, wait for that
  const inflight = startingServers.get(projectId);
  if (inflight) {
    return inflight;
  }

  const startPromise = doStartDevServer(projectId, opts);
  startingServers.set(projectId, startPromise);

  try {
    return await startPromise;
  } finally {
    startingServers.delete(projectId);
  }
}

/**
 * Internal: actually spawns the Vite process. Called only from startDevServer
 * after the in-flight guard.
 */
async function doStartDevServer(
  projectId: string,
  opts?: StartDevServerOptions,
): Promise<{ url: string; port: number }> {
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

  // Ensure the source annotations Vite plugin is installed for visual editing
  try {
    ensureSourceAnnotationsPlugin(projectPath);
  } catch (err) {
    console.warn("[DevServer] Failed to inject source annotations plugin:", err);
  }

  // Tell Vite to use the proxy prefix as its base path so all generated
  // asset URLs (/@vite/client, /src/main.tsx, etc.) include the prefix.
  // This makes the reverse proxy transparent — no HTML rewriting needed.
  const base = `/preview/${projectId}/`;

  // Invoke Vite directly via Node instead of relying on .bin shims,
  // which may not be created by npm install on Node 24+/Windows.
  const viteEntry = path.join(projectPath, "node_modules", "vite", "bin", "vite.js");

  // Resolve env vars for the dev server. When `opts.userId` is provided, this
  // also pulls vault-backed integration credentials (Phase 1C of the
  // integration↔AI chat bridge); user `env_vars` always override the vault.
  // The workspace is looked up from the project record inside the resolver,
  // so we only thread `userId` here.
  let userEnvVars: Record<string, string> = {};
  try {
    const { resolveProjectEnvVars } = await import("../env/resolve.js");
    userEnvVars = await resolveProjectEnvVars(
      projectId,
      "development",
      undefined,
      opts?.userId,
    );
  } catch (err) {
    console.warn("[DevServer] Failed to resolve env vars:", err);
  }

  const jailed = await spawnJailedVite({
    execPath: process.execPath,
    args: [viteEntry, "--host", DEV_SERVER_HOST, "--port", String(port), "--strictPort", "--base", base],
    cwd: projectPath,
    env: buildSafeEnv(userEnvVars, {
      FORCE_COLOR: "0",
      BROWSER: "none",
    }),
    projectId,
    stdio: "pipe",
  });
  const child = jailed.process;

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

  // Health check: verify the server actually responds to HTTP before
  // declaring it ready. Vite may print "ready in" before it can serve
  // requests (e.g. during dependency optimization).
  const healthUrl = `http://localhost:${port}/preview/${projectId}/`;
  const maxHealthChecks = 10;
  let healthy = false;
  for (let i = 0; i < maxHealthChecks; i++) {
    try {
      const res = await fetch(healthUrl, {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok || res.status === 304) {
        healthy = true;
        break;
      }
    } catch {
      // Server not responding yet — wait and retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!healthy) {
    // Process may have died during health checks
    if (child.exitCode !== null) {
      cleanup(projectId);
      throw new Error(
        `Dev server process exited (code ${child.exitCode}) during health check.`,
      );
    }
    // Server is alive but not responding — log a warning but continue,
    // since it may start responding shortly after
    console.warn(
      `[DevServer] Health check failed for project ${projectId} on port ${port} — proceeding anyway`,
    );
  }

  // Return the proxy-based URL (relative path) — the frontend prepends the API base
  return { url: `/preview/${projectId}/`, port };
}
