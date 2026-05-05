/**
 * Dev server start and initialization logic.
 */

import type { ChildProcess } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import { getProjectPath } from "../ai/project-files.js";
import { ensureSourceAnnotationsPlugin } from "./vite-plugin-source-annotations.js";
import { spawnJailedVite } from "./vite-jail.js";
import { acquireDevUid, releaseDevUid } from "../runtime/dev-uid-allocator.js";
import {
  BuildEventPublisher,
  LogFilterChain,
  buildDefaultFilters,
  loadWorkspaceFilters,
} from "../build-events/index.js";
import { sql } from "../db/index.js";
import { defaultRegistry } from "../frameworks/registry.js";
import { createDevContext } from "../frameworks/context.js";
import type { ReadinessSignal } from "../frameworks/types.js";
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
 * Wait for a spawned dev/serve process to signal readiness.
 *
 * Phase 1 implements `log-substring` only — http-probe and custom kinds throw
 * `not implemented` so they can be wired up later without changing call sites.
 * Rejects on timeout; the caller decides whether to treat that as a fatal
 * error or a benign "process is still alive, assume ready" fallback.
 */
async function awaitReadiness(
  child: ChildProcess,
  signal: ReadinessSignal,
  timeoutMs: number,
): Promise<void> {
  if (signal.kind === "log-substring") {
    const patterns = signal.patterns;
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const onData = (data: Buffer): void => {
        if (done) return;
        const text = data.toString();
        if (patterns.some((p) => text.includes(p))) {
          done = true;
          finish();
          resolve();
        }
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        finish();
        reject(new Error(`readiness-timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      const finish = (): void => {
        clearTimeout(timer);
        child.stdout?.off("data", onData);
        child.stderr?.off("data", onData);
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);
    });
  }
  if (signal.kind === "http-probe") {
    throw new Error("readiness signal 'http-probe' is not implemented in v1");
  }
  if (signal.kind === "custom") {
    throw new Error("readiness signal 'custom' is not implemented in v1");
  }
  throw new Error(
    `Unknown readiness signal kind: ${(signal as { kind: string }).kind}`,
  );
}

/**
 * Internal: actually spawns the dev server. Called only from startDevServer
 * after the in-flight guard. Framework-agnostic — looks up the project's
 * framework adapter and asks it for the spawn spec.
 */
async function doStartDevServer(
  projectId: string,
  opts?: StartDevServerOptions,
): Promise<{ url: string; port: number }> {
  // Resolve the project's framework adapter ONCE per startDevServer call.
  // Defaults to 'vite-react' via the DB column default for legacy rows.
  const [project] = await sql<{ framework_id: string }[]>`
    SELECT framework_id FROM projects WHERE id = ${projectId}
  `;
  if (!project) throw new Error(`Project ${projectId} not found`);
  const adapter = defaultRegistry.getAdapter(project.framework_id);

  const port = await allocatePort();
  const projectPath = getProjectPath(projectId);
  // Internal URL for the reverse proxy to forward to (always 127.0.0.1 to
  // avoid IPv6 resolution issues on Windows where localhost may hit ::1)
  const url = `http://127.0.0.1:${port}`;

  // Per-project sandbox UID (Linux + DOABLE_HARDENING=full). Returns null
  // on Windows/Mac (no setpriv available) or when the 100-slot pool is
  // exhausted. When non-null, chown the project tree so the dropped-priv
  // dev process can read/write it. The API process (root in production)
  // can still read/write because root bypasses ownership.
  const sandboxUid = acquireDevUid(projectId);
  if (sandboxUid !== null) {
    await new Promise<void>((resolve) => {
      const ch = nodeSpawn(
        "chown",
        ["-R", `${sandboxUid}:${sandboxUid}`, projectPath],
        { stdio: "ignore" },
      );
      ch.on("exit", () => resolve());
      ch.on("error", () => resolve()); // chown missing → silent skip; jail still applies
    });
    console.log(
      `[DevServer] Project ${projectId} sandbox uid=${sandboxUid} (chown applied)`,
    );
  }

  console.log(
    `[DevServer] Starting ${adapter.id} dev server for project ${projectId} on port ${port}`,
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

  // Ensure the source annotations Vite plugin is installed for visual editing.
  // (Idempotent; adapter.scaffold also installs it on project create.)
  try {
    ensureSourceAnnotationsPlugin(projectPath);
  } catch (err) {
    console.warn("[DevServer] Failed to inject source annotations plugin:", err);
  }

  // Tell the dev server to use the proxy prefix as its base path so all
  // generated asset URLs include the prefix. This makes the reverse proxy
  // transparent — no HTML rewriting needed.
  const base = `/preview/${projectId}/`;

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

  // Framework-aware env var aliasing: the vault-bridge provides Vite-prefixed
  // client vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). For Next.js
  // projects, also expose them under NEXT_PUBLIC_* and bare names (SUPABASE_URL)
  // so server-side code can access the URL without a client prefix.
  if (adapter.id === "nextjs-app") {
    // VITE_* → NEXT_PUBLIC_* (for client-side bundling)
    for (const [key, value] of Object.entries(userEnvVars)) {
      if (key.startsWith("VITE_") && value) {
        const nextKey = "NEXT_PUBLIC_" + key.slice(5); // VITE_SUPABASE_URL → NEXT_PUBLIC_SUPABASE_URL
        if (!userEnvVars[nextKey]) userEnvVars[nextKey] = value;
      }
    }
    // Also expose SUPABASE_URL (bare, for server-side) from VITE_SUPABASE_URL
    if (userEnvVars["VITE_SUPABASE_URL"] && !userEnvVars["SUPABASE_URL"]) {
      userEnvVars["SUPABASE_URL"] = userEnvVars["VITE_SUPABASE_URL"];
    }
  }

  // Ask the framework adapter for the spawn-shape. The adapter is a pure
  // spec builder — it does NOT spawn. We hand the spec to spawnJailedVite,
  // which still owns the dovault/jail wiring.
  const devCtx = createDevContext({
    projectId,
    projectPath,
    basePath: base,
    host: DEV_SERVER_HOST,
    port,
    env: {
      ...userEnvVars,
      // Inject SDK env vars so @doable/sdk/server can reach the connector-proxy
      // during preview (Next.js Server Actions / API routes need this).
      DOABLE_PROJECT_ID: projectId,
      DOABLE_PROXY_URL: `http://127.0.0.1:${process.env.API_PORT ?? "4000"}/__doable/connector-proxy`,
    },
    userId: opts?.userId,
  });
  const spec = adapter.dev(devCtx);

  const jailed = await spawnJailedVite({
    execPath: spec.command,
    args: spec.args,
    cwd: spec.cwd,
    env: spec.env,
    projectId,
    stdio: "pipe",
    uid: sandboxUid ?? undefined,
  });
  const child = jailed.process;

  const instance: DevServerInstance = {
    projectId,
    port,
    process: child,
    url,
    startedAt: new Date(),
    lastActivityAt: new Date(),
    ready: false,
    readyPromise,
  };

  servers.set(projectId, instance);

  // Buffer combined stdout+stderr for diagnostic messages on early exit.
  // Readiness detection lives in awaitReadiness() against spec.readinessSignal.
  let outputBuffer = "";

  // PRD 03 publisher — fans every dev-server line through the redaction
  // filter chain (PRD 04) and into the per-project ring buffer that
  // `GET /projects/:id/build/stream` tails. Adapter.parseLog runs alongside
  // for structured-event extraction (build_phase_*, build_error, ...).
  // Tolerates filter-chain errors silently — never fails the dev-server
  // start because of a logging side-effect.
  const buildId = `dev-${Date.now()}`;
  let publisher: BuildEventPublisher | null = null;
  try {
    const [proj2] = await sql<{ workspace_id: string }[]>`
      SELECT workspace_id FROM projects WHERE id = ${projectId}
    `;
    const wsFilters = await loadWorkspaceFilters(proj2?.workspace_id ?? "");
    const filterChain = new LogFilterChain([
      ...buildDefaultFilters(),
      ...wsFilters,
    ]);
    publisher = new BuildEventPublisher(projectId, filterChain, {
      projectId,
      projectPath,
      envSecrets: Object.values(userEnvVars).filter((v): v is string => typeof v === "string" && v.length >= 4),
      osUsernames: [process.env.USER, process.env.USERNAME].filter(
        (v): v is string => typeof v === "string" && v.length >= 3,
      ),
    });
    // The framework package now imports BuildEventInput from the
    // build-events package, so adapter.parseLog feeds directly into the
    // publisher's structured-event path. RAW build_log events still flow
    // for every line; parseLog is an enrichment that adds build_error /
    // build_warning (and future build_phase / build_route) events.
    publisher.attach(child, buildId, adapter);
  } catch (err) {
    console.warn(
      `[DevServer] BuildEventPublisher attach failed for ${projectId}:`,
      err instanceof Error ? err.message : err,
    );
    publisher = null;
  }

  const markReady = (): void => {
    if (settled) return;
    settled = true;
    instance.ready = true;
    console.log(`[DevServer] Project ${projectId} ready at ${url}`);
    resolveReady!();
  };

  const markFailed = (err: Error): void => {
    if (settled) return;
    settled = true;
    cleanup(projectId);
    rejectReady!(err);
  };

  child.stdout?.on("data", (data: Buffer) => {
    outputBuffer += data.toString();
  });

  child.stderr?.on("data", (data: Buffer) => {
    outputBuffer += data.toString();
  });

  child.on("error", (err) => {
    console.error(`[DevServer] Error for project ${projectId}:`, err.message);
    markFailed(new Error(`Dev server failed to start: ${err.message}`));
  });

  child.on("close", (code) => {
    console.log(
      `[DevServer] Server for project ${projectId} exited with code ${code}`,
    );
    // Return the sandbox UID to the pool whether the exit was graceful
    // or a failure — keeping it allocated would leak a slot.
    releaseDevUid(projectId);
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

  // Drive readiness via the adapter's spec. On timeout, fall back to the
  // legacy "process-still-alive ⇒ assume ready" behavior so a changed log
  // format never bricks dev-server starts (the HTTP health check below
  // catches genuinely broken servers).
  const readinessTimeoutMs =
    adapter.defaults.devReadinessTimeoutMs ?? STARTUP_TIMEOUT_MS;
  awaitReadiness(child, spec.readinessSignal, readinessTimeoutMs)
    .then(() => markReady())
    .catch(() => {
      if (settled) return;
      if (child.exitCode !== null) {
        markFailed(
          new Error(
            `Dev server process exited (code ${child.exitCode}) without signaling ready.\nOutput: ${outputBuffer.slice(-500)}`,
          ),
        );
      } else {
        console.log(
          `[DevServer] Project ${projectId} startup timeout — process is alive, assuming ready at ${url}`,
        );
        markReady();
      }
    });

  await readyPromise;

  // Health check: verify the server actually responds to HTTP before
  // declaring it ready. The dev server may print "ready in" before it can
  // serve requests (e.g. during dependency optimization).
  const healthUrl = spec.healthUrl;
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
