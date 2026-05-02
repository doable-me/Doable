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
import {
  BuildEventPublisher,
  LogFilterChain,
  buildDefaultFilters,
  loadWorkspaceFilters,
  type LogFilter,
} from "../build-events/index.js";
import { xray } from "../integrations/xray.js";

const projects = projectQueries(sql);

const BUILD_TIMEOUT_MS = 120_000;

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

export interface BuildResult {
  success: boolean;
  outputDir: string;
  log: string;
  durationMs: number;
  error?: string;
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
  // dovault.spawn wants Record<string, string>; strip undefineds.
  const cleanEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(safeEnv)) {
    if (typeof v === "string") cleanEnv[k] = v;
  }

  // Try to spawn under dovault. Falls back to a raw spawn when dovault throws
  // (e.g. unsupported platform / Permission Model unavailable) so builds
  // still work — the fallback is logged so operators can see the gap.
  let proc: ChildProcess;
  try {
    const vault = getBuildVault();
    const jailed = await vault.spawn(spec.command, spec.args, {
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
    proc = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: safeEnv,
    });
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
        resolve({ success: true, outputDir, log, durationMs });
      } else {
        const error = `Build exited with code ${code}`;
        onLog?.(`\nERROR: ${error}\n`);
        resolve({
          success: false,
          outputDir,
          log,
          durationMs,
          error,
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
