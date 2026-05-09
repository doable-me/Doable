/**
 * Framework abstraction types.
 *
 * Source of truth: devframeworkPRD/02-framework-abstraction.md
 *   §3   Capability flags
 *   §4.1 Context types
 *   §4.2 Result types
 *   §4.3 The FrameworkAdapter interface
 *
 * Three layers (see PRD §2):
 *   - FrameworkPack: declarative, serializable metadata.
 *   - FrameworkAdapter: executable behavior bound to a pack.
 *   - Template: a frameworkId plus a Record<filePath, content> (defined elsewhere).
 *
 * Adapter instances are singletons. They MUST NOT carry per-project state
 * in instance fields — state lives in Doable (projects.framework_id, the
 * in-memory servers Map, etc.). See PRD §4.4.
 */

import type { BuildEventInput } from "../build-events/types.js";

// ─── Capability flags (PRD §3) ───────────────────────────

/**
 * Closed set of boolean features Doable code paths key off.
 *
 * Capabilities are NOT a free-form tag list. Adding one is a typed change;
 * adapters cannot invent capabilities at runtime.
 */
export type Capability =
  | "static-spa"                  // build output is a fully-static SPA
  | "static-export"               // framework can produce a static export
  | "ssr-node"                    // requires a long-lived Node process
  | "ssr-python"                  // long-lived Python (gunicorn / uvicorn)
  | "ssr-ruby"                    // long-lived Ruby (puma / rails server)
  | "mobile-build"                // produces a mobile artifact (ipa/apk/aab)
  | "electron-shell"              // produces a desktop artifact
  | "worker-target"               // Cloudflare/Deno/edge worker target
  | "hmr-supported"               // dev server supports HMR
  | "visual-edit-supported"       // source-map -> DOM mapping is feasible
  | "html-injection-supported"    // proxy may inject <script> into responses
  | "requires-long-lived-process" // production hosting needs a server process
  | "needs-system-runtime"        // requires non-Node runtime on host (python/ruby/jvm)
  | "supports-base-path"          // deploys cleanly under /foo/ subpath
  | "build-emits-static-only";    // every build produces only static files

// ─── Context types (PRD §4.1) ────────────────────────────

/**
 * Common context passed into every adapter method that touches a project.
 */
export interface FrameworkContext {
  projectId: string;
  projectPath: string;        // absolute, e.g. /data/projects/{projectId}
  basePath: string;           // "/" or "/preview/{id}/" — proxy sub-path
  env: Record<string, string>; // resolved user env vars + Doable defaults
  userId?: string;            // for env resolution + audit
  signal?: AbortSignal;       // cancellation
  onProgress?: (message: string) => void; // real-time status updates during install
}

export interface ScaffoldContext extends FrameworkContext {
  templateFiles: Record<string, string>;  // template.codeFiles
  projectName?: string;
}

export interface DevContext extends FrameworkContext {
  host: string;               // e.g. 127.0.0.1
  port: number;               // allocated by port pool, not by adapter
}

export interface BuildContext extends FrameworkContext {
  target: "preview" | "production";
}

export interface ServeContext extends FrameworkContext {
  host: string;
  port: number;
  buildOutputDir: string;     // produced by a previous build()
}

// ─── Result types (PRD §4.2) ─────────────────────────────

export interface ScaffoldResult {
  filesWritten: string[];     // relative paths, for audit/log
  warnings?: string[];
}

export interface InstallResult {
  durationMs: number;
  log: string;
  warnings?: string[];
}

/**
 * Readiness signal: how the caller decides a spawned dev/serve process is
 * "up." Most frameworks emit a recognizable substring on stdout/stderr.
 */
export type ReadinessSignal =
  | { kind: "log-substring"; patterns: string[] }
  | { kind: "http-probe"; url: string; intervalMs: number; timeoutMs: number }
  | {
      kind: "custom";
      ready: (streams: {
        stdout: NodeJS.ReadableStream;
        stderr: NodeJS.ReadableStream;
      }) => Promise<void>;
    };

export interface DevSpec {
  command: string;            // execPath OR resolved binary; passed to spawn
  args: string[];
  cwd: string;
  env: Record<string, string>;
  // Readiness: "scan stdout/stderr for any of these substrings"
  // OR a custom async predicate. Most frameworks use substrings.
  readinessSignal: ReadinessSignal;
  // After readiness, GET this URL to confirm reachability.
  // Expressed relative to the dev server (NOT relative to the proxy).
  healthUrl: string;          // typically `http://${host}:${port}${basePath}`
  // Optional cleanup steps when the dev process exits.
  exitCleanup?: (ctx: DevContext) => Promise<void>;
}

export interface BuildSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  // Where the build artifact lives, relative to projectPath.
  // E.g. "dist" (Vite), ".next" (Next.js), "out" (Next export),
  // ".output/public" (Nuxt), "build" (SvelteKit).
  outputDir: string;
  // Maximum wall time. Default 120_000 if unset.
  timeoutMs?: number;
}

export interface ServeSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  port: number;
  healthUrl: string;          // checked by RuntimeAdapter before flipping live
  readinessSignal: ReadinessSignal;
}

// ─── FrameworkPack (PRD §2) ──────────────────────────────

/**
 * Declarative, serializable metadata about a framework.
 *
 * Held by code paths that never spawn a process (AI file-search, config-lock
 * guard, etc.) so they don't transitively import the dev-server runtime.
 * The matching FrameworkAdapter typically mirrors these values via its
 * `defaults` field.
 */
export interface FrameworkPack {
  readonly id: string;        // e.g. "vite-react", "nextjs-app"
  readonly family: "node" | "python" | "ruby" | "static" | "mobile" | "custom";
  readonly displayName: string;
  readonly capabilities: ReadonlySet<Capability>;
  readonly defaults: {
    requiredFiles: string[];
    criticalFiles: string[];
    listIgnore: string[];
    lockedConfigFiles: string[];
    fallbackTemplateId?: string;
    devReadinessTimeoutMs: number;
    buildTimeoutMs: number;
  };
}

// ─── FrameworkAdapter (PRD §4.3) ─────────────────────────

export interface FrameworkAdapter {
  // ─── Identity ───────────────────────────────────────────────────────
  readonly id: string;        // e.g. "vite-react", "nextjs-app", "nuxt", "django", "expo"
  readonly family: "node" | "python" | "ruby" | "static" | "mobile" | "custom";
  readonly capabilities: ReadonlySet<Capability>;
  readonly displayName: string;

  // ─── Defaults ───────────────────────────────────────────────────────
  // Returned to callers that need declarative shape WITHOUT spawning anything.
  // (Mirrors FrameworkPack — adapters typically import from their pack.)
  readonly defaults: {
    requiredFiles: string[];           // e.g. ["package.json"], or for Vite ["index.html","package.json"]
    criticalFiles: string[];           // subset of requiredFiles — must exist post-scaffold; for SSR could include "next.config.js"
    listIgnore: string[];              // ignore globs for AI file-listing & search
    lockedConfigFiles: string[];       // configs the AI write_file tool may not edit at runtime
    fallbackTemplateId?: string;       // when scaffold called with empty templateFiles
    devReadinessTimeoutMs: number;     // default 90_000
    buildTimeoutMs: number;            // default 120_000
  };

  // ─── Build-tool probe (BUG-PUB-004) ─────────────────────────────────
  // The package whose presence under node_modules/ proves the install was
  // complete enough to run `build()`. Used by the publish builder to decide
  // whether to (re)run install: an existing node_modules/ directory is NOT
  // sufficient evidence that devDependencies are present (e.g. when a prior
  // install ran with NODE_ENV=production), so the builder also probes
  // `node_modules/${requiredBuildTool}/package.json`. If absent, install
  // runs. Vite-react sets "vite"; next-app sets "next"; static/python
  // adapters can leave it undefined (no node_modules required).
  readonly requiredBuildTool?: string;

  // ─── Lifecycle methods ──────────────────────────────────────────────

  // Write template files to disk + any framework-specific post-scaffold steps
  // (e.g. inject source-annotation plugin, generate tsconfig path, write
  // .gitignore entries). MUST be idempotent.
  // CONTRACT: writes `templateFiles` to `projectPath` first; adapter-specific
  // additions ON TOP. `requiredFiles` MUST exist in the result or this throws.
  // DEFAULT IF ABSENT: write each templateFiles entry verbatim, validate
  // requiredFiles present, return.
  // CALLED BY: services/api/src/projects/file-manager.ts (scaffold path)
  scaffold(ctx: ScaffoldContext): Promise<ScaffoldResult>;

  // Install dependencies. MUST be idempotent (re-runs on missing node_modules).
  // CONTRACT: returns when install is complete; throws on non-zero exit.
  // DEFAULT IF ABSENT: spawn `npm install --legacy-peer-deps` for `family:"node"`.
  // CALLED BY: services/api/src/projects/file-manager.ts:202 (replaces
  // runPnpmInstall) and ensureDependencies on lazy re-install.
  install(ctx: FrameworkContext): Promise<InstallResult>;

  // Build the spawn-shape for the dev server. This is a PURE function — it
  // does not actually spawn. The caller (dev-server-start.ts) does the spawn,
  // owns the ChildProcess, and applies vault/jail policy.
  // CONTRACT: returned spec must produce a process that listens on
  // ctx.host:ctx.port (or, if the framework forces a different port, the
  // adapter must remap via its own proxy — preferred is to use ctx.port
  // directly via CLI flag).
  // DEFAULT IF ABSENT: throws — there is no sensible default for "what dev
  // command does this framework run."
  // CALLED BY: services/api/src/projects/dev-server-start.ts (replaces the
  // hardcoded vite spawn at line 122-134 of vite flow brief).
  dev(ctx: DevContext): DevSpec;

  // Build the spawn-shape for a one-shot build. Like dev(), this is pure.
  // CONTRACT: when the returned process exits 0, ctx.projectPath/{outputDir}
  // is the deployable artifact.
  // DEFAULT IF ABSENT: throws.
  // CALLED BY: services/api/src/deploy/builder.ts (replaces hardcoded
  // ["vite","build","--outDir","dist"] at line 84 of vite flow brief).
  build(ctx: BuildContext): BuildSpec;

  // Build the spawn-shape for a long-lived server (SSR / API / mobile dev
  // server). Required iff capabilities includes "requires-long-lived-process",
  // optional otherwise.
  // CONTRACT: starts a server bound to ctx.host:ctx.port serving the artifact
  // at ctx.buildOutputDir. The PROCESS must be supervisable (the caller will
  // monitor via DevSpec-style readiness).
  // DEFAULT IF ABSENT: undefined (interpreted as "no serve step needed —
  // build artifact is statically deployable").
  // CALLED BY: RuntimeAdapter (PRD 04) when promoting a build to live.
  serve?(ctx: ServeContext): ServeSpec;

  // Optional structured log parsing. Returns a BuildEventInput for lines the
  // framework emits in a recognizable format; returns null for anything
  // unrecognized so the caller can passthrough as raw.
  // DEFAULT IF ABSENT: caller treats every line as raw passthrough — see PRD §7.
  // CALLED BY: dev-server log publisher and build log publisher (PRD 05).
  parseLog?(line: string): BuildEventInput | null;

  // Configs the AI write_file tool may NOT edit while the project is running.
  // (Edits at rest are still allowed — runtime hot-reload of build configs
  // is what we block.) Mirrors defaults.lockedConfigFiles but framework
  // adapters may compute it from project state if needed.
  // DEFAULT IF ABSENT: returns this.defaults.lockedConfigFiles.
  // CALLED BY: file-manager AI write_file guard (replaces vite-jail.ts:140
  // isLockedConfigFile call site of vite flow brief).
  lockedConfigFiles(ctx?: FrameworkContext): string[];

  // Ignore globs for AI file-listing and search. Replaces the
  // hardcoded "dist" exclusion at services/api/src/ai/project-files.ts:17
  // and services/api/src/ai/tools/search-files.ts:61.
  // DEFAULT IF ABSENT: returns this.defaults.listIgnore.
  // CALLED BY: AI file-listing / search-files / copilot tool description
  // (vite flow brief surfaces 23-24).
  listIgnore(ctx?: FrameworkContext): string[];

  // Detect a framework error overlay in served HTML. Replaces the
  // ai/preview-errors.ts:26 hardcoded `html.includes("vite-error-overlay")`.
  // DEFAULT IF ABSENT: returns false (no overlay model for this framework).
  // CALLED BY: services/api/src/ai/preview-errors.ts.
  errorOverlay?(html: string): boolean;

  // Decide whether a 502/504 from the proxy on a given path should respond
  // with `<script>window.location.reload()</script>` instead of the error.
  // This is the abstraction over vite flow brief surface 12 (`.vite/deps`,
  // `/src/*.{tsx,jsx,ts,js}` recovery in proxy-handler.ts:165,187).
  // DEFAULT IF ABSENT: returns false — never auto-reload.
  // CALLED BY: services/api/src/routes/preview-proxy/proxy-handler.ts.
  shouldReloadOnError?(req: { path: string; status: number; method: string }): boolean;

  // Optional HTML transform for the visual-edit / error-capture / tracker
  // injection. Replaces vite flow brief surface 13 (proxy-handler.ts:112-156).
  // DEFAULT IF ABSENT: caller applies the standard
  // (storage namespace + error capture + tracker + visual-edit-bridge)
  // injection pattern, assuming a `<head>` and `<body>` exist.
  // Adapters that need a different injection point (SSR streaming, no
  // <head>, etc.) override.
  // CALLED BY: proxy-handler.ts.
  injectIntoHtml?(html: string, ctx: { projectId: string; basePath: string }): string;

  // Cache directory to clear before restart. Replaces vite flow brief
  // surface 9 (`rm -rf node_modules/.vite` at dev-server-ops.ts:202).
  // Adapters return a list of paths relative to projectPath that should be
  // recursively removed before a fresh dev start.
  // DEFAULT IF ABSENT: returns []. Caller skips the rm step.
  // CALLED BY: services/api/src/projects/dev-server-ops.ts (restart path).
  clearCacheBeforeRestart?(ctx: FrameworkContext): string[];

  // Per-framework UI redaction map for tool messages. Replaces vite flow
  // brief surface 22 (ai/tool-messages.ts redacting "vite.config" -> "build
  // settings", "npx vite" -> "build tool").
  // DEFAULT IF ABSENT: identity (no redactions). Most frameworks override
  // because the AI can mention the tool name in passing.
  // CALLED BY: services/api/src/ai/tool-messages.ts.
  redactInUI?(text: string): string;
}

// ─── Errors (PRD §4.4) ───────────────────────────────────

/**
 * Closed set of error codes adapters and the registry may throw.
 *
 * UI translation happens in Doable, not in adapters. Callers should match
 * on `code` rather than on `message` text.
 */
export type FrameworkAdapterErrorCode =
  | "missing-required-files"
  | "install-failed"
  | "unsupported-capability"
  | "framework-not-found";

export class FrameworkAdapterError extends Error {
  readonly code: FrameworkAdapterErrorCode;

  constructor(code: FrameworkAdapterErrorCode, message?: string) {
    super(message ?? code);
    this.name = "FrameworkAdapterError";
    this.code = code;
    // Keep the prototype chain intact when transpiled to ES5 targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
