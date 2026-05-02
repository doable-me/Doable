/**
 * Astro framework adapter (static-by-default).
 *
 * Per devframeworkPRD/02-framework-abstraction.md §8.x and PRD 06's
 * `static` runtime kind. Targets Astro's default static build mode —
 * `astro build` emits a fully-static site under `dist/` that the
 * static-site runtime can serve without a long-lived process.
 *
 * Behaviour summary (consult `defaults` for static metadata):
 *   - dev:   `astro dev --host {host} --port {port}`   (long-lived; HMR)
 *   - build: `astro build`                              -> `dist/`
 *   - serve: OMITTED — static-only; no `requires-long-lived-process`.
 *            Astro SSR mode would be a separate adapter that adds
 *            `ssr-node` + `requires-long-lived-process`.
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
} from "../types.js";
import type {
  BuildContext,
  DevContext,
  FrameworkContext,
  ScaffoldContext,
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

export const astroAdapter: FrameworkAdapter = {
  id: "astro",
  family: "node",
  displayName: "Astro",
  capabilities: new Set([
    "static-export",
    "static-spa",
    "hmr-supported",
    "html-injection-supported",
    "supports-base-path",
    "build-emits-static-only",
    // No ssr-node by default — Astro SSR mode would be a separate adapter
    // that adds ssr-node + requires-long-lived-process.
  ]),

  defaults: {
    requiredFiles: ["package.json"],
    criticalFiles: ["package.json"],
    listIgnore: ["dist", ".astro", "node_modules", ".git"],
    lockedConfigFiles: [
      "astro.config.mjs",
      "astro.config.ts",
      "astro.config.js",
    ],
    fallbackTemplateId: "astro-blank",
    devReadinessTimeoutMs: 60_000,
    buildTimeoutMs: 120_000,
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
        "astro",
        "dev",
        "--host", ctx.host,
        "--port", String(ctx.port),
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        FORCE_COLOR: "0",
        // Astro reads `base` from astro.config; passing through env lets the
        // template's astro.config pick it up if the user wires it that way.
        DOABLE_BASE_PATH: ctx.basePath,
      },
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Local", "ready in"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}${ctx.basePath === "/" ? "/" : ctx.basePath}`,
    };
  },

  build(ctx: BuildContext): BuildSpec {
    return {
      command: "npx",
      args: ["astro", "build"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        NODE_ENV: "production",
      },
      // Astro's default static build emits a deployable site under `dist/`.
      outputDir: "dist",
      timeoutMs: 120_000,
    };
  },

  // serve: OMITTED — static-only. Caller never invokes serve() because
  // capabilities does not include `requires-long-lived-process`. The
  // static-site runtime serves `dist/` directly.

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
    // Astro dev briefly drops `/_astro/*` assets (HMR client, hydration
    // chunks, virtual modules) during a recompile; reload on either.
    return path.startsWith("/_astro/");
  },

  clearCacheBeforeRestart() {
    return [".astro", "dist"];
  },

  redactInUI(text: string): string {
    return text
      .replace(/astro\.config\.(ts|js|mjs)/g, "build settings")
      .replace(/npx astro/g, "build tool");
  },
};
