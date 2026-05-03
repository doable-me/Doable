/**
 * Hono framework adapter.
 *
 * Per devframeworkPRD/02-framework-abstraction.md and PRD 06's `process`
 * runtime kind. Hono is a lightweight Node-family server framework: dev
 * runs through `tsx watch`, production runs the TypeScript-compiled entry
 * via plain `node`.
 *
 * Behaviour summary (consult `defaults` for static metadata):
 *   - dev:   `npx tsx watch src/index.ts`         (long-lived, file-watch reload)
 *   - build: `npx tsc`                              -> `dist/`
 *   - serve: `node dist/index.js`                   (production runtime)
 *
 * NOT registered yet — wiring lives in `adapters/index.ts` + `init.ts`.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  BuildSpec,
  DevSpec,
  FrameworkAdapter,
  InstallResult,
  ScaffoldResult,
  ServeSpec,
} from "../types.js";
import type {
  BuildContext,
  DevContext,
  FrameworkContext,
  ScaffoldContext,
  ServeContext,
} from "../context.js";

// ─── Constants ───────────────────────────────────────────

const INSTALL_TIMEOUT_MS = 240_000;

// ─── Helpers ─────────────────────────────────────────────

function runNpmInstall(ctx: FrameworkContext): Promise<InstallResult> {
  return new Promise<InstallResult>((resolve, reject) => {
    const start = Date.now();
    const child = spawn("npm", ["install", "--legacy-peer-deps"], {
      cwd: ctx.projectPath,
      shell: true,
      stdio: "pipe",
      env: { ...process.env, ...ctx.env, FORCE_COLOR: "0" },
    });

    let log = "";
    child.stdout?.on("data", (d: Buffer) => { log += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { log += d.toString(); });

    const timer = setTimeout(() => {
      try {
        if (process.platform === "win32" && child.pid) {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: false });
        } else {
          child.kill("SIGTERM");
        }
      } catch { /* ignore */ }
    }, INSTALL_TIMEOUT_MS);

    if (ctx.signal) {
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        try { child.kill("SIGTERM"); } catch { /* ignore */ }
        reject(new Error("install aborted"));
      });
    }

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ durationMs: Date.now() - start, log });
      } else {
        reject(new Error(`npm install exited with code ${code}\n${log.slice(-2000)}`));
      }
    });
  });
}

async function writeAllFiles(
  templateFiles: Record<string, string>,
  projectPath: string,
): Promise<string[]> {
  const written: string[] = [];
  for (const [rel, content] of Object.entries(templateFiles)) {
    const full = path.join(projectPath, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content, "utf-8");
    written.push(rel);
  }
  return written;
}

// ─── Adapter ─────────────────────────────────────────────

export const honoAdapter: FrameworkAdapter = {
  id: "hono",
  family: "node",
  displayName: "Hono",
  capabilities: new Set([
    "ssr-node",
    "hmr-supported",
    "requires-long-lived-process",
    "supports-base-path",
  ]),

  defaults: {
    requiredFiles: ["package.json", "src/index.ts"],
    criticalFiles: ["package.json", "src/index.ts"],
    listIgnore: ["dist", "node_modules", ".git"],
    lockedConfigFiles: ["tsconfig.json"],
    fallbackTemplateId: "hono-blank",
    devReadinessTimeoutMs: 30_000,
    buildTimeoutMs: 60_000,
  },

  async scaffold(ctx: ScaffoldContext): Promise<ScaffoldResult> {
    const filesWritten = await writeAllFiles(ctx.templateFiles, ctx.projectPath);
    return { filesWritten };
  },

  install(ctx: FrameworkContext): Promise<InstallResult> {
    return runNpmInstall(ctx);
  },

  dev(ctx: DevContext): DevSpec {
    return {
      command: "npx",
      args: ["tsx", "watch", "src/index.ts"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        PORT: String(ctx.port),
        HOST: ctx.host,
        FORCE_COLOR: "0",
        DOABLE_BASE_PATH: ctx.basePath,
      },
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Server is running", "Listening on", "ready"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },

  build(ctx: BuildContext): BuildSpec {
    return {
      command: "npx",
      args: ["tsc"],
      cwd: ctx.projectPath,
      env: { ...ctx.env, NODE_ENV: "production" },
      outputDir: "dist",
      timeoutMs: 60_000,
    };
  },

  serve(ctx: ServeContext): ServeSpec {
    return {
      command: "node",
      args: ["dist/index.js"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        PORT: String(ctx.port),
        HOST: ctx.host,
        NODE_ENV: "production",
      },
      port: ctx.port,
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Listening", "Server is running"],
      },
    };
  },

  parseLog(line: string) {
    const lower = line.toLowerCase();
    if (lower.includes("error")) {
      return { type: "build_error" as const, data: { message: line.trim() } };
    }
    if (lower.includes("warning")) {
      return { type: "build_warning" as const, data: { message: line.trim() } };
    }
    return null;
  },

  lockedConfigFiles() {
    return this.defaults.lockedConfigFiles;
  },

  listIgnore() {
    return this.defaults.listIgnore;
  },

  shouldReloadOnError({ path, status }) {
    if (status !== 502 && status !== 504) return false;
    // Hono dev runs through `tsx watch`; while the process is restarting on
    // a source change the proxy briefly sees 502/504 for source-file
    // requests. Reloading the page lets the client re-fetch once the
    // server is back up.
    return /\/src\/.+\.ts$/.test(path);
  },

  clearCacheBeforeRestart() {
    return ["dist"];
  },

  redactInUI(text: string): string {
    return text.replace(/tsconfig\.json/g, "build settings");
  },
};
