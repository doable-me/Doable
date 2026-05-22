import { spawn, type ChildProcess } from "node:child_process";
import { getProjectPath } from "./project-files.js";
import { defaultRegistry } from "../frameworks/registry.js";
import { createBuildContext, createDevContext } from "../frameworks/context.js";

// ─── Types ────────────────────────────────────────────────

export interface BuildResult {
  success: boolean;
  output: string;
  errors: string[];
  warnings: string[];
  duration: number;
}

interface DevServerHandle {
  process: ChildProcess;
  port: number;
  url: string;
}

// ─── State ────────────────────────────────────────────────

const activeDevServers = new Map<string, DevServerHandle>();

// ─── Build ────────────────────────────────────────────────

export async function build(projectId: string): Promise<BuildResult> {
  const cwd = getProjectPath(projectId);
  const startTime = Date.now();

  // PRD 02 §10.2 flags this file as a parallel duplicate of deploy/builder.ts.
  // Both paths now route through the same FrameworkAdapter so the eventual
  // collapse is mechanical. For today every project is vite-react via the
  // 'vite-react' default in migration 060; threading framework_id from the
  // project row is a Phase 2 follow-up.
  const adapter = defaultRegistry.getAdapter("vite-react");
  const buildSpec = adapter.build(createBuildContext({
    projectId,
    projectPath: cwd,
    basePath: "/",
    target: "production",
    env: {},
  }));

  return new Promise<BuildResult>((resolve) => {
    const child = spawn(buildSpec.command, buildSpec.args, {
      cwd: buildSpec.cwd,
      shell: true,
      stdio: "pipe",
      env: { ...process.env, ...buildSpec.env, FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      resolve({
        success: false,
        output: "",
        errors: [`Failed to start build: ${err.message}`],
        warnings: [],
        duration: Date.now() - startTime,
      });
    });

    child.on("close", (code) => {
      const output = stdout + stderr;
      const errors = extractErrors(output);
      const warnings = extractWarnings(output);

      resolve({
        success: code === 0,
        output,
        errors,
        warnings,
        duration: Date.now() - startTime,
      });
    });

    // Kill after 2 minutes
    setTimeout(() => {
      child.kill("SIGTERM");
    }, 120_000);
  });
}

// ─── Dev Server ───────────────────────────────────────────

export async function startDev(
  projectId: string,
  port = 5173,
): Promise<{ url: string; port: number }> {
  // Stop existing server if running
  await stopDev(projectId);

  const cwd = getProjectPath(projectId);

  // Same migration note as build() above. Hardcoded vite-react until Phase 2
  // threads framework_id from the project row. Note: this AI dev path uses
  // basePath "/" (different from preview-proxy's /preview/{id}/), so the
  // adapter's spec args won't include --base, matching today's behaviour.
  const adapter = defaultRegistry.getAdapter("vite-react");
  const devSpec = adapter.dev(createDevContext({
    projectId,
    projectPath: cwd,
    basePath: "/",
    host: "127.0.0.1",
    port,
    env: {},
  }));

  const child = spawn(devSpec.command, devSpec.args, {
    cwd: devSpec.cwd,
    shell: true,
    stdio: "pipe",
    env: { ...process.env, ...devSpec.env, FORCE_COLOR: "0" },
  });

  const handle: DevServerHandle = {
    process: child,
    port,
    url: `http://localhost:${port}`,
  };

  activeDevServers.set(projectId, handle);

  child.on("close", () => {
    activeDevServers.delete(projectId);
  });

  child.on("error", () => {
    activeDevServers.delete(projectId);
  });

  // Wait for server to be ready
  await waitForReady(child, 15_000);

  return { url: handle.url, port: handle.port };
}

export async function stopDev(projectId: string): Promise<void> {
  const handle = activeDevServers.get(projectId);
  if (!handle) return;

  handle.process.kill("SIGTERM");
  activeDevServers.delete(projectId);

  // Wait for process to exit
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 3000);
    handle.process.on("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

export function getDevServer(
  projectId: string,
): { url: string; port: number } | null {
  const handle = activeDevServers.get(projectId);
  if (!handle) return null;
  return { url: handle.url, port: handle.port };
}

// ─── Build Error Extraction ───────────────────────────────

export function getBuildErrors(output: string): string[] {
  return extractErrors(output);
}

function extractErrors(output: string): string[] {
  const errors: string[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.toLowerCase().includes("error") &&
      !trimmed.toLowerCase().includes("warning")
    ) {
      errors.push(trimmed);
    }
  }

  return errors;
}

function extractWarnings(output: string): string[] {
  const warnings: string[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().includes("warning")) {
      warnings.push(trimmed);
    }
  }

  return warnings;
}

// ─── Helpers ──────────────────────────────────────────────

function waitForReady(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve(); // Resolve anyway; server might still be starting
    }, timeoutMs);

    const onData = (data: Buffer) => {
      const text = data.toString();
      if (text.includes("ready in") || text.includes("Local:")) {
        clearTimeout(timeout);
        child.stdout?.off("data", onData);
        resolve();
      }
    };

    child.stdout?.on("data", onData);

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Dev server failed to start: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Dev server exited with code ${code}`));
      }
    });
  });
}

// ─── Cleanup ──────────────────────────────────────────────

export async function stopAllDevServers(): Promise<void> {
  const ids = Array.from(activeDevServers.keys());
  await Promise.all(ids.map((id) => stopDev(id)));
}

process.on("SIGTERM", () => void stopAllDevServers());
process.on("SIGINT", () => void stopAllDevServers());
