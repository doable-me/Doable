
import type { ChildProcess } from "node:child_process";
import { spawn as nodeSpawn } from "node:child_process";
import { statSync } from "node:fs";
import { getProjectPath } from "../ai/project-files.js";
import {
  ensureSourceAnnotationsPlugin,
  ensureCanonicalHmrConfig,
} from "./vite-plugin-source-annotations.js";
import { linkDoableSdk } from "./link-sdk.js";
import { spawnJailedVite } from "./vite-jail.js";
import {
  acquireDevUid,
  releaseDevUid,
  isSandboxWrapperAvailable,
} from "../runtime/dev-uid-allocator.js";
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
import { emitPreviewStartFailed } from "./preview-failure-trace.js";

// Keyed by projectId → Set<pkgName>. Deduplicates auto-install attempts so
// duplicate `Could not resolve "<pkg>"` stderr chunks don't race-spawn npm.
const peerDepInstallAttempts: Map<string, Set<string>> = new Map();

/**
 * Per-project batch window: when stderr produces several `Could not resolve`/
 * `Failed to resolve import` lines back-to-back (the common case — App.tsx
 * fails fast on the first run and dumps every unresolved import at once), we
 * collect them all into one `npm install pkg1 pkg2 …` invocation instead of
 * doing N sequential single-pkg installs. The 500 ms debounce window is short
 * enough that a user-perceptible install never waits on it, and long enough
 * that the multi-import stderr burst lands in a single batch.
 */
const pendingInstallBatch: Map<
  string,
  { pkgs: Set<string>; timer: NodeJS.Timeout }
> = new Map();

/**
 * Keyed by projectId → currently-installing pkg(s) + start timestamp. Used by
 * the preview-proxy to render an "Installing dependency…" overlay HTML instead
 * of a blank page while npm install runs. `pkg` may be a comma-separated list
 * when multiple deps are batched into one install.
 */
const installingPeerDep: Map<string, { pkg: string; startedAt: number }> =
  new Map();

/**
 * Read the current install-in-progress state for a project. Returns null when
 * no install is running. Exported for the preview-proxy short-circuit path.
 */
export function getInstallingPeerDep(
  projectId: string,
): { pkg: string; startedAt: number } | null {
  return installingPeerDep.get(projectId) ?? null;
}

/** npm package name validation per https://github.com/npm/validate-npm-package-name */
const NPM_PKG_NAME_RE = /^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9-_.]{0,213}$/;

/** Could not resolve "<pkg>" — esbuild's missing-dep diagnostic from optimizeDeps. */
const MISSING_DEP_RE = /Could not resolve "([^"]+)"/g;

/**
 * Failed to resolve import "<pkg>" from "<file>" — Vite's module-resolution
 * diagnostic for naked imports in source code (different code path from
 * esbuild's optimizeDeps; fires when user code imports a package not in
 * node_modules). Captures relative paths too — caller MUST validate the
 * capture against NPM_PKG_NAME_RE which already excludes "/", ".", "..".
 */
const MISSING_IMPORT_RE = /Failed to resolve import "([^"]+)"/g;

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

// Keeps head+tail so MODULE_NOT_FOUND errors (printed at top of stack) aren't
// lost when truncating long output.
function summarizeOutput(buf: string): string {
  const HEAD = 1500;
  const TAIL = 1500;
  if (buf.length <= HEAD + TAIL) return buf;
  return `${buf.slice(0, HEAD)}\n…[truncated ${buf.length - HEAD - TAIL} chars]…\n${buf.slice(-TAIL)}`;
}

// http-probe and custom signal kinds throw "not implemented" — wired up later.
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

async function doStartDevServer(
  projectId: string,
  opts?: StartDevServerOptions,
): Promise<{ url: string; port: number }> {
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

  // Acquire sandbox UID BEFORE API-side writes (ensureSourceAnnotationsPlugin,
  // linkDoableSdk) — chown -R happens after those writes complete to avoid
  // EACCES when the API uid hits a directory already owned by the sandbox uid.
  // Returns null on Windows/Mac or when chown isn't available.
  let sandboxUid: number | null = acquireDevUid(projectId);

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

  // Write the platform-owned HMR config wrapper on every start so DOABLE_DOMAIN
  // changes and any AI edits to the file are overwritten before the next Vite boot.
  if (adapter.id === "vite-react") {
    try {
      await ensureCanonicalHmrConfig(projectPath, projectId);
    } catch (err) {
      console.warn(
        "[DevServer] Failed to write platform HMR config:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  // Reclaim @doable/sdk to the API uid before linkDoableSdk writes it.
  // The final chown -R below re-owns to sandboxUid. Use the actual euid —
  // the API runs as the doable user (uid 5000), not root.
  if (sandboxUid !== null && process.platform === "linux") {
    const sdkDir = `${projectPath}/node_modules/@doable/sdk`;
    const apiUid = process.geteuid?.() ?? 0;
    const apiGid = process.getegid?.() ?? apiUid;
    await new Promise<void>((resolve) => {
      const useSudo = isSandboxWrapperAvailable();
      const cmd = useSudo ? "sudo" : "chown";
      const args = useSudo
        ? ["-n", "chown", "-R", `${apiUid}:${apiGid}`, sdkDir]
        : ["-R", `${apiUid}:${apiGid}`, sdkDir];
      const ch = nodeSpawn(cmd, args, { stdio: "ignore" });
      ch.on("exit", () => resolve());
      ch.on("error", () => resolve());
    });
  }

  // Ensure @doable/sdk is linked (idempotent — skips if already present)
  try {
    await linkDoableSdk(projectPath);
  } catch (err) {
    console.warn("[DevServer] Failed to link @doable/sdk:", err);
  }

  // chown -R LAST, after all API-side writes. Group = API gid so the API
  // process retains write access via group bits while nft skuid egress
  // filtering keys off the per-project uid (user owner).
  if (sandboxUid !== null) {
    const useSudo = isSandboxWrapperAvailable();
    const apiGid = process.getegid?.() ?? 0;
    const cmd = useSudo ? "sudo" : "chown";
    const args = useSudo
      ? ["-n", "chown", "-R", `${sandboxUid}:${apiGid}`, projectPath]
      : ["-R", `${sandboxUid}:${apiGid}`, projectPath];
    const chownResult = await new Promise<{ ok: boolean; stderr: string; code: number | null }>(
      (resolve) => {
        const ch = nodeSpawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        ch.stderr?.on("data", (d: Buffer) => {
          stderr += d.toString();
        });
        ch.on("exit", (code) => {
          resolve({ ok: code === 0, stderr: stderr.trim(), code });
        });
        ch.on("error", (err) => {
          resolve({ ok: false, stderr: err.message, code: null });
        });
      },
    );
    if (chownResult.ok) {
      // Grant API gid write access + setgid on dirs so new files inherit the gid.
      await new Promise<void>((resolve) => {
        const ch = nodeSpawn(
          "sudo",
          ["-n", "chmod", "-R", "g+rwX", projectPath],
          { stdio: "ignore" },
        );
        ch.on("exit", () => resolve());
        ch.on("error", () => resolve());
      });
      await new Promise<void>((resolve) => {
        const ch = nodeSpawn(
          "sudo",
          ["-n", "find", projectPath, "-type", "d", "-exec", "chmod", "g+s", "{}", "+"],
          { stdio: "ignore" },
        );
        ch.on("exit", () => resolve());
        ch.on("error", () => resolve());
      });
      console.log(
        `[DevServer] Project ${projectId} sandbox uid=${sandboxUid} gid=${process.getegid?.() ?? 0} (chown + chmod g+rwX,g+s applied)`,
      );
    } else {
      // chown failure is fatal for UID-drop: the dropped-priv vite would
      // be unable to read its own project files. Release the UID and
      // null out so the spawn falls back to running as the API user
      // (still inside dovault + seccomp, just without the per-project
      // UID isolation layer).
      console.error(
        `[DevServer] sudo chown failed for ${projectId} (uid ${sandboxUid}): ${chownResult.stderr || `exit code ${chownResult.code}`}`,
      );
      releaseDevUid(projectId);
      sandboxUid = null;
    }
  }

  // Pre-spawn: verify the project dir is still owned by sandboxUid — a
  // concurrent operation could have re-flipped it, which would cause EACCES
  // inside the UID-dropped vite. Attempt one forced re-chown; abort if still mismatched.
  if (sandboxUid !== null && process.platform === "linux") {
    let dirUid: number;
    try {
      dirUid = statSync(projectPath).uid;
    } catch (err) {
      throw new Error(
        `[DevServer] pre-spawn stat failed for ${projectPath}: ${(err as Error).message}`,
      );
    }
    if (dirUid !== sandboxUid) {
      console.warn(
        `[DevServer] WARN: dir uid mismatch (expected=${sandboxUid}, got=${dirUid}) — forcing chown`,
      );
      const useSudo = isSandboxWrapperAvailable();
      const apiGid = process.getegid?.() ?? 0;
      const cmd = useSudo ? "sudo" : "chown";
      const args = useSudo
        ? ["-n", "chown", "-R", `${sandboxUid}:${apiGid}`, projectPath]
        : ["-R", `${sandboxUid}:${apiGid}`, projectPath];
      await new Promise<void>((resolve) => {
        const ch = nodeSpawn(cmd, args, { stdio: "ignore" });
        ch.on("exit", () => resolve());
        ch.on("error", () => resolve());
      });
      // Re-apply group perms after the forced chown
      await new Promise<void>((resolve) => {
        const ch = nodeSpawn(
          "sudo",
          ["-n", "chmod", "-R", "g+rwX", projectPath],
          { stdio: "ignore" },
        );
        ch.on("exit", () => resolve());
        ch.on("error", () => resolve());
      });
      let recheckUid: number;
      try {
        recheckUid = statSync(projectPath).uid;
      } catch (err) {
        throw new Error(
          `[DevServer] pre-spawn re-stat failed for ${projectPath}: ${(err as Error).message}`,
        );
      }
      if (recheckUid !== sandboxUid) {
        throw new Error(
          `Sandbox UID mismatch — aborting spawn to avoid EACCES (expected=${sandboxUid}, got=${recheckUid})`,
        );
      }
    }
  }

  const base = `/preview/${projectId}/`;

  // Resolve env vars; when userId is provided, vault-backed integration
  // credentials are included (user env_vars override the vault).
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

  // For Next.js: alias VITE_* → NEXT_PUBLIC_* and expose bare SUPABASE_URL
  // so server-side code can reach it without a client prefix.
  if (adapter.id === "nextjs-app") {
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

  let outputBuffer = "";

  // Fan dev-server output through the redaction filter chain into the
  // per-project ring buffer. Tolerates filter errors silently.
  const buildId = `dev-${Date.now()}`;
  const startedAtMs = Date.now();
  let workspaceIdForTrace: string | null = null;
  let publisher: BuildEventPublisher | null = null;
  try {
    const [proj2] = await sql<{ workspace_id: string }[]>`
      SELECT workspace_id FROM projects WHERE id = ${projectId}
    `;
    workspaceIdForTrace = proj2?.workspace_id ?? null;
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
    // Clear any sticky "Restarting preview…" overlay set by the previous
    // npm-install success — vite is back, the proxy should pass through now.
    installingPeerDep.delete(projectId);
    console.log(`[DevServer] Project ${projectId} ready at ${url}`);
    resolveReady!();
  };

  const markFailed = (err: Error): void => {
    if (settled) return;
    settled = true;
    installingPeerDep.delete(projectId);
    cleanup(projectId);
    rejectReady!(err);
  };

  child.stdout?.on("data", (data: Buffer) => {
    outputBuffer += data.toString();
  });

  // Spawn the actual `npm install <pkg1> <pkg2> …` for a debounced batch.
  // One install per batch keeps the dev-server restart count low when several
  // imports fail at once (e.g. App.tsx imports lodash + dayjs + uuid that
  // none of which are in package.json — pre-batching this caused 3 sequential
  // installs + 3 restarts + 3 overlay flashes; now it's one of each).
  const runInstallBatch = (pkgs: string[]): void => {
    if (pkgs.length === 0) return;
    const label = pkgs.join(", ");
    console.log(
      `[DevServer] auto-installing missing peer dep${pkgs.length > 1 ? "s" : ""} "${label}" for project ${projectId}`,
    );
    installingPeerDep.set(projectId, { pkg: label, startedAt: Date.now() });
    const npmChild = nodeSpawn(
      "npm",
      ["install", ...pkgs, "--no-audit", "--no-fund"],
      { cwd: projectPath, stdio: ["ignore", "pipe", "pipe"] },
    );
    let npmStderr = "";
    npmChild.stderr?.on("data", (d: Buffer) => {
      npmStderr += d.toString();
    });
    const npmTimer = setTimeout(() => {
      try {
        npmChild.kill("SIGTERM");
      } catch {
        // process may have already exited
      }
    }, 60_000);
    npmChild.on("exit", (code) => {
      clearTimeout(npmTimer);
      if (code === 0) {
        console.log(
          `[DevServer] auto-installed "${label}" for project ${projectId} — restarting dev server`,
        );
        // Replace the in-flight overlay with a "Restarting preview…" placeholder
        // so the iframe doesn't flash blank between SIGTERM + the next vite
        // ready. markReady() at line ~482 clears this entry. If vite hits
        // ANOTHER missing-dep on respawn, the new tryInstallPeerDep overwrites
        // the placeholder with the real install label.
        installingPeerDep.set(projectId, {
          pkg: "Restarting preview…",
          startedAt: Date.now(),
        });
        try {
          child.kill("SIGTERM");
        } catch {
          // already dead
        }
      } else {
        installingPeerDep.delete(projectId);
        console.warn(
          `[DevServer] npm install "${label}" failed for project ${projectId} (exit ${code}): ${npmStderr.slice(-500)}`,
        );
      }
    });
    npmChild.on("error", (err) => {
      clearTimeout(npmTimer);
      installingPeerDep.delete(projectId);
      console.warn(
        `[DevServer] npm install "${label}" spawn error for project ${projectId}: ${err.message}`,
      );
    });
  };

  // Queue a missing-dep into the per-project 500 ms batch window. The window
  // resets on every new dep added, so a back-to-back stderr burst collapses
  // into one install command.
  const tryInstallPeerDep = (pkg: string): void => {
    if (!pkg || !NPM_PKG_NAME_RE.test(pkg)) return;
    let attempted = peerDepInstallAttempts.get(projectId);
    if (!attempted) {
      attempted = new Set<string>();
      peerDepInstallAttempts.set(projectId, attempted);
    }
    if (attempted.has(pkg)) return;
    attempted.add(pkg);

    let batch = pendingInstallBatch.get(projectId);
    if (!batch) {
      batch = { pkgs: new Set<string>(), timer: setTimeout(() => {}, 0) };
      clearTimeout(batch.timer);
      pendingInstallBatch.set(projectId, batch);
    } else {
      clearTimeout(batch.timer);
    }
    batch.pkgs.add(pkg);
    batch.timer = setTimeout(() => {
      const pending = pendingInstallBatch.get(projectId);
      if (!pending) return;
      pendingInstallBatch.delete(projectId);
      runInstallBatch(Array.from(pending.pkgs));
    }, 500);
  };

  child.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    outputBuffer += chunk;
    // Auto-install missing peer deps from BOTH vite paths:
    //   1. esbuild optimizeDeps: `Could not resolve "<pkg>"`
    //   2. vite module resolver: `Failed to resolve import "<pkg>" from "<file>"`
    // Both feed the same dedup/install pipeline. The npm-name validator
    // inside tryInstallPeerDep filters out relative-path captures like
    // "./MissingComponent" that Vite emits via the second regex.
    let match: RegExpExecArray | null;
    MISSING_DEP_RE.lastIndex = 0;
    while ((match = MISSING_DEP_RE.exec(chunk)) !== null) {
      if (match[1]) tryInstallPeerDep(match[1]);
    }
    MISSING_IMPORT_RE.lastIndex = 0;
    while ((match = MISSING_IMPORT_RE.exec(chunk)) !== null) {
      if (match[1]) tryInstallPeerDep(match[1]);
    }
  });

  child.on("error", (err) => {
    console.error(`[DevServer] Error for project ${projectId}:`, err.message);
    emitPreviewStartFailed({
      projectId,
      workspaceId: workspaceIdForTrace,
      userId: opts?.userId ?? null,
      sandboxUid,
      workDir: projectPath,
      exitCode: null,
      signal: null,
      durationMs: Date.now() - startedAtMs,
      npmCmd: `${spec.command} ${spec.args.join(" ")}`,
      framework: adapter.id,
      rawOutput: outputBuffer,
      errorMessage: err.message,
    });
    markFailed(new Error(`Dev server failed to start: ${err.message}`));
  });

  child.on("close", (code, signal) => {
    console.log(
      `[DevServer] Server for project ${projectId} exited with code ${code}`,
    );
    // Return the sandbox UID to the pool whether the exit was graceful
    // or a failure — keeping it allocated would leak a slot.
    releaseDevUid(projectId);
    // Preserve the "Restarting preview…" placeholder set by the npm-install
    // success path — clearing it here would flash the iframe blank between
    // SIGTERM + the next vite ready. Any non-placeholder entry (rare: vite
    // died with a real pending install) is cleared so the proxy stops
    // short-circuiting on stale state.
    const overlay = installingPeerDep.get(projectId);
    if (overlay && overlay.pkg !== "Restarting preview…") {
      installingPeerDep.delete(projectId);
    }
    const pending = pendingInstallBatch.get(projectId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingInstallBatch.delete(projectId);
    }
    if (!settled) {
      emitPreviewStartFailed({
        projectId,
        workspaceId: workspaceIdForTrace,
        userId: opts?.userId ?? null,
        sandboxUid,
        workDir: projectPath,
        exitCode: code,
        signal: signal ?? null,
        durationMs: Date.now() - startedAtMs,
        npmCmd: `${spec.command} ${spec.args.join(" ")}`,
        framework: adapter.id,
        rawOutput: outputBuffer,
        errorMessage: `exited with code ${code} before ready`,
      });
      // Process died before becoming ready — this is a failure
      markFailed(
        new Error(
          `Dev server exited with code ${code} before becoming ready.\nOutput: ${summarizeOutput(outputBuffer)}`,
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
        emitPreviewStartFailed({
          projectId,
          workspaceId: workspaceIdForTrace,
          userId: opts?.userId ?? null,
          sandboxUid,
          workDir: projectPath,
          exitCode: child.exitCode,
          signal: null,
          durationMs: Date.now() - startedAtMs,
          npmCmd: `${spec.command} ${spec.args.join(" ")}`,
          framework: adapter.id,
          rawOutput: outputBuffer,
          errorMessage: `process exited (code ${child.exitCode}) without signaling ready`,
        });
        markFailed(
          new Error(
            `Dev server process exited (code ${child.exitCode}) without signaling ready.\nOutput: ${summarizeOutput(outputBuffer)}`,
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
