import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";

const BUILD_TIMEOUT_MS = 120_000;

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

  const outputDir = path.join(projectDir, "dist");

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

  return new Promise<BuildResult>((resolve) => {
    const chunks: string[] = [];

    const proc = spawn("npx", ["vite", "build", "--outDir", "dist"], {
      cwd: projectDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...userEnvVars,
        NODE_ENV: "production",
      },
    });

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

    proc.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      chunks.push(text);
      onLog?.(text);
    });

    proc.stderr.on("data", (data: Buffer) => {
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
