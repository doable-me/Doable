/**
 * SvelteKit framework adapter.
 *
 * SvelteKit uses Vite under the hood for dev/build, and (with adapter-node)
 * produces a long-lived Node server for production. Mirrors the structure of
 * nextjs-app.ts — see PRD 02 §8 for the per-framework adapter contract.
 *
 * Behaviour summary (consult `defaults` for static metadata):
 *   - dev:   `vite dev --host {host} --port {port} --strictPort`  (long-lived)
 *   - build: `vite build`                                         -> `build/`
 *   - serve: `node build/index.js`                                (adapter-node)
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

export const sveltekitAdapter: FrameworkAdapter = {
  id: "sveltekit",
  family: "node",
  displayName: "SvelteKit",
  capabilities: new Set([
    "ssr-node",
    "hmr-supported",
    "supports-base-path",
    "html-injection-supported",
    "requires-long-lived-process",
    "static-export",
  ]),

  defaults: {
    requiredFiles: ["package.json", "svelte.config.js"],
    criticalFiles: ["package.json", "svelte.config.js"],
    listIgnore: ["build", ".svelte-kit", "node_modules", ".git", "dist"],
    lockedConfigFiles: [
      "svelte.config.js",
      "vite.config.ts",
      "vite.config.js",
    ],
    fallbackTemplateId: "sveltekit-blank",
    devReadinessTimeoutMs: 90_000,
    buildTimeoutMs: 180_000,
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
        "vite",
        "dev",
        "--host", ctx.host,
        "--port", String(ctx.port),
        "--strictPort",
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        FORCE_COLOR: "0",
        BROWSER: "none",
        // SvelteKit reads paths.base from svelte.config.js; the template can
        // pick this env up if it wants the base path threaded through.
        DOABLE_BASE_PATH: ctx.basePath,
      },
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Local:", "ready in"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}${ctx.basePath === "/" ? "/" : ctx.basePath}`,
    };
  },

  build(ctx: BuildContext): BuildSpec {
    return {
      command: "npx",
      args: ["vite", "build"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        NODE_ENV: "production",
      },
      // adapter-node emits a Node server bundle to `build/`; adapter-static
      // emits a static site to the same directory. Either way `build/` is
      // the artifact root the runtime supervisor (PRD 06) consumes.
      outputDir: "build",
      timeoutMs: 180_000,
    };
  },

  serve(ctx: ServeContext): ServeSpec {
    // Assumes adapter-node was used at build time. The default SvelteKit
    // node entrypoint is `build/index.js`. The runtime supervisor sets
    // HOST and PORT env vars which the adapter-node server honours.
    return {
      command: "node",
      args: ["build/index.js"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        NODE_ENV: "production",
        HOST: ctx.host,
        PORT: String(ctx.port),
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
    // Same Vite-driven dev-server recovery model as vite-react: pre-bundled
    // dep churn under .vite/deps, plus source files briefly dropped during
    // a recompile. SvelteKit adds .svelte to the source-extension set.
    return (
      path.includes(".vite/deps") ||
      /\/src\/.*\.(tsx?|jsx?|svelte)$/.test(path)
    );
  },

  clearCacheBeforeRestart() {
    return [".svelte-kit", "node_modules/.vite"];
  },

  redactInUI(text: string): string {
    return text
      .replace(/svelte\.config(\.(ts|js|mjs))?/g, "build settings")
      .replace(/vite\.config(\.(ts|js))?/g, "build settings")
      .replace(/npx vite/g, "build tool");
  },
};
