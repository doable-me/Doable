# 01 — Current Vite Flow (Discovery Brief)

Discovery is read-only and time-boxed. Paths are absolute under
`services/api/src/...` unless noted. Line numbers are point-in-time refs.

---

## Templates

- **Template type definition**: `services/api/src/templates/registry.ts:11-23`
  ```ts
  interface TemplateDefinition {
    id: string;
    name: string;
    description: string;
    category: string;            // e.g. "starter"
    tags: string[];              // e.g. ["react","vite","tailwind",...]
    previewImageUrl: string | null;
    isOfficial: boolean;
    codeFiles: Record<string, string>;     // file path → file content
    contextOverrides?: Record<string, string>; // .doable/<filename> overrides
  }
  ```
  Plus `TemplateSummary` (no `codeFiles`, has `fileCount`).

- **Built-in template files** (`services/api/src/templates/definitions/`):
  - `blank.ts` — canonical Vite+React+TS+Tailwind4 starter (the source of truth that all
    others import from). See `blankTemplate.codeFiles`:
    - `package.json` (scripts: `dev: "vite"`, `build: "tsc -b && vite build"`,
      `preview: "vite preview"`; deps: react 19, vite ^6, @tailwindcss/vite ^4,
      @vitejs/plugin-react)
    - `vite.config.ts` — `defineConfig({ plugins: [react(), tailwindcss()],
      resolve.alias["@"]="./src", server: { host: true, allowedHosts: true } })`
    - `tsconfig.json`, `index.html` (script src `/src/main.tsx`),
      `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/utils.ts`
  - `blog.ts`, `ecommerce-store.ts`, `landing-page.ts`, `portfolio.ts`,
    `saas-dashboard.ts`, `todo-app.ts` — each does
    `"vite.config.ts": blankTemplate.codeFiles["vite.config.ts"]!` (literal
    Vite-config copy, see grep below).
  - Sidecar `*-components.ts` files extend the base template with extra components
    (e.g. `blog-code-components.ts`, `ecommerce-store-components.ts`,
    `todo-app-components.ts`).

- **Registration** (`services/api/src/templates/registry.ts:39-47`): hardcoded
  `BUILT_IN_TEMPLATES = new Map<string, TemplateDefinition>([...])` keyed by
  `template.id`. Public surface:
  - `getTemplates(filter?: { category?, search? }): TemplateSummary[]` (line 52)
  - `getTemplate(id: string): TemplateDefinition | undefined` (line 80)
  - `getCategories(): string[]` (line 87)

- **DB-backed scaffold path** (`services/api/src/templates/scaffolder.ts`):
  `scaffolder(sql).scaffoldFromTemplate({ projectId, templateId, projectName? })`
  inserts every `template.codeFiles[path]=content` into the `project_files`
  table (line 142-148). `getInstallCommand()` always returns `"npm install"`
  (line 110-113), `getDevCommand()` always returns `"npm run dev"` (line 118).
  Both are framework-blind constants today.

---

## Project scaffold

- **Entry**: `createProject(projectId, templateFiles?)` —
  `services/api/src/projects/file-manager.ts:55`
  - In-flight dedupe map at line 48 (`scaffoldingInFlight`).
  - Internal `doCreateProject()` line 74:
    1. `getProjectPath(projectId)` (line 78)
    2. Throws `ProjectExistsError` if `package.json` already exists (line 81)
    3. Validates that `templateFiles` (if provided) contains the **hardcoded
       required pair** `["index.html","package.json"]` (line 91) — this is the
       first Vite assumption: any non-Vite framework would scaffold without
       `index.html`.
    4. Falls back to `blankTemplate.codeFiles` (line 110) when no/invalid
       template files supplied.
    5. Writes every entry to disk via `fsMkdir(...,{recursive:true})` +
       `fsWriteFile(fullPath, content, "utf-8")` (line 117-122). Bypasses Yjs.
    6. Validates **critical files** `["index.html","package.json"]` exist
       on disk (line 126) — second hardcoded Vite expectation.
    7. Calls `runPnpmInstall(projectPath)` (line 141).
    8. `initRepo(projectPath)` for git (line 153).

- **On-disk root** (`services/api/src/ai/project-files.ts:8`):
  `PROJECTS_ROOT = process.env.DOABLE_PROJECTS_DIR ?? join(process.cwd(),"projects")`.
  - Pipeline override (`services/api/src/deploy/pipeline.ts:18`):
    `PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "/data/projects"` (NOTE:
    different env var name from the file-manager — possible drift).
  - `getProjectPath(projectId)` returns `{root}/{projectId}`.

- **Install trigger** (`services/api/src/projects/file-manager.ts:202`):
  `runPnpmInstall(cwd)` actually invokes
  `spawn("npm", ["install","--legacy-peer-deps"], { cwd, shell:true, ... })`.
  Comment at line 204 explains: pnpm in monorepo would treat the project as a
  workspace member, so npm is used. Timeout 180s. On Windows, `taskkill /T /F`
  is used to kill the tree.
  - Re-trigger surface: `ensureDependencies(projectId)` (line 188) — runs
    install if `node_modules/` is missing on a previously-scaffolded project.
  - Helpers: `isProjectScaffolded(id)` (checks `package.json`),
    `hasNodeModules(id)` (checks `node_modules/`).

---

## Dev server / preview

- **Public surface**: `services/api/src/projects/dev-server.ts` re-exports from:
  - `dev-server-core.ts` — types, port pool, registry maps
  - `dev-server-start.ts` — `startDevServer(projectId, opts?)`
  - `dev-server-ops.ts` — stop, query, restart, getRunningServers, …

- **Start**: `startDevServer(projectId, opts?: { userId? })` —
  `services/api/src/projects/dev-server-start.ts:25`
  - In-flight dedupe via `startingServers` map (`dev-server-core.ts:49`).
  - Internal `doStartDevServer()` (line 65):
    1. `allocatePort()` (`dev-server-core.ts:77`) — walks ports
       `PORT_RANGE_START=3100 .. PORT_RANGE_END=3200` (`dev-server-core.ts:10-11`)
       and only returns a port that is BOTH absent from `usedPorts` AND verified
       free with `createTcpServer().listen(port, DEV_SERVER_HOST)` (line 58).
    2. `ensureSourceAnnotationsPlugin(projectPath)`
       (`vite-plugin-source-annotations.ts:220`) — writes
       `{projectPath}/.doable/vite-plugin-source-annotations.js` and patches
       `vite.config.ts` to import it (line 247) and inject it at the head of
       the `plugins: [...]` array (line 271).
    3. Computes `base = "/preview/${projectId}/"` (line 98) and the
       node-resolved Vite entry path
       `viteEntry = path.join(projectPath, "node_modules","vite","bin","vite.js")`
       (line 102).
    4. Resolves user env vars via `resolveProjectEnvVars(projectId, "development",
       undefined, opts?.userId)` (line 112).
    5. Spawns Vite via `spawnJailedVite({ execPath: process.execPath, args:
       [viteEntry, "--host", DEV_SERVER_HOST, "--port", String(port),
       "--strictPort", "--base", base], cwd: projectPath, env: {...userEnvVars,
       FORCE_COLOR:"0", BROWSER:"none"}, projectId })` (line 122).
    6. Detects readiness by stdout/stderr containing `"Local:"` or
       `"ready in"` (lines 172, 181) — Vite-specific log scraping.
    7. `STARTUP_TIMEOUT_MS = 90_000` (`dev-server-core.ts:13`); on timeout, if
       process is alive, marks ready anyway.
    8. HTTP health check loop: GET `http://localhost:${port}/preview/${id}/` ×10
       (line 241-258); failures non-fatal.
  - Returns `{ url: "/preview/${projectId}/", port }` — proxy-relative.

- **Stop**: `stopDevServer(projectId)` — `dev-server-ops.ts:21`. On Windows uses
  `taskkill /pid PID /T /F` (line 37) to defeat shell-wrapped child trees;
  elsewhere SIGTERM, then SIGKILL after 5s.

- **Restart**: `restartDevServer()` — `dev-server-ops.ts:192`. Stops, then
  `rm -rf {projectPath}/node_modules/.vite` (line 202) to flush Vite's
  pre-bundle cache, then `startDevServer()` again. Used after `install_package`.

- **Process jail**: `spawnJailedVite(opts)` — `services/api/src/projects/vite-jail.ts:82`.
  Uses `dovault` (`createVault(...)`) to spawn a jailed child (cgroup memory/cpu
  limits, fs jail to `cwd`). Limits via env: `VITE_MEMORY_MAX=256M`,
  `VITE_CPU_QUOTA=50%`, `VITE_TASKS_MAX=128` (line 16-20). On vault failure
  falls back to raw `spawn`. Vault opts: `lockConfigs:false` (AI legitimately
  edits vite.config.ts/postcss.config.js), `blockChildProcess:false` (esbuild
  workers), `blockOutboundNet:false` (HMR ws).

- **Port allocation summary**: in-memory `usedPorts: Set<number>` +
  TCP-listen probe; range hardcoded 3100-3200 (~100 concurrent projects).

- **Proxy contract**: `services/api/src/routes/preview-proxy/proxy-handler.ts`
  - Route: `previewRoutes.all("/preview/:projectId/*", ...)` (line 29).
    - UUID validation (line 33).
    - Auto-start: `if (!isRunning && isProjectScaffolded) { ensureDependencies();
      startDevServer(); }` (line 37).
    - Resolve internal URL via `getDevServerInternalUrlWhenReady(projectId)`
      (line 47, defined in `dev-server-ops.ts:117`); returns 503 + `Retry-After:
      3` HTML on miss.
    - Forwards `${devUrl}${originalPath}` (line 56), preserves query (line 60),
      streams `c.req.raw.body` for non-GET (line 76).
    - Strips hop-by-hop headers (line 82-91), forces
      `Cache-Control: no-store` (line 106).
    - **HTML injection** (only on `content-type: text/html`, line 112-156):
      - `<head>` start: storage namespacing snippet
        (`getStorageNamespaceSnippet(projectId)` from `injected-scripts.ts`).
      - Before `</head>`: `ERROR_CAPTURE_SNIPPET` + meta
        `doable-project-id` + `<script>${getTrackingScript(publicApiUrl)}</script>`.
      - Before `</body>`: `<script>${VISUAL_EDIT_BRIDGE_INLINE}</script>` (from
        `services/api/src/visual-edit-bridge-inline.ts`).
    - **Vite-specific error rewriting** (line 165): if response status is 504/502
      AND path includes `.vite/deps`, returns a JS snippet that does
      `window.location.reload()` to recover from "Outdated Optimize Dep" /
      restart races. Same on fetch failure for `.vite/deps` or `/src/*.{tsx,jsx,ts,js}`
      (line 187).
  - Trailing-slash redirect: `previewRoutes.all("/preview/:projectId", ...)`
    (line 213).

- **HTML injection assumes**: a `text/html` document response served by the
  framework dev server with `<head>`/`</head>`/`<body>` tags. Works for Vite
  because Vite serves `index.html` directly. SSR frameworks would render HTML
  too, but path semantics differ (e.g. Next.js `_next/`, Nuxt `_nuxt/`).

---

## Build & publish

- **Build entry**: `runBuild(projectDir, onLog?, opts?)` —
  `services/api/src/deploy/builder.ts:27`
  - `BUILD_TIMEOUT_MS = 120_000` (line 6).
  - Hardcodes output path: `outputDir = path.join(projectDir, "dist")` (line 61).
  - Resolves env via `resolveProjectEnvVars(projectId, target, undefined, userId)`
    (line 70) when `opts.projectId` provided; user env vars override vault.
  - Build args (line 84):
    `["vite","build","--outDir","dist", `--base=${basePath}` (if non-"/")]`.
  - Spawns `npx <args>` via shell (line 89), `cwd: projectDir`,
    `env: { ...process.env, ...userEnvVars, NODE_ENV: "production" }`.
  - Streams stdout+stderr to `onLog?` callback (line 113-123) and to a
    captured chunks buffer.
  - Returns `BuildResult { success, outputDir, log, durationMs, error? }`.

- **Build-output validation**: `validateBuildOutput(outputDir)` (line 163)
  — counts files; "valid" iff non-empty.

- **Pipeline**: `runPipeline(input)` —
  `services/api/src/deploy/pipeline.ts:67`
  - Steps:
    0. Look up `projects.findById(projectId)` and `workspaces.findById(...)`.
    1. Ensure subdomain (`generateSubdomain` x5 retries, fallback to
       `projectId.slice(0,8)`); persist on project.
    2. `deployments.create({ projectId, environment, adapter, deployedBy:userId })`.
    3. `deployments.updateStatus(id,"building")` →
       `runBuild(projectDir, onBuildLog, { projectId, target:env, userId,
       basePath: publishLoc.basePath })` (line 132). `projectDir = path.join(
       PROJECTS_ROOT, projectId)`.
    4. On failure: status=failed, returns `PipelineResult` with error.
    5. `deployments.updateStatus(id,"deploying")` → `adapter.deploy({ projectId,
       projectSlug, workspaceSlug, subdomain, buildOutputDir: buildResult.outputDir,
       environment, basePath })` (line 164).
    6. `deployments.createArtifacts(id, deployResult.files)` (non-fatal).
    7. `deployments.updateStatus(id,"live", { url, buildLog, ... })`.
    8. If env="production": `projects.update(id, { publishedUrl, status:"published" })`.

- **Adapter (the only one today)**: `DoableCloudAdapter` —
  `services/api/src/deploy/adapters/doable-cloud.ts:58`
  - `SITES_DIR = process.env.SITES_DIR ?? (win32 ? cwd/data/sites : "/data/sites")`
    (line 13).
  - `DOMAIN = process.env.DOABLE_DOMAIN ?? "doable.me"` (line 19).
  - `SUBDOMAIN_PREFIX = process.env.PUBLISH_SUBDOMAIN_PREFIX ?? ""` (dev sets
    `dev-`).
  - `computeSitePublishLocation(subdomain, environment)` (line 31):
    `siteSubdomain = `${SUBDOMAIN_PREFIX}${env==="preview"?"p-":""}${subdomain}``;
    `hostname = `${siteSubdomain}.${DOMAIN}``; `url = `https://${hostname}``;
    `basePath: "/"` (always).
  - `deploy(input)` (line 61):
    - Validates `existsSync(buildOutputDir)` and non-empty.
    - `envDir = environment==="preview" ? "test" : "live"` (line 93).
    - `targetDir = SITES_DIR/{subdomain}/{envDir}`.
    - `mkdir(siteDir)` → `rm targetDir` → `mkdir targetDir` → `cp -r
      buildOutputDir targetDir` (line 97-108).
    - `collectFileInfo(targetDir, targetDir)` walks recursively, returning
      `{ path, size, hash:sha256 }[]`.
    - Optional `cloudflared tunnel route dns ${TUNNEL_ID} ${hostname}`
      (line 145-155, env-gated by `CLOUDFLARED_TUNNEL_ID`).
  - `teardown(projectId, environment)` is a no-op stub today (line 176, just
    enumerates dirs).

- **`generateSubdomain(projectName)`** (line 291): slugify, drop stopwords,
  take last 2 words, append 5-char random suffix; cap 30 chars.

- **Caddy contract** — `services/api/src/services/caddy-domains.ts`
  - `SITES_DIR=/data/sites`, `CADDYFILE_PATH=/etc/caddy/Caddyfile`,
    `DOABLE_DOMAIN=doable.me` (lines 14-16).
  - `generateCaddyfile(customDomains)` produces `:8080 { bind 127.0.0.1 ... }`
    listening on loopback, with a wildcard handler that derives the subdomain
    via `header_regexp subdomain Host ^([a-z0-9][-a-z0-9]*)\.doable\.me$`
    and serves:
    ```
    root * /data/sites/{re.subdomain.1}/live
    try_files {path} /index.html         # ← SPA fallback, hardcoded for Vite
    file_server
    ```
    (lines 64-81). Custom domain blocks repeat the same `try_files {path}
    /index.html` (line 40).
  - `applyCaddyConfig()` writes the file and `systemctl reload caddy` on Linux
    (line 109); logs only on Windows.
  - **Caddy → slug routing**: hostname's first label *is* the directory name
    under `/data/sites/`, with a fixed `/live` (production) or `/test`
    (preview) suffix from the adapter. Caddy itself does not know about
    preview: the adapter writes the preview output to `/test/` but the
    serving Caddyfile only routes to `/live`. **Probable bug or
    deliberate policy**: preview hosting may rely on Cloudflare splitting
    `p-{subdomain}.doable.me` to a different directory — needs design
    confirmation.

---

## Hardcoded Vite assumptions (CRITICAL — the abstraction surface)

Each entry: file:line — what it assumes — what would change for Next.js / Nuxt /
Django / static / etc.

1. **`services/api/src/projects/file-manager.ts:91,126`** —
   required+critical-file gate is hardcoded `["index.html","package.json"]`.
   - Next.js apps have NO `index.html`. SvelteKit/Nuxt also no static
     `index.html`. → Replace with framework-supplied `requiredFiles: string[]`.

2. **`services/api/src/projects/file-manager.ts:23`** — falls back to
   `blankTemplate` (Vite blank) when template missing. → Fallback should be
   per-framework, or the framework dimension should be required.

3. **`services/api/src/projects/file-manager.ts:206`** — install command
   hardcoded `npm install --legacy-peer-deps`. → Framework adapter should
   provide `installCommand` (npm/pnpm/yarn/poetry/pip/bundle).

4. **`services/api/src/templates/scaffolder.ts:111-119`** —
   `getInstallCommand()` returns `"npm install"`, `getDevCommand()` returns
   `"npm run dev"`, both ignoring `templateId`. → Per-framework lookup.

5. **`services/api/src/projects/dev-server-start.ts:102`** — Vite entry
   resolved as `node_modules/vite/bin/vite.js`. → Framework adapter `devEntry()`.

6. **`services/api/src/projects/dev-server-start.ts:122-134`** — spawn args
   hardcoded `[viteEntry, "--host", host, "--port", port, "--strictPort",
   "--base", base]`. Strict-port and `--base` semantics are Vite-specific. →
   Adapter `buildDevArgs({ host, port, base, env })`.

7. **`services/api/src/projects/dev-server-start.ts:172,181`** — readiness
   detection by stdout substring `"Local:"` / `"ready in"`. → Adapter
   `readinessSignal(stream): Promise<void>` — Next.js prints
   `"Ready in"`/`"started server on"`, Django `"Quit the server with"`, etc.

8. **`services/api/src/projects/dev-server-start.ts:241`** — health-check URL
   `/preview/{id}/` assumes the framework respects `base`. Next.js uses
   `basePath` in `next.config.js`, not a CLI flag. → Adapter computes
   `previewHealthUrl(internalUrl)`.

9. **`services/api/src/projects/dev-server-ops.ts:202`** — restart clears
   `node_modules/.vite`. → Adapter `clearCacheBeforeRestart()`; Next.js
   would clear `.next/cache`.

10. **`services/api/src/projects/vite-plugin-source-annotations.ts`** —
    *entire file*. Generates a Vite plugin (`enforce:"pre"` + `transform`)
    that injects `data-source` attributes into JSX/TSX, and patches
    `vite.config.ts` to register it. → For Next.js this would be a Babel/SWC
    plugin entry in `next.config.js` or a webpack loader; for Nuxt a Nitro
    plugin; for non-JSX frameworks a different approach entirely. Surface to
    extract: "install build-time JSX source-map plugin compatible with this
    framework."

11. **`services/api/src/projects/vite-jail.ts:4,99`** — config-lock list comment
    `vite.config.ts, postcss.config.js, tailwind.config.ts`. Currently
    `lockConfigs:false` so it's advisory, but the list and isLockedConfigFile
    surface (line 140) presume Vite. → Per-framework locked-config list.

12. **`services/api/src/routes/preview-proxy/proxy-handler.ts:165,187`** —
    Vite-specific recovery: `.vite/deps` and `/src/*.{tsx,jsx,ts,js}` 502/504
    rewrites to `window.location.reload()`. → Adapter
    `shouldReloadOnError(req, status)`; Next.js uses `_next/static/chunks/`
    paths and HMR errors look different.

13. **`services/api/src/routes/preview-proxy/proxy-handler.ts:112-156`** — HTML
    injection (visual edit bridge, error capture, tracker, doable-project-id
    meta, storage namespace). Assumes static `text/html` with `<head>` and
    `<body>`. SSR frameworks generate streaming HTML; injection point may
    differ. → Adapter `injectIntoHtml(html)` or a pluggable middleware that
    runs on the serialized doc.

14. **`services/api/src/deploy/builder.ts:61`** — output dir is
    `path.join(projectDir,"dist")` — Vite default. Next.js: `.next/`,
    `out/` (export). Nuxt: `.output/public/`. Astro: `dist/`. SvelteKit:
    `build/`. Django: `staticfiles/`. → Adapter `buildOutputDir`.

15. **`services/api/src/deploy/builder.ts:84`** — build args
    `["vite","build","--outDir","dist","--base=..."]` → Adapter
    `buildCommand({ basePath })`. Build is single-shot via `npx`; SSR
    frameworks may need a multi-step (e.g. `next build && next export`).

16. **`services/api/src/deploy/pipeline.ts:128`** — `computeSitePublishLocation`
    always returns `basePath:"/"` (and the adapter only supports root).
    Vite supports `--base=/foo/`; Next.js supports `basePath` in config.
    Path-based hosting is half-wired (basePath flows through but adapter
    paths are root). → Adapter `supports({ basePath })`.

17. **`services/api/src/deploy/adapters/doable-cloud.ts`** — adapter is
    pure file-copy of static assets. Assumes the framework produces a
    static SPA. Next.js (SSR), Nuxt (SSR), Django (server) need a runtime
    process — would require a different adapter (e.g. `process-supervised`)
    or build-time export to static.

18. **`services/api/src/services/caddy-domains.ts:40,70`** — Caddy serves
    with `try_files {path} /index.html` — SPA fallback that requires an
    `index.html` to exist at the site root. → For Next.js export this
    fallback should be `404.html` (or use Next's static export semantics);
    for SSR frameworks Caddy must reverse-proxy to a per-project port.

19. **`services/api/src/templates/definitions/*.ts`** — every non-blank
    template literally imports `blankTemplate.codeFiles["vite.config.ts"]!`.
    Templates are framework-tied today by file shape (tsx files, vite config).
    → Templates need a `framework: "vite-react" | "nextjs" | ...` field;
    `TemplateDefinition` should be parameterized over framework.

20. **`services/api/src/ai/build.ts:31,91`** — separate AI tool path that
    spawns `npx vite build` and `npx vite --port N --host`. This is a parallel
    invocation surface (used by AI tools, distinct from `runBuild`/dev server)
    and bakes in Vite as well.

21. **`services/api/src/ai/preview-errors.ts:26`** — error parser checks
    `html.includes("vite-error-overlay")` to identify build/runtime errors
    in preview HTML. → Adapter `recognizeErrorOverlay(html)`.

22. **`services/api/src/ai/tool-messages.ts:25,170,175`** — UI strings that
    redact "vite.config" → "build settings", "npx vite" → "build tool".
    → Per-framework redaction map.

23. **Project file-listing exclusions** — `services/api/src/ai/project-files.ts:17`
    excludes `"dist"`. `services/api/src/ai/tools/search-files.ts:61` excludes
    `--glob "!dist"`. → Per-framework ignore list (`.next`, `.output`,
    `__pycache__`, etc.).

24. **`services/api/src/ai/providers/copilot-tools.ts:113`** — tool
    description text "excluding node_modules, .git, dist". Same per-framework
    exclusion concern.

---

## Open questions for design wave

1. **What is the framework boundary?** A single `FrameworkAdapter` interface
   covering scaffold/install/dev/build/serve, OR multiple smaller adapters
   (TemplateProvider, DevRunner, Builder, Server) composed per framework?

2. **Where does framework selection live?** On `templates.framework` (per
   template), on `projects.framework` (per project, override allowed), or
   inferred from `package.json`/disk shape on first `startDevServer`?

3. **Preview vs. live Caddy paths**: `/data/sites/{slug}/test/` is written
   by the deploy adapter but the wildcard Caddy block only serves `/live`.
   How do `p-{subdomain}` previews reach `test/` today? Is there an unshipped
   second wildcard, or does `SUBDOMAIN_PREFIX` handle it via separate
   Cloudflare tunnels? Critical for SSR adapters that need port-based routing.

4. **SSR support in scope?** The current static-file pipeline cannot host
   Next.js with SSR. If "Next.js next" means static export (`output:"export"`),
   the abstraction is small (mostly `outputDir`, `requiredFiles`, build
   command). If full SSR, we need a per-project long-lived process model and
   Caddy reverse-proxy entries — a much larger change.

5. **HMR / source-map source-of-truth**: the Vite source-annotations plugin
   is what powers visual editing. Is the goal to support visual editing on
   non-Vite frameworks day 1, or accept that some frameworks have
   click-to-edit disabled until a per-framework annotator lands?

6. **`PROJECTS_ROOT` vs `DOABLE_PROJECTS_DIR`** — pipeline.ts:18 and
   project-files.ts:8 read DIFFERENT env vars to compute the same path. Is
   this drift, or intentional? Worth fixing as part of the abstraction.

7. **AI build.ts duplication** — `services/api/src/ai/build.ts` spawns its
   own `npx vite build` / dev server. Should this collapse into the framework
   adapter, or remain a separate (and now framework-blind) AI affordance?

8. **Process jail (`dovault`)**: jail config (`lockConfigs`,
   `blockChildProcess`, `blockOutboundNet`) is tuned for Vite+esbuild. SSR
   frameworks may need `blockOutboundNet:false` permanently (DB calls).
   Resource limits (256M memory) likely need bumping for Next.js/Nuxt.

9. **Templates as code vs DB**: today templates are TS modules (`registry.ts`
   hardcodes the map) but `scaffolder.ts:90-96` also bumps `templates.usage_count`
   in DB and `writeCodeFiles` writes into `project_files`. The DB has a
   `templates` row that mirrors the TS const. Does the abstraction add a
   `framework` column, or are framework-specific templates only in TS?
