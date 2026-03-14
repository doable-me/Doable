import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

const BUILD_TIMEOUT_MS = 60_000;

export interface BuildResult {
  success: boolean;
  outputDir: string;
  log: string;
  durationMs: number;
  error?: string;
}

/**
 * Run a Vite build for a project directory.
 * Returns the build output directory path and build log.
 * Enforces a 60-second timeout.
 */
export async function runBuild(projectDir: string): Promise<BuildResult> {
  const start = Date.now();

  if (!existsSync(projectDir)) {
    return {
      success: false,
      outputDir: "",
      log: "",
      durationMs: Date.now() - start,
      error: `Project directory not found: ${projectDir}`,
    };
  }

  const outputDir = path.join(projectDir, "dist");

  return new Promise<BuildResult>((resolve) => {
    const chunks: string[] = [];

    const proc = spawn("npx", ["vite", "build", "--outDir", "dist"], {
      cwd: projectDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({
        success: false,
        outputDir,
        log: chunks.join(""),
        durationMs: Date.now() - start,
        error: `Build timed out after ${BUILD_TIMEOUT_MS / 1000}s`,
      });
    }, BUILD_TIMEOUT_MS);

    proc.stdout.on("data", (data: Buffer) => {
      chunks.push(data.toString());
    });

    proc.stderr.on("data", (data: Buffer) => {
      chunks.push(data.toString());
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const log = chunks.join("");
      const durationMs = Date.now() - start;

      if (code === 0) {
        resolve({ success: true, outputDir, log, durationMs });
      } else {
        resolve({
          success: false,
          outputDir,
          log,
          durationMs,
          error: `Build exited with code ${code}`,
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
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
