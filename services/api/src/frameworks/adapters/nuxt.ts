/**
 * Nuxt 3 framework adapter.
 *
 * Per devframeworkPRD/02-framework-abstraction.md §8.x and PRD 06's
 * `process` runtime kind. Targets the default Nitro Node preset so deploy
 * can produce a self-contained server bundle at `.output/server/index.mjs`
 * for the runtime supervisor.
 *
 * Behaviour summary (consult `defaults` for static metadata):
 *   - dev:   `nuxt dev --host {host} --port {port}` (long-lived)
 *   - build: `nuxt build`                            -> `.output/`
 *   - serve: `node .output/server/index.mjs`         (production runtime)
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

export const nuxtAdapter: FrameworkAdapter = {
  id: "nuxt",
  family: "node",
  displayName: "Nuxt 3",
  capabilities: new Set([
    "ssr-node",
    "hmr-supported",
    "supports-base-path",
    "html-injection-supported",
    "requires-long-lived-process",
    // Nuxt can ALSO produce a static site via the nitro `static` preset.
    "static-export",
  ]),

  defaults: {
    requiredFiles: ["package.json", "nuxt.config.ts"],
    criticalFiles: ["package.json", "nuxt.config.ts"],
    listIgnore: [".output", ".nuxt", "node_modules", ".git", "dist"],
    lockedConfigFiles: ["nuxt.config.ts", "nuxt.config.js"],
    fallbackTemplateId: "nuxt-blank",
    devReadinessTimeoutMs: 120_000,
    buildTimeoutMs: 240_000,
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
      args: [
        "nuxt",
        "dev",
        "--host", ctx.host,
        "--port", String(ctx.port),
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        FORCE_COLOR: "0",
      },
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Listening on", "Local:", "ready in"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },

  build(ctx: BuildContext): BuildSpec {
    return {
      command: "npx",
      args: ["nuxt", "build"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        NODE_ENV: "production",
      },
      // Nitro emits a self-contained Node server at `.output/server/index.mjs`
      // plus public assets under `.output/public/` — all under `.output/`.
      outputDir: ".output",
      timeoutMs: 240_000,
    };
  },

  serve(ctx: ServeContext): ServeSpec {
    return {
      command: "node",
      args: [".output/server/index.mjs"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        HOST: ctx.host,
        PORT: String(ctx.port),
        NODE_ENV: "production",
      },
      port: ctx.port,
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
      readinessSignal: {
        kind: "http-probe",
        url: `http://${ctx.host}:${ctx.port}/`,
        intervalMs: 500,
        timeoutMs: 30_000,
      },
    };
  },

  parseLog(line: string) {
    if (line.toLowerCase().includes("error")) {
      return { level: "error" as const, message: line.trim() };
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
    // Nuxt dev server briefly drops `_nuxt/*` (HMR client + chunk graph)
    // during a recompile; reload on either.
    return path.startsWith("/_nuxt/");
  },

  clearCacheBeforeRestart() {
    return [".nuxt", ".output"];
  },

  redactInUI(text: string): string {
    return text
      .replace(/nuxt\.config\.(ts|js)/g, "build settings")
      .replace(/npx nuxt/g, "build tool");
  },
};
