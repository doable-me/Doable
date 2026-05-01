/**
 * Vite + React framework adapter.
 *
 * Mechanical extraction of the existing hardcoded Vite behavior into the
 * FrameworkAdapter shape. Behavior is verbatim from current call sites — see
 * the per-field provenance in devframeworkPRD/02-framework-abstraction.md §5
 * and §8.1. This adapter is NOT registered anywhere yet; the registry wiring
 * is a separate task.
 *
 * Provenance for each surface:
 *   - requiredFiles / criticalFiles  -> services/api/src/projects/file-manager.ts:91,126
 *   - listIgnore                     -> services/api/src/ai/project-files.ts:17
 *   - lockedConfigFiles              -> services/api/src/projects/vite-jail.ts:4
 *                                       packages/dovault/src/config-guard.ts:14-64
 *   - fallbackTemplateId             -> services/api/src/projects/file-manager.ts:23
 *   - devReadinessTimeoutMs          -> services/api/src/projects/dev-server-core.ts:13
 *   - buildTimeoutMs                 -> services/api/src/deploy/builder.ts:6
 *   - dev() spawn shape              -> services/api/src/projects/dev-server-start.ts:102-134
 *   - build() spawn shape            -> services/api/src/deploy/builder.ts:84
 *   - install()                      -> services/api/src/projects/file-manager.ts:206
 *   - scaffold()                     -> services/api/src/projects/file-manager.ts:117-122
 *                                       + services/api/src/projects/vite-plugin-source-annotations.ts:220
 *   - parseLog()                     -> services/api/src/ai/preview-errors.ts:26 (loose)
 *   - errorOverlay()                 -> services/api/src/ai/preview-errors.ts:26
 *   - shouldReloadOnError()          -> services/api/src/routes/preview-proxy/proxy-handler.ts:165,187
 *   - clearCacheBeforeRestart()      -> services/api/src/projects/dev-server-ops.ts:202
 *   - redactInUI()                   -> services/api/src/ai/tool-messages.ts:25,170,175
 *   - injectIntoHtml                 -> OMITTED for v1; caller applies the
 *                                       standard injection per PRD 02 §4.3.
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

import { ensureSourceAnnotationsPlugin } from "../../projects/vite-plugin-source-annotations.js";

// ─── Constants ───────────────────────────────────────────

const INSTALL_TIMEOUT_MS = 180_000;

// ─── Helpers ─────────────────────────────────────────────

/**
 * Spawn `npm install --legacy-peer-deps` in the given project path.
 *
 * Mirrors services/api/src/projects/file-manager.ts:202 (runPnpmInstall):
 *   - shell: true so the npm shim resolves on Windows
 *   - FORCE_COLOR: "0" to keep the log free of ANSI escape codes
 *   - 180s timeout; on Windows we taskkill the tree because SIGTERM does
 *     not propagate through cmd.exe
 *   - resolve with combined stdout+stderr on success; reject on non-zero
 *
 * `ctx.env` is merged on top of `process.env` so the abstraction can thread
 * user/vault env vars in without losing PATH and friends.
 */
function runNpmInstall(ctx: FrameworkContext): Promise<InstallResult> {
  return new Promise<InstallResult>((resolve, reject) => {
    const start = Date.now();
    const child = spawn("npm", ["install", "--legacy-peer-deps"], {
      cwd: ctx.projectPath,
      shell: true,
      stdio: "pipe",
      env: {
        ...process.env,
        ...ctx.env,
        FORCE_COLOR: "0",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    const killChildTree = () => {
      if (process.platform === "win32" && child.pid) {
        try {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
          });
        } catch {
          child.kill("SIGTERM");
        }
      } else {
        child.kill("SIGTERM");
      }
    };

    const timeout = setTimeout(() => {
      killChildTree();
      reject(new Error(`npm install timed out after ${INSTALL_TIMEOUT_MS / 1000}s`));
    }, INSTALL_TIMEOUT_MS);

    const onAbort = () => {
      clearTimeout(timeout);
      killChildTree();
      reject(new Error("npm install aborted"));
    };
    if (ctx.signal) {
      if (ctx.signal.aborted) {
        onAbort();
        return;
      }
      ctx.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.on("error", (err) => {
      clearTimeout(timeout);
      ctx.signal?.removeEventListener("abort", onAbort);
      reject(new Error(`Failed to run npm install: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      ctx.signal?.removeEventListener("abort", onAbort);
      if (code === 0) {
        resolve({
          durationMs: Date.now() - start,
          log: stdout + stderr,
        });
      } else {
        reject(
          new Error(`npm install exited with code ${code}:\n${stdout}\n${stderr}`),
        );
      }
    });
  });
}

// ─── Adapter ─────────────────────────────────────────────

export const viteReactAdapter: FrameworkAdapter = {
  // ── Identity ─────────────────────────────────────────
  id: "vite-react",
  family: "node",
  displayName: "Vite + React",
  capabilities: new Set([
    "static-spa",
    "hmr-supported",
    "visual-edit-supported",
    "html-injection-supported",
    "supports-base-path",
    "build-emits-static-only",
  ]),

  // ── Defaults ─────────────────────────────────────────
  defaults: {
    requiredFiles: ["index.html", "package.json"],
    criticalFiles: ["index.html", "package.json"],
    listIgnore: ["dist", "node_modules", ".git"],
    lockedConfigFiles: [
      "vite.config.ts",
      "vite.config.js",
      "postcss.config.js",
      "tailwind.config.ts",
    ],
    fallbackTemplateId: "blank",
    devReadinessTimeoutMs: 90_000,
    buildTimeoutMs: 120_000,
  },

  // ── Lifecycle: scaffold ──────────────────────────────
  async scaffold(ctx: ScaffoldContext): Promise<ScaffoldResult> {
    // Mirrors file-manager.ts:117-122 — write each template file directly
    // to disk (NOT through the Yjs bridge, which debounces persistence).
    for (const [rel, content] of Object.entries(ctx.templateFiles)) {
      const full = path.join(ctx.projectPath, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, content, "utf-8");
    }

    // Inject the Doable source-annotations Vite plugin so click-to-edit works
    // from first dev-server start. Idempotent — no-op if already present.
    await ensureSourceAnnotationsPlugin(ctx.projectPath);

    return { filesWritten: Object.keys(ctx.templateFiles) };
  },

  // ── Lifecycle: install ───────────────────────────────
  // NOTE: install() is the documented exception to the §4.4 "spec-builder
  // purity" rule — PRD §8.1 has it actually spawning. See the runNpmInstall
  // helper above for the spawn shape.
  async install(ctx: FrameworkContext): Promise<InstallResult> {
    return runNpmInstall(ctx);
  },

  // ── Lifecycle: dev (spec-builder, no spawn) ──────────
  dev(ctx: DevContext): DevSpec {
    const viteEntry = path.join(
      ctx.projectPath,
      "node_modules",
      "vite",
      "bin",
      "vite.js",
    );
    return {
      command: process.execPath,
      args: [
        viteEntry,
        "--host",
        ctx.host,
        "--port",
        String(ctx.port),
        "--strictPort",
        "--base",
        ctx.basePath,
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        FORCE_COLOR: "0",
        BROWSER: "none",
      },
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Local:", "ready in"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}${ctx.basePath}`,
    };
  },

  // ── Lifecycle: build (spec-builder, no spawn) ────────
  build(ctx: BuildContext): BuildSpec {
    return {
      command: "npx",
      args: [
        "vite",
        "build",
        "--outDir",
        "dist",
        ...(ctx.basePath !== "/" ? [`--base=${ctx.basePath}`] : []),
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        NODE_ENV: "production",
      },
      outputDir: "dist",
    };
  },

  // ── Optional: structured log parsing ─────────────────
  parseLog(line: string) {
    if (line.includes("error")) {
      return { level: "error" as const, message: line.trim() };
    }
    return null;
  },

  // ── Optional: locked-config / list-ignore mirrors ────
  lockedConfigFiles() {
    return this.defaults.lockedConfigFiles;
  },
  listIgnore() {
    return this.defaults.listIgnore;
  },

  // ── Optional: error overlay detection ────────────────
  errorOverlay(html: string): boolean {
    return html.includes("vite-error-overlay");
  },

  // ── Optional: 502/504 reload-on-error policy ─────────
  // Mirrors proxy-handler.ts:165,187 — auto-reload on 502/504 for Vite's
  // pre-bundled deps ("Outdated Optimize Dep") and for source files under
  // /src/*.{tsx,jsx,ts,js} that the dev server may briefly drop during
  // restart.
  shouldReloadOnError({ path, status }: { path: string; status: number; method: string }): boolean {
    if (status !== 502 && status !== 504) return false;
    // Regex is byte-identical to proxy-handler.ts:205 to preserve the
    // golden-file invariant Phase 1 validates against.
    return (
      path.includes(".vite/deps") ||
      /\/src\/.*\.(tsx?|jsx?)$/.test(path)
    );
  },

  // ── Optional: pre-restart cache wipe ─────────────────
  clearCacheBeforeRestart(): string[] {
    return ["node_modules/.vite"];
  },

  // ── Optional: per-framework UI redactions ────────────
  // Mirrors ai/tool-messages.ts:25,170,175 — strip references to
  // "vite.config*" and "npx vite" from any AI-facing surface.
  redactInUI(text: string): string {
    return text
      .replace(/vite\.config(\.(ts|js))?/g, "build settings")
      .replace(/npx vite/g, "build tool");
  },
};
