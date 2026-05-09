/**
 * Next.js (App Router) framework adapter.
 *
 * Per devframeworkPRD/02-framework-abstraction.md §8.2 and PRD 06's
 * `process` runtime kind. Targets `output: "standalone"` so deploy can
 * produce a self-contained server bundle for the runtime supervisor.
 *
 * Behaviour summary (consult `defaults` for static metadata):
 *   - dev:   `next dev -H {host} -p {port}`         (long-lived)
 *   - build: `next build`                            -> `.next/standalone/`
 *   - serve: `next start -H {host} -p {port}`        (production runtime)
 *
 * NOT registered yet — wiring lives in `adapters/index.ts` + `init.ts`.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Doable preview proxy serves projects under /preview/<id>/. Without
 * a basePath in next.config.*, Next.js thinks it's at / and returns 404
 * for the iframe URL. Default content for next.config.ts that wires
 * DOABLE_BASE_PATH (passed in the dev env) into next's basePath.
 */
const DEFAULT_NEXT_CONFIG = `import type { NextConfig } from "next";

const basePath = process.env.DOABLE_BASE_PATH && process.env.DOABLE_BASE_PATH !== "/"
  ? process.env.DOABLE_BASE_PATH.replace(/\\/$/, "")
  : "";

const nextConfig: NextConfig = { basePath };

export default nextConfig;
`;

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
import { ensureNextjsBabelPlugin } from "../../projects/nextjs-babel-config.js";

// ─── Constants ───────────────────────────────────────────

const INSTALL_TIMEOUT_MS = 240_000;

// ─── Helpers ─────────────────────────────────────────────

function runNpmInstall(ctx: FrameworkContext): Promise<InstallResult> {
  return new Promise<InstallResult>((resolve, reject) => {
    const start = Date.now();
    const child = spawn("npm", ["install", "--legacy-peer-deps", "--include=dev"], {
      cwd: ctx.projectPath,
      shell: true,
      stdio: "pipe",
      // BUG-PUB-004: force NODE_ENV=development for install spawn so npm doesn't
      // silently --omit=dev when the API itself runs as NODE_ENV=production.
      // Without this, devDeps like next, typescript, @types/* are skipped and
      // the subsequent `next build` fails resolving its own config imports.
      env: { ...process.env, ...ctx.env, FORCE_COLOR: "0", NODE_ENV: "development" },
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

export const nextjsAppAdapter: FrameworkAdapter = {
  id: "nextjs-app",
  family: "node",
  displayName: "Next.js (App Router)",
  // BUG-PUB-004: see vite-react adapter — probed by deploy/builder.ts to
  // detect a partial node_modules (production-only install) and re-run
  // install before `next build` runs.
  requiredBuildTool: "next",
  capabilities: new Set([
    "ssr-node",
    "hmr-supported",
    "supports-base-path",
    "html-injection-supported",
    "requires-long-lived-process",
    // Visual-edit is enabled via a Babel plugin dropped in by scaffold().
    // Trade-off: adding .babelrc.json switches Next.js from SWC (Rust-native,
    // fast) to Babel (JS-native, slower) for the project. Users may delete
    // .babelrc.json to revert to SWC at the cost of losing click-to-edit.
    "visual-edit-supported",
  ]),

  defaults: {
    requiredFiles: ["package.json"],
    criticalFiles: ["package.json", "next.config.ts"],
    listIgnore: [".next", "out", "node_modules", ".git"],
    lockedConfigFiles: [
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
      "postcss.config.js",
      "postcss.config.mjs",
    ],
    fallbackTemplateId: "nextjs-blank",
    devReadinessTimeoutMs: 120_000,
    buildTimeoutMs: 240_000,
  },

  async scaffold(ctx: ScaffoldContext): Promise<ScaffoldResult> {
    const filesWritten = await writeAllFiles(ctx.templateFiles, ctx.projectPath);
    // Install the visual-edit Babel plugin. Drops a CommonJS plugin under
    // .doable/ and writes .babelrc.json at the project root. NOTE: this
    // switches Next.js from SWC to Babel for this project — slower compile
    // times in exchange for click-to-edit support in the visual editor.
    await ensureNextjsBabelPlugin(ctx.projectPath);
    return { filesWritten };
  },

  install(ctx: FrameworkContext): Promise<InstallResult> {
    return runNpmInstall(ctx);
  },

  dev(ctx: DevContext): DevSpec {
    // SAFETY NET: ensure next.config.{ts,js,mjs} exists before spawning
    // dev. Without it, the preview iframe shows 404 because next doesn't
    // know it lives under /preview/<id>/. The framework prompt asks the
    // AI to create this file but compliance isn't 100%, so write the
    // default if NONE of the config variants exist. Sync write so the
    // next dev process sees it.
    const configCandidates = ["next.config.ts", "next.config.js", "next.config.mjs", "next.config.cjs"];
    const hasConfig = configCandidates.some((f) => existsSync(path.join(ctx.projectPath, f)));
    if (!hasConfig) {
      try {
        // writeFileSync via fs (not fs/promises) to avoid making this method async.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("node:fs").writeFileSync(path.join(ctx.projectPath, "next.config.ts"), DEFAULT_NEXT_CONFIG, "utf-8");
        console.log(`[nextjs-adapter] auto-created missing next.config.ts for ${ctx.projectId}`);
      } catch (err) {
        console.warn(`[nextjs-adapter] failed to auto-create next.config.ts: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Spawn node + next's bin script directly instead of `npx next dev`.
    // On Windows, `npx next dev` = npx.cmd → next.cmd → node.exe. When the
    // intermediate .cmd shells exit (which they do quickly after handing
    // off), our spawn wrapper sees the parent exit code 0 and treats the
    // server as dead — leaving the actual next-server orphaned and
    // unreachable. Going through node directly keeps our wrapper bound to
    // the actual long-lived process.
    return {
      command: process.execPath, // node binary running this api
      args: [
        path.join(ctx.projectPath, "node_modules", "next", "dist", "bin", "next"),
        "dev",
        "-H", ctx.host,
        "-p", String(ctx.port),
      ],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        FORCE_COLOR: "0",
        // Next reads basePath from next.config; passing through env lets the
        // template's next.config.ts pick it up if the user wires it that way.
        DOABLE_BASE_PATH: ctx.basePath,
        // Safety net: cap server-side fetch timeouts so that SSR doesn't hang
        // indefinitely when env vars point to unreachable services (e.g.
        // SUPABASE_URL undefined → fetch("undefined/...") hangs on DNS).
        // The preload script patches globalThis.fetch with a 15s AbortSignal.
        // Prefer IPv4 to avoid IPv6 resolution issues in sandboxed environments.
        NODE_OPTIONS: [
          ctx.env?.NODE_OPTIONS,
          "--dns-result-order=ipv4first",
          `--require ${path.join(path.dirname(fileURLToPath(import.meta.url)), "nextjs-fetch-timeout.cjs")}`,
        ].filter(Boolean).join(" "),
      },
      readinessSignal: {
        kind: "log-substring",
        patterns: ["Ready in", "started server on", "Local:"],
      },
      healthUrl: `http://${ctx.host}:${ctx.port}${ctx.basePath === "/" ? "/" : ctx.basePath}`,
    };
  },

  build(ctx: BuildContext): BuildSpec {
    return {
      command: "npx",
      args: ["next", "build"],
      cwd: ctx.projectPath,
      env: {
        ...ctx.env,
        NODE_ENV: "production",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      // Standalone mode produces a self-contained server bundle the
      // production runtime supervisor (PRD 06) can serve via
      // `node .next/standalone/server.js`.
      outputDir: ".next",
      timeoutMs: 240_000,
    };
  },

  serve(ctx: ServeContext): ServeSpec {
    // For projects built with output:"standalone" the canonical entry
    // is .next/standalone/server.js; for the default mode it's `next start`.
    // We default to `next start` and let production wiring (PRD 06)
    // override when needed.
    return {
      command: "npx",
      args: [
        "next",
        "start",
        "-H", ctx.host,
        "-p", String(ctx.port),
      ],
      cwd: ctx.projectPath,
      env: { ...ctx.env, NODE_ENV: "production" },
      port: ctx.port,
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
      readinessSignal: {
        kind: "log-substring",
        patterns: ["started server on", "Ready in"],
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
    // Next.js dev server briefly drops _next/static and _next/webpack-hmr
    // during a recompile; reload on either.
    return (
      path.startsWith("/_next/static/") ||
      path.startsWith("/_next/webpack-hmr") ||
      path === "/_next/on-demand-entries-ping"
    );
  },

  clearCacheBeforeRestart() {
    return [".next/cache"];
  },

  redactInUI(text: string): string {
    return text
      .replace(/next\.config\.(ts|js|mjs)/g, "build settings")
      .replace(/npx next/g, "build tool");
  },
};
