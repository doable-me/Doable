# 02 — Framework Abstraction (PRD)

> Load-bearing PRD. Defines the `FrameworkAdapter` interface and the surrounding
> model so that adding a new framework is "write an adapter," not "edit Doable
> core." Grounded in the 24 hardcoded Vite surfaces enumerated in
> `_discovery/01-vite-flow.md:284-409`.
>
> **Reading order**: this PRD should be read alongside `_discovery/01-vite-flow.md`
> (the surfaces being abstracted) and `_discovery/02-runtime-infra.md` (sandbox /
> per-project process model — not designed here).

---

## 1. Goals & non-goals

### Goals

- **Specify a single adapter contract** that describes everything Doable needs
  from a framework: scaffold, install, dev, build, optionally serve, plus
  metadata (file shape, ignore patterns, locked configs, error overlay
  recognition, HTML injection point).
- **Replace the 24 hardcoded Vite assumptions** in `_discovery/01-vite-flow.md`
  with adapter calls so that none of `services/api/src/projects/*`,
  `services/api/src/deploy/*`, `services/api/src/templates/*`,
  `services/api/src/ai/*`, `services/api/src/routes/preview-proxy/*` mention
  Vite, Next.js, or any specific framework by name.
- **Make framework a first-class column** on `projects` and `templates` so
  the question "what framework is this project?" has one canonical answer.
- **Be log-format agnostic** — adapters MAY supply a structured `parseLog`,
  but the live log UI MUST never depend on it. Raw passthrough is the floor.
- **Keep the change additive for existing projects** — every Doable project
  on disk today is a Vite-React project; the migration plan in §9 ships the
  adapter without altering one byte of their behavior.

### Non-goals (deferred to other PRDs)

- **Per-project long-lived runtime / process supervision** — see
  `_discovery/02-runtime-infra.md` "Gaps for Next.js-style long-lived runtime"
  and the forthcoming `04-runtime-supervision.md`. This PRD specifies
  `dev()`/`serve()` *contracts* but not *how* a long-lived `serve()` is
  supervised, port-allocated, or routed through Caddy.
- **Build-event streaming protocol** — see `_discovery/03-streaming.md` and the
  forthcoming `05-build-event-protocol.md`. This PRD specifies that adapters
  emit raw stdout lines and an optional `parseLog`; how those lines reach the
  client is out of scope.
- **Template authoring UX / DB-vs-TS template debate** —
  `_discovery/01-vite-flow.md:454-457` open question. We *do* require that
  templates carry a `frameworkId`, but where templates live (TS module vs DB
  row vs both) is left to `06-templates.md`.
- **Framework conversion (Vite → Next.js in-place)** — out of scope to *implement*,
  but §6 imposes design rules so a future "convert" operation is not foreclosed.
- **Mobile build farm / Electron packaging plumbing** — adapters are defined
  in §8 (`expo` stub) but the build-host requirements (macOS for iOS, code
  signing) are a separate infrastructure PRD.
- **Multi-tenant isolation policy** — adapters expose hooks
  (`requiresOutboundNet`, `lockConfigsAtRuntime`) that future tightening can
  consume; the policy itself is `08-security.md`.

---

## 2. Conceptual model

Three layers, each with a single responsibility. Templates are *instances* of
a `FrameworkPack`; the `FrameworkAdapter` is the executable behavior bound to
that pack at runtime.

```
                              ┌──────────────────────────────────────┐
                              │            FrameworkRegistry         │
                              │   id → { pack, adapter, templates }  │
                              └───────────────┬──────────────────────┘
                                              │ resolves by frameworkId
                                              ▼
   ┌────────────────────────┐        ┌────────────────────────┐        ┌────────────────────┐
   │     FrameworkPack      │ uses → │   FrameworkAdapter     │        │      Template      │
   │  (declarative metadata)│        │  (executable behavior) │        │  (FrameworkPack +  │
   │                        │        │                        │        │   concrete files)  │
   │ - id                   │        │ - scaffold(ctx)        │        │                    │
   │ - family               │        │ - install(ctx)         │        │ - id               │
   │ - capabilities Set     │        │ - dev(ctx)             │        │ - frameworkId ───┐ │
   │ - defaults {host,...}  │        │ - build(ctx)           │        │ - codeFiles      │ │
   │ - requiredFiles[]      │        │ - serve?(ctx)          │        │ - tags / preview │ │
   │ - lockedConfigFiles[]  │        │ - parseLog?(line)      │        │                  │ │
   │ - listIgnore[]         │        │ - injectIntoHtml?(html)│        └──────────────────┼─┘
   │ - errorOverlay?(html)  │        │ - shouldReloadOnError? │                           │
   │                        │        │ - clearCacheBefore-    │                           │
   │                        │        │   Restart?(ctx)        │                           │
   └─────────┬──────────────┘        └────────┬───────────────┘                           │
             │                                │                                           │
             └──────── pack drives ───────────┘                                           │
                                                                                          │
   Project row:  projects.framework_id ───────────────────────────────────────────────────┘
                 (selected at create time from the chosen template;
                  override allowed; immutable once set, see §6)
```

### Why three layers

- **`FrameworkPack`** is *static and serializable*. The values it holds
  (`requiredFiles`, `listIgnore`, `lockedConfigFiles`, `capabilities`) are
  needed by code paths that never spawn a process — e.g. the AI file-search
  tool needs `listIgnore` (`_discovery/01-vite-flow.md:402-405`), the
  config-lock guard needs `lockedConfigFiles`
  (`_discovery/01-vite-flow.md:336-340`). Forcing those callers to instantiate
  an `Adapter` (which transitively imports the entire dev-server runtime)
  would be a layering disaster.
- **`FrameworkAdapter`** is *executable*. It owns the spawn-shaped methods
  (`scaffold`, `install`, `dev`, `build`, `serve`). It is allowed to import
  Node's `child_process`, `fs`, etc.
- **`Template`** is the user-facing shape: a `frameworkId` plus a
  `Record<filePath, content>`. The current `TemplateDefinition`
  (`_discovery/01-vite-flow.md:11-23`) gains exactly one field: `frameworkId`.
  No other shape change in v1.

This split also matches the existing import graph: `services/api/src/templates/`
already lives apart from `services/api/src/projects/` and
`services/api/src/deploy/`. `FrameworkPack` slots into the lightweight side;
`FrameworkAdapter` slots into the heavyweight side.

---

## 3. Capability flags

A `FrameworkPack` declares a `Set<Capability>`. Capabilities are *boolean
features Doable code paths key off* — they are NOT a free-form tag list.

```ts
type Capability =
  | "static-spa"                  // build output is a fully-static SPA
  | "static-export"               // framework can produce a static export
  | "ssr-node"                    // requires a long-lived Node process
  | "ssr-python"                  // long-lived Python (gunicorn / uvicorn)
  | "ssr-ruby"                    // long-lived Ruby (puma / rails server)
  | "mobile-build"                // produces a mobile artifact (ipa/apk/aab)
  | "electron-shell"              // produces a desktop artifact
  | "worker-target"               // Cloudflare/Deno/edge worker target
  | "hmr-supported"               // dev server supports HMR
  | "visual-edit-supported"       // source-map → DOM mapping is feasible
  | "html-injection-supported"    // proxy may inject <script> into responses
  | "requires-long-lived-process" // production hosting needs a server process
  | "needs-system-runtime"        // requires non-Node runtime on host (python/ruby/jvm)
  | "supports-base-path"          // deploys cleanly under /foo/ subpath
  | "build-emits-static-only";    // every build produces only static files
```

### Semantics — what each flag enables

| Capability                    | Doable behavior gated on it                                            |
|-------------------------------|------------------------------------------------------------------------|
| `static-spa`                  | Caddy `try_files {path} /index.html` SPA fallback (`_discovery/01-vite-flow.md:266`) |
| `static-export`               | Allowed to use `DoableCloudAdapter` (file-copy publish)                |
| `ssr-node` / `ssr-python` / `ssr-ruby` | Triggers `serve()` invocation, requires `RuntimeAdapter` (PRD 04) and Caddy `reverse_proxy` |
| `requires-long-lived-process` | Build pipeline does NOT terminate on `build()` complete; runtime adapter takes over |
| `hmr-supported`               | Preview proxy reload-on-error logic (`_discovery/01-vite-flow.md:343-346`) is wired |
| `visual-edit-supported`       | Visual-edit bridge injection enabled; absent → bridge omitted, edits via files only |
| `html-injection-supported`    | Proxy `injectIntoHtml` runs on `text/html` responses                   |
| `supports-base-path`          | Pipeline allowed to publish under `/<basePath>/`; absent → must publish at root |
| `mobile-build`                | Build artifact handed to mobile-publish adapter, not Caddy             |
| `electron-shell`              | Build artifact is a binary; download + signed-release flow             |
| `worker-target`               | Build artifact deployed to worker host, not Caddy                      |
| `build-emits-static-only`     | Static analyzer can short-circuit checks for runtime requirements      |

**Rule**: every code path in `services/api` that previously hardcoded a
Vite assumption MUST gate on a capability or call an adapter method. No new
capability is added without at least one consumer.

**Closed set, but extensible**: capabilities are a `type Capability = "..."`
union shipped with the framework module. Adding one is a typed change;
adapters cannot invent capabilities at runtime.

---

## 4. The `FrameworkAdapter` interface

### 4.1 Context types

```ts
// Common context passed into every adapter method that touches a project.
interface FrameworkContext {
  projectId: string;
  projectPath: string;        // absolute, e.g. /data/projects/{projectId}
  basePath: string;           // "/" or "/preview/{id}/" — proxy sub-path
  env: Record<string, string>; // resolved user env vars + Doable defaults
  userId?: string;            // for env resolution + audit
  signal?: AbortSignal;       // cancellation
}

interface ScaffoldContext extends FrameworkContext {
  templateFiles: Record<string, string>;  // template.codeFiles
  projectName?: string;
}

interface DevContext extends FrameworkContext {
  host: string;               // e.g. 127.0.0.1
  port: number;               // allocated by port pool, not by adapter
}

interface BuildContext extends FrameworkContext {
  target: "preview" | "production";
}

interface ServeContext extends FrameworkContext {
  host: string;
  port: number;
  buildOutputDir: string;     // produced by a previous build()
}
```

### 4.2 Result types

```ts
interface ScaffoldResult {
  filesWritten: string[];     // relative paths, for audit/log
  warnings?: string[];
}

interface InstallResult {
  durationMs: number;
  log: string;
  warnings?: string[];
}

interface DevSpec {
  command: string;            // execPath OR resolved binary; passed to spawn
  args: string[];
  cwd: string;
  env: Record<string, string>;
  // Readiness: "scan stdout/stderr for any of these substrings"
  // OR a custom async predicate. Most frameworks use substrings.
  readinessSignal:
    | { kind: "log-substring"; patterns: string[] }
    | { kind: "http-probe"; url: string; intervalMs: number; timeoutMs: number }
    | { kind: "custom"; ready: (streams: { stdout: NodeJS.ReadableStream; stderr: NodeJS.ReadableStream }) => Promise<void> };
  // After readiness, GET this URL to confirm reachability.
  // Expressed relative to the dev server (NOT relative to the proxy).
  healthUrl: string;          // typically `http://${host}:${port}${basePath}`
  // Optional cleanup steps when the dev process exits.
  exitCleanup?: (ctx: DevContext) => Promise<void>;
}

interface BuildSpec {
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

interface ServeSpec {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  port: number;
  healthUrl: string;          // checked by RuntimeAdapter before flipping live
  readinessSignal: DevSpec["readinessSignal"];
}

interface BuildEvent {
  level: "info" | "warn" | "error";
  phase?: "compile" | "bundle" | "type-check" | "asset" | "post";
  message: string;
  // Optional structured fields the UI can highlight.
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
}
```

### 4.3 The interface

```ts
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

  // Optional structured log parsing. Returns a BuildEvent for lines the
  // framework emits in a recognizable format; returns null for anything
  // unrecognized so the caller can passthrough as raw.
  // DEFAULT IF ABSENT: caller treats every line as raw passthrough — see §7.
  // CALLED BY: dev-server log publisher and build log publisher (PRD 05).
  parseLog?(line: string): BuildEvent | null;

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
  // brief surface 22 (ai/tool-messages.ts redacting "vite.config" → "build
  // settings", "npx vite" → "build tool").
  // DEFAULT IF ABSENT: identity (no redactions). Most frameworks override
  // because the AI can mention the tool name in passing.
  // CALLED BY: services/api/src/ai/tool-messages.ts.
  redactInUI?(text: string): string;
}
```

### 4.4 Method-by-method contract notes

- **Purity rules**: `dev()`, `build()`, and `serve()` are *spec-builders*, not
  spawners. Doable owns the spawn site (so vault/jail/resource policy is
  centralized). Adapters that need to *do* work before spawn (e.g. write a
  generated `next.config.js`) do it inside `scaffold()` or `install()`, not
  inside `dev()`.
- **Idempotency**: `scaffold()` and `install()` MUST be safe to re-run.
  `_discovery/01-vite-flow.md:55` (the `createProject` in-flight dedupe) is
  about concurrency, not about idempotence — the adapter still has to be
  re-runnable on cold start of a half-scaffolded project.
- **Cancellation**: every spec-builder receives `ctx.signal`. Adapters that
  do async work (e.g. fetching a remote starter zip) must respect it.
  Spawned processes are killed by Doable, not by the adapter.
- **Errors**: methods throw `FrameworkAdapterError` (a typed subclass of
  `Error`) with a `code` field — `"missing-required-files"`,
  `"install-failed"`, `"unsupported-capability"`, etc. UI translation
  happens in Doable, not in adapters.
- **Stateless**: adapter instances are singletons. They MUST NOT carry
  per-project state in instance fields. State lives in Doable
  (`projects.framework_id`, the in-memory `servers` Map, etc.).

---

## 5. Per-surface mapping

The 24 hardcoded Vite surfaces from `_discovery/01-vite-flow.md:284-409`
mapped to their abstraction. Surfaces 1-24 in the brief, by number:

| # | File:line                                                             | Hardcoded today                          | Abstraction                                          |
|---|-----------------------------------------------------------------------|------------------------------------------|------------------------------------------------------|
| 1 | `services/api/src/projects/file-manager.ts:91,126`                    | `["index.html","package.json"]`         | `adapter.defaults.requiredFiles` + `criticalFiles`  |
| 2 | `services/api/src/projects/file-manager.ts:23` (blankTemplate fallback)| Vite blank template                      | `adapter.defaults.fallbackTemplateId` (per-fw)      |
| 3 | `services/api/src/projects/file-manager.ts:206`                       | `npm install --legacy-peer-deps`         | `adapter.install(ctx)`                               |
| 4 | `services/api/src/templates/scaffolder.ts:111-119`                    | `npm install` / `npm run dev` constants  | `adapter.install` / `adapter.dev` (template id → adapter lookup) |
| 5 | `services/api/src/projects/dev-server-start.ts:102`                   | `node_modules/vite/bin/vite.js`          | `adapter.dev(ctx).command + .args`                   |
| 6 | `services/api/src/projects/dev-server-start.ts:122-134`               | Vite CLI args incl. `--strictPort --base`| `adapter.dev(ctx).args`                              |
| 7 | `services/api/src/projects/dev-server-start.ts:172,181`               | stdout `"Local:"` / `"ready in"`         | `adapter.dev(ctx).readinessSignal`                   |
| 8 | `services/api/src/projects/dev-server-start.ts:241`                   | health probe at `/preview/{id}/`         | `adapter.dev(ctx).healthUrl`                         |
| 9 | `services/api/src/projects/dev-server-ops.ts:202`                     | `rm -rf node_modules/.vite`              | `adapter.clearCacheBeforeRestart(ctx)`               |
| 10| `services/api/src/projects/vite-plugin-source-annotations.ts` (file)  | Vite plugin written + config patched     | Adapter-specific scaffold step (Vite adapter only); for non-Vite, capability `visual-edit-supported` may be absent in v1 — see open issues |
| 11| `services/api/src/projects/vite-jail.ts:4,99`                         | Locked-config list mentions Vite/PostCSS/Tailwind | `adapter.lockedConfigFiles(ctx)` returns per-framework list |
| 12| `services/api/src/routes/preview-proxy/proxy-handler.ts:165,187`      | `.vite/deps` & `/src/*.{tsx,...}` reload | `adapter.shouldReloadOnError({path,status,method})`  |
| 13| `services/api/src/routes/preview-proxy/proxy-handler.ts:112-156`      | HTML head/body injection                 | Default behavior in proxy + `adapter.injectIntoHtml?` override |
| 14| `services/api/src/deploy/builder.ts:61`                               | `outputDir = path.join(projectDir,"dist")`| `adapter.build(ctx).outputDir`                       |
| 15| `services/api/src/deploy/builder.ts:84`                               | `["vite","build","--outDir","dist","--base=..."]` | `adapter.build(ctx).command + .args`              |
| 16| `services/api/src/deploy/pipeline.ts:128` (basePath always "/")        | `basePath:"/"`                           | Capability `supports-base-path` + `adapter.build(ctx).args` consuming `ctx.basePath` |
| 17| `services/api/src/deploy/adapters/doable-cloud.ts` (static-only)       | Pure file-copy assumes static SPA         | Pipeline gates on capability `static-spa` ∨ `static-export`; SSR routed to RuntimeAdapter via `adapter.serve()` |
| 18| `services/api/src/services/caddy-domains.ts:40,70` (`try_files {path} /index.html`) | SPA fallback hardcoded         | Caddy generator branches on capability: `static-spa` → `try_files`; `requires-long-lived-process` → `reverse_proxy 127.0.0.1:{port}`; `static-export` → no fallback (404.html where present) |
| 19| `services/api/src/templates/definitions/*.ts` (every non-blank imports `vite.config.ts`) | Templates Vite-shaped     | `Template.frameworkId` field; v1 all existing templates default to `"vite-react"` (§9) |
| 20| `services/api/src/ai/build.ts:31,91`                                   | Spawns `npx vite build` and `npx vite --port N --host` | Replace with calls into `adapter.build` / `adapter.dev` (or remove the parallel path entirely — see open issues) |
| 21| `services/api/src/ai/preview-errors.ts:26`                             | `html.includes("vite-error-overlay")`    | `adapter.errorOverlay?(html)`                        |
| 22| `services/api/src/ai/tool-messages.ts:25,170,175`                      | `"vite.config"` → `"build settings"` etc. | `adapter.redactInUI?(text)`                          |
| 23| `services/api/src/ai/project-files.ts:17`                              | excludes `"dist"`                        | `adapter.listIgnore(ctx)` (concatenated with global ignores) |
| 24| `services/api/src/ai/providers/copilot-tools.ts:113`                   | "excluding node_modules, .git, dist"     | Tool description composed at runtime from `adapter.listIgnore(ctx)` |

**Sanity-check**: every surface maps to exactly one method or static field.
No surface requires *adding to* the adapter post-hoc; if a 25th surface
emerges during implementation, treat it as a sign the interface is
incomplete and revise §4 before patching the call site.

---

## 6. Framework selection

### 6.1 Where it lives

- New column: `projects.framework_id TEXT NOT NULL DEFAULT 'vite-react'`.
  - `NOT NULL` + default ensures every existing row gets `vite-react` on
    migration, preserving behavior.
  - The column is the *single source of truth* — code paths NEVER infer
    framework from disk shape (e.g. "is `next.config.js` present?"). They
    look up `projects.framework_id` and ask the registry.
- New column: `templates.framework_id TEXT NOT NULL`.
  - Templates are framework-tied today by file shape
    (`_discovery/01-vite-flow.md:383-387`); the column makes the tie
    explicit.

### 6.2 How a project picks one

```
   user picks template ──→  template.framework_id  ──→  projects.framework_id
                                 │
                                 │ (advanced UI: framework picker BEFORE template)
                                 │   filters templates by chosen frameworkId
                                 ▼
                            createProject({ projectId, templateId })
                                 │
                                 │  resolves frameworkId from template
                                 ▼
                            projects.framework_id  =  template.framework_id
```

Two flows, same result:

1. **Template-first** (default UX, no change for users today): user picks
   a template → its `framework_id` populates the project. v1 ships only
   `vite-react` templates so existing users see no difference.
2. **Framework-first** (post-v1 UX): user picks a framework → templates list
   filters → user picks a template within that framework. The template-first
   flow is a special case of this.

### 6.3 Override

- The API accepts `createProject({ projectId, templateId, frameworkOverride? })`
  in v2 to allow "use this template's files but pretend it's framework X."
  v1 disallows this (no UI, no API param). It is reserved as the seam for
  future "convert framework" flows.

### 6.4 Mismatch detection

Two checks at scaffold time:

1. **Required-files check**: `adapter.scaffold()` validates that
   `adapter.defaults.requiredFiles` exists in the merged file set
   (template files ∪ adapter additions). Throws `missing-required-files`
   otherwise. This replaces `_discovery/01-vite-flow.md:91,126`.
2. **Capability self-check**: at adapter registration, the registry
   verifies `adapter.id === pack.id`, `adapter.family === pack.family`,
   and that capabilities declared on the pack match capabilities the adapter
   actually implements (e.g. if `serve` is in the interface but capability
   `requires-long-lived-process` is absent, that's a registration error).

### 6.5 Convert-framework operation (out of scope to implement, in scope to not preclude)

A future "convert" operation would:

1. Read `projects.framework_id` (current).
2. Read `targetFrameworkId` (new).
3. Resolve the *delta scaffold* — files the new framework needs that the
   old one doesn't, files to remove, files to migrate.
4. Apply via a Yjs-aware writer so a connected editor sees the change
   live.
5. Update `projects.framework_id`.
6. Trigger `install()` for the new adapter.
7. Restart dev server (now spawning under the new adapter's `dev()` spec).

Design rules this PRD imposes to keep this future-feasible:

- `framework_id` is mutable in the schema (no `IMMUTABLE` constraint).
- `FrameworkAdapter` has no per-project state in instance fields (§4.4),
  so swapping adapters at runtime is a registry lookup, not a dependency
  graph rebuild.
- All file-shape rules (`requiredFiles`, `lockedConfigFiles`, `listIgnore`)
  are read fresh on every call site, never cached on the project row.

---

## 7. Format-agnostic log handling

**Design rule**: `parseLog` is OPTIONAL. The live log UI MUST stream every
stdout/stderr line as raw passthrough by default. Adapters that DO supply a
parser get richer affordances on top.

### 7.1 Floor: raw passthrough

Doable's dev-server stdout publisher (today: `dev-server-start.ts:167-184`,
which only buffers locally — see `_discovery/03-streaming.md:144-162`)
emits every line into the build-event channel verbatim. A user running
*any* framework — including one Doable doesn't ship an adapter for, via a
custom adapter installed at runtime — sees their full dev/build log with
zero loss.

### 7.2 Ceiling: structured events

When `adapter.parseLog(line)` returns a `BuildEvent`, the publisher emits
*both* the raw line (for the "Logs" tab) and the structured event (for
"Errors", "Files Changed", "Build Phase" affordances). When it returns
null, only the raw line.

### 7.3 Why this matters

The proximate failure mode this rule prevents: a future Vite minor version
changes the wording of `"ready in 312ms"` to `"server ready (312ms)"`. With
a parser-required design, the "Vite is ready" UI breaks until someone ships
an adapter patch. With this design, the UI continues to stream the raw line
and the only thing that breaks is the readiness *signal* (which is also
abstracted, §4.3 `readinessSignal`, and can be a regex / multi-pattern set
to absorb wording drift).

**Corollary**: NEVER make a framework's livability — its ability to scaffold,
install, dev, build, deploy — depend on a stable stdout format. Readiness
detection has fallbacks (timeout-based "process is alive → assume ready"
already exists at `_discovery/01-vite-flow.md:319-322`); parsers do not.

### 7.4 Wire-format implications

Build-event protocol (PRD 05) carries two event kinds:

- `build_log` — raw line, `{level, line}`. Always emitted.
- `build_event` — structured, `{level, phase, message, file?, line?, ...}`.
  Emitted iff `parseLog` returned non-null.

Clients render `build_log` always; they consume `build_event` when present
to highlight, group, or auto-fix.

---

## 8. Worked examples

### 8.1 Vite adapter (current behavior, minimal change)

```ts
import type { FrameworkAdapter, DevContext, BuildContext } from "@doable/framework";
import { writeFile, ensureDir } from "node:fs/promises";
import { join } from "node:path";

export const viteReactAdapter: FrameworkAdapter = {
  id: "vite-react",
  family: "node",
  displayName: "Vite + React",
  capabilities: new Set([
    "static-spa", "hmr-supported", "visual-edit-supported",
    "html-injection-supported", "supports-base-path", "build-emits-static-only",
  ]),
  defaults: {
    requiredFiles: ["index.html", "package.json"],
    criticalFiles: ["index.html", "package.json"],
    listIgnore: ["dist", "node_modules", ".git"],
    lockedConfigFiles: ["vite.config.ts", "vite.config.js", "postcss.config.js", "tailwind.config.ts"],
    fallbackTemplateId: "blank",
    devReadinessTimeoutMs: 90_000,
    buildTimeoutMs: 120_000,
  },
  async scaffold(ctx) {
    // Write template files (as today, file-manager.ts:117-122).
    for (const [rel, content] of Object.entries(ctx.templateFiles)) {
      const full = join(ctx.projectPath, rel);
      await ensureDir(join(full, ".."));
      await writeFile(full, content, "utf-8");
    }
    // Inject the Doable source-annotations Vite plugin (vite flow brief
    // surface 10). Done at scaffold so the plugin is present before
    // first dev-server start.
    await ensureSourceAnnotationsPlugin(ctx.projectPath);
    return { filesWritten: Object.keys(ctx.templateFiles) };
  },
  async install(ctx) {
    return runShell(["npm", "install", "--legacy-peer-deps"], {
      cwd: ctx.projectPath, env: ctx.env, timeoutMs: 180_000,
    });
  },
  dev(ctx: DevContext) {
    const viteEntry = join(ctx.projectPath, "node_modules", "vite", "bin", "vite.js");
    return {
      command: process.execPath,
      args: [viteEntry, "--host", ctx.host, "--port", String(ctx.port),
             "--strictPort", "--base", ctx.basePath],
      cwd: ctx.projectPath,
      env: { ...ctx.env, FORCE_COLOR: "0", BROWSER: "none" },
      readinessSignal: { kind: "log-substring", patterns: ["Local:", "ready in"] },
      healthUrl: `http://${ctx.host}:${ctx.port}${ctx.basePath}`,
    };
  },
  build(ctx: BuildContext) {
    return {
      command: "npx",
      args: ["vite", "build", "--outDir", "dist",
             ...(ctx.basePath !== "/" ? [`--base=${ctx.basePath}`] : [])],
      cwd: ctx.projectPath,
      env: { ...ctx.env, NODE_ENV: "production" },
      outputDir: "dist",
    };
  },
  parseLog(line) {
    if (line.includes("error")) return { level: "error", message: line.trim() };
    return null;
  },
  lockedConfigFiles() { return this.defaults.lockedConfigFiles; },
  listIgnore() { return this.defaults.listIgnore; },
  errorOverlay(html) { return html.includes("vite-error-overlay"); },
  shouldReloadOnError({ path, status }) {
    if (status !== 502 && status !== 504) return false;
    return path.includes(".vite/deps") || /\/src\/.+\.(tsx|jsx|ts|js)$/.test(path);
  },
  clearCacheBeforeRestart() { return ["node_modules/.vite"]; },
  redactInUI(text) {
    return text.replace(/vite\.config(\.(ts|js))?/g, "build settings")
               .replace(/npx vite/g, "build tool");
  },
};
```

### 8.2 Next.js adapter (App Router, prod SSR + dev mode)

```ts
export const nextjsAppAdapter: FrameworkAdapter = {
  id: "nextjs-app",
  family: "node",
  displayName: "Next.js (App Router)",
  capabilities: new Set([
    "ssr-node", "hmr-supported", "supports-base-path",
    "html-injection-supported", "requires-long-lived-process",
    // visual-edit-supported deliberately ABSENT in v1 — Next requires
    // a Babel/SWC plugin path that doesn't exist yet (open issue 5).
  ]),
  defaults: {
    requiredFiles: ["package.json"],            // no index.html for App Router
    criticalFiles: ["package.json", "next.config.js"],
    listIgnore: [".next", "out", "node_modules", ".git"],
    lockedConfigFiles: ["next.config.js", "next.config.mjs", "next.config.ts"],
    fallbackTemplateId: "nextjs-blank",
    devReadinessTimeoutMs: 120_000,
    buildTimeoutMs: 240_000,
  },
  async scaffold(ctx) { return writeAll(ctx.templateFiles, ctx.projectPath); },
  async install(ctx) {
    return runShell(["npm", "install", "--legacy-peer-deps"], { cwd: ctx.projectPath, env: ctx.env });
  },
  dev(ctx) {
    return {
      command: "npx",
      args: ["next", "dev", "-H", ctx.host, "-p", String(ctx.port)],
      cwd: ctx.projectPath,
      env: { ...ctx.env, NEXT_PUBLIC_BASE_PATH: ctx.basePath, FORCE_COLOR: "0" },
      readinessSignal: { kind: "log-substring", patterns: ["Ready in", "started server on", "Local:"] },
      healthUrl: `http://${ctx.host}:${ctx.port}${ctx.basePath === "/" ? "/" : ctx.basePath}`,
    };
  },
  build(ctx) {
    return {
      command: "npx", args: ["next", "build"], cwd: ctx.projectPath,
      env: { ...ctx.env, NODE_ENV: "production" },
      outputDir: ".next",
    };
  },
  serve(ctx) {
    return {
      command: "npx", args: ["next", "start", "-H", ctx.host, "-p", String(ctx.port)],
      cwd: ctx.projectPath, env: { ...ctx.env, NODE_ENV: "production" }, port: ctx.port,
      readinessSignal: { kind: "log-substring", patterns: ["started server on", "Ready"] },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },
  lockedConfigFiles() { return this.defaults.lockedConfigFiles; },
  listIgnore() { return this.defaults.listIgnore; },
  shouldReloadOnError({ path, status }) {
    if (status !== 502 && status !== 504) return false;
    return path.startsWith("/_next/static/") || path.startsWith("/_next/webpack-hmr");
  },
  clearCacheBeforeRestart() { return [".next/cache"]; },
};
```

### 8.3 Nuxt stub

```ts
export const nuxtAdapter: FrameworkAdapter = {
  id: "nuxt",
  family: "node",
  displayName: "Nuxt 3",
  capabilities: new Set(["ssr-node", "hmr-supported", "requires-long-lived-process",
                          "html-injection-supported", "static-export"]),
  defaults: {
    requiredFiles: ["package.json", "nuxt.config.ts"],
    criticalFiles: ["package.json", "nuxt.config.ts"],
    listIgnore: [".output", ".nuxt", "node_modules", ".git", "dist"],
    lockedConfigFiles: ["nuxt.config.ts"],
    fallbackTemplateId: "nuxt-blank",
    devReadinessTimeoutMs: 120_000,
    buildTimeoutMs: 240_000,
  },
  async scaffold(ctx) { return writeAll(ctx.templateFiles, ctx.projectPath); },
  async install(ctx) { return runShell(["npm", "install"], { cwd: ctx.projectPath, env: ctx.env }); },
  dev(ctx) {
    return {
      command: "npx", args: ["nuxt", "dev", "--host", ctx.host, "--port", String(ctx.port)],
      cwd: ctx.projectPath, env: { ...ctx.env, FORCE_COLOR: "0" },
      readinessSignal: { kind: "log-substring", patterns: ["Listening on", "ready in"] },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },
  build(ctx) {
    return {
      command: "npx", args: ["nuxt", "build"], cwd: ctx.projectPath,
      env: { ...ctx.env, NODE_ENV: "production" }, outputDir: ".output",
    };
  },
  serve(ctx) {
    return {
      command: "node", args: [".output/server/index.mjs"], cwd: ctx.projectPath,
      env: { ...ctx.env, HOST: ctx.host, PORT: String(ctx.port), NODE_ENV: "production" },
      port: ctx.port,
      readinessSignal: { kind: "http-probe", url: `http://${ctx.host}:${ctx.port}/`, intervalMs: 500, timeoutMs: 30_000 },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },
  lockedConfigFiles() { return this.defaults.lockedConfigFiles; },
  listIgnore() { return this.defaults.listIgnore; },
  clearCacheBeforeRestart() { return [".nuxt", ".output"]; },
};
```

### 8.4 Django stub

```ts
export const djangoAdapter: FrameworkAdapter = {
  id: "django",
  family: "python",
  displayName: "Django",
  capabilities: new Set(["ssr-python", "requires-long-lived-process", "needs-system-runtime"]),
  defaults: {
    requiredFiles: ["manage.py", "requirements.txt"],
    criticalFiles: ["manage.py", "requirements.txt"],
    listIgnore: ["__pycache__", ".venv", "venv", "staticfiles", ".git"],
    lockedConfigFiles: ["settings.py", "wsgi.py", "asgi.py"],
    fallbackTemplateId: "django-blank",
    devReadinessTimeoutMs: 60_000,
    buildTimeoutMs: 180_000,
  },
  async scaffold(ctx) { return writeAll(ctx.templateFiles, ctx.projectPath); },
  async install(ctx) {
    // Adapter assumes a system Python is available — capability flag
    // "needs-system-runtime" tells Doable to verify before invoking.
    return runShell(["python", "-m", "pip", "install", "-r", "requirements.txt"], { cwd: ctx.projectPath, env: ctx.env });
  },
  dev(ctx) {
    return {
      command: "python",
      args: ["manage.py", "runserver", `${ctx.host}:${ctx.port}`],
      cwd: ctx.projectPath, env: ctx.env,
      readinessSignal: { kind: "log-substring", patterns: ["Quit the server with", "Starting development server"] },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },
  build(ctx) {
    // Django doesn't have a "build" — collectstatic is the closest analog.
    return {
      command: "python", args: ["manage.py", "collectstatic", "--noinput"],
      cwd: ctx.projectPath, env: ctx.env, outputDir: "staticfiles",
    };
  },
  serve(ctx) {
    return {
      command: "gunicorn", args: ["wsgi:application", "-b", `${ctx.host}:${ctx.port}`],
      cwd: ctx.projectPath, env: { ...ctx.env, DJANGO_SETTINGS_MODULE: "settings" },
      port: ctx.port,
      readinessSignal: { kind: "log-substring", patterns: ["Listening at:", "Booting worker"] },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },
  lockedConfigFiles() { return this.defaults.lockedConfigFiles; },
  listIgnore() { return this.defaults.listIgnore; },
};
```

### 8.5 Expo (mobile) stub

```ts
export const expoAdapter: FrameworkAdapter = {
  id: "expo",
  family: "mobile",
  displayName: "Expo",
  capabilities: new Set(["mobile-build", "hmr-supported"]),
  defaults: {
    requiredFiles: ["package.json", "app.json"],
    criticalFiles: ["package.json", "app.json"],
    listIgnore: ["node_modules", ".expo", ".git", "ios/build", "android/build"],
    lockedConfigFiles: ["app.json", "expo.config.js", "metro.config.js"],
    fallbackTemplateId: "expo-blank",
    devReadinessTimeoutMs: 120_000,
    buildTimeoutMs: 1_200_000,    // mobile builds are slow
  },
  async scaffold(ctx) { return writeAll(ctx.templateFiles, ctx.projectPath); },
  async install(ctx) { return runShell(["npm", "install"], { cwd: ctx.projectPath, env: ctx.env }); },
  dev(ctx) {
    // Expo dev = Metro bundler; preview is via QR / device simulator,
    // not the iframe proxy. healthUrl is informational.
    return {
      command: "npx", args: ["expo", "start", "--port", String(ctx.port), "--host", "lan"],
      cwd: ctx.projectPath, env: { ...ctx.env, CI: "1" },
      readinessSignal: { kind: "log-substring", patterns: ["Metro waiting on", "Logs for your project"] },
      healthUrl: `http://${ctx.host}:${ctx.port}/`,
    };
  },
  build(ctx) {
    return {
      command: "npx", args: ["expo", "export", "--platform", "all"],
      cwd: ctx.projectPath, env: ctx.env, outputDir: "dist",
    };
  },
  // serve() absent — deploy is via a mobile-publish adapter (App Store / Play / EAS),
  // not Caddy + reverse_proxy. The pipeline routes on capability "mobile-build".
  lockedConfigFiles() { return this.defaults.lockedConfigFiles; },
  listIgnore() { return this.defaults.listIgnore; },
};
```

---

## 9. Migration plan

Goal: ship the adapter abstraction with **zero observable behavior change**
for existing Vite-React projects. Detail belongs to `07-impact-and-rollout.md`;
this section sketches the seven-step landing.

1. **Add the `@doable/framework` package** at `packages/framework/` exporting
   `FrameworkAdapter`, `Capability`, the registry, and the typed errors.
   No call sites changed yet.
2. **Implement `viteReactAdapter`** (§8.1) inside the package, copying
   behavior verbatim from current call sites. Add unit tests that reproduce
   `_discovery/01-vite-flow.md` quoted line numbers' behavior.
3. **Add `framework_id` columns** to `projects` and `templates` with default
   `'vite-react'`. Migration is non-destructive (existing rows backfill).
4. **Replace call sites surface-by-surface**, *one PR per surface*, in the
   order of the table in §5. Each PR:
   - Replaces the hardcoded constant/string/spawn with a call to the
     resolved adapter.
   - Verifies behavior with the existing test suite plus a new "still
     scaffolds, still dev-servers, still builds" smoke test.
   - Does NOT add a second framework. Vite remains the only registered
     adapter through the entire migration.
5. **Audit call site coverage**: grep for `vite`, `dist`, `index.html`,
   `Local:`, `ready in`, `vite.config`, `node_modules/vite`, `npm install`,
   `npx vite` across `services/api/src/` excluding `vite-jail.ts` and
   `vite-plugin-source-annotations.ts` (which are adapter implementation
   details). Zero hits = adapter is the only abstraction layer.
6. **Register `nextjsAppAdapter`** behind a feature flag. Add one Next.js
   template. Keep the flag off in prod until a smoke project proves
   end-to-end.
7. **Drop the flag** when the smoke test passes for ≥ 7 days. Open the
   Next.js template to users.

Existing project rows: untouched. `framework_id = 'vite-react'`, scaffold
files unchanged, dev/build behavior unchanged. The user-visible artifact
is "Choose framework" appearing in the new-project flow.

---

## 10. Open issues

1. **Visual-edit on non-Vite frameworks.** Surface 10 in
   `_discovery/01-vite-flow.md` (the Vite source-annotations plugin) is
   what powers click-to-edit. Decision needed: do we ship `nextjs-app`
   *without* `visual-edit-supported` (and accept a degraded editor for
   Next.js projects until a Babel/SWC plugin lands), or block Next.js
   shipping on visual-edit parity? Recommendation: ship without; visual
   edit becomes a per-framework capability and the editor UI gates the
   click-to-edit affordance on it.

2. **AI build duplication.** `services/api/src/ai/build.ts` (surface 20)
   is a parallel spawn path. Should it call the same adapter, or should
   it be deleted in favor of the canonical
   `dev-server-start`/`builder.ts` paths? The duplicate path is a
   correctness risk during migration — easy to update one and forget the
   other. Recommendation: replace with adapter calls, then evaluate
   whether the duplicate path has any unique caller. Defer to
   `07-impact-and-rollout.md`.

3. **`PROJECTS_ROOT` vs `DOABLE_PROJECTS_DIR` drift.**
   `_discovery/01-vite-flow.md:441` (and the matching
   `_discovery/02-runtime-infra.md` references) note two env vars
   resolving the same path. Fold the fix into the migration since every
   adapter needs `ctx.projectPath` resolved consistently.

4. **Framework ID naming.** `"vite-react"` vs `"vite"` vs `"react"`. Today
   templates are React-only via Vite; tomorrow we may want
   `"vite-vue"` / `"vite-svelte"` / `"vite-solid"`. Recommendation: keep
   the bundler-language form (`"vite-react"`, `"vite-vue"`, …) so the
   capability set is unambiguous. Rejected: `"react"` (ambiguous between
   Vite-React, Next.js App, RSC).

5. **Capability vs adapter for visual-edit annotator.** Should the
   source-annotations plugin be a *capability the adapter implements*
   (i.e. `adapter.installVisualEditAnnotator(ctx)` on top of `scaffold`),
   or a *separate `VisualEditProvider` interface*? Recommendation:
   capability + adapter method, so the wiring stays in one place; revisit
   if a single adapter needs multiple annotator backends.

6. **Per-framework env-var policy.** `_discovery/02-runtime-infra.md`
   notes Vite passes vault env vars at spawn; SSR frameworks may need
   restart-on-rotate. Should `FrameworkAdapter` declare an `envPolicy:
   "spawn-time" | "live-reload"` field? Probably yes — but the consumer
   (the runtime supervisor PRD 04) needs to be the one to drive it, so
   this PRD only marks the seam.

7. **Caddy SPA-fallback for static-export non-SPAs.** Surface 18 mentions
   that Next.js static export uses `404.html` rather than `index.html` as
   the fallback. The Caddy generator branches today on capability
   `static-spa`; we may need `static-export-with-404` as a *separate*
   capability. Defer to `07-impact-and-rollout.md` once Next-export is
   actually exercised end-to-end.

8. **`needs-system-runtime` provisioning.** Adapter declares the need
   (Python, Ruby, JVM); installing it is out of scope here. Open: does
   Doable refuse projects whose `family` doesn't have a host runtime,
   or pre-install at server bring-up? Recommendation: refuse with a
   clear error in v1; expand later.

9. **Mobile / Electron deploy adapters.** `expoAdapter.serve` is absent
   because mobile artifacts deploy via App Store / Play / EAS, not
   Caddy. The deploy pipeline (`services/api/src/deploy/pipeline.ts`)
   today assumes a single `DeployAdapter` resolving to
   `DoableCloudAdapter`. Adding a `MobilePublishAdapter` is a separate
   PRD; this PRD declares the capability flag (`mobile-build`) so
   pipeline branching has a typed seam.

10. **Convert-framework v2.** §6.5 lays the design rules but does not
    specify the data flow for "convert this Vite project to Next.js."
    Defer to a future PRD; the rules in §6.5 are the constraints that
    must hold for that PRD to be feasible.

---

## Appendix A — File:line citations

All claims in this PRD trace to `_discovery/01-vite-flow.md` (or its
referenced source files) at the line numbers in §5. The 24-surface table
is the single source of truth for "what needs abstracting"; if a surface
is added or removed there, this PRD must be revised.
