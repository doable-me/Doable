# 02 — Runtime Infra (Discovery Brief)

Scope: only what Wave 2 needs to design a multi-framework, possibly long-lived,
per-app server runtime. All file paths are relative to repo root unless absolute.

## Sandbox abstraction

Doable does NOT have an `nsjail`/`Docker`/`passthrough` polymorphic sandbox in
code today. The MEMORY note "nsjail primary, Docker fallback, passthrough for
dev" is aspirational — see `project_sandbox_architecture.md`. What actually
exists is a single in-process abstraction called **`dovault`** (a workspace
package) with three composable layers and pluggable resource-limit *backends*
(systemd / windows-heap / direct), but only ONE caller (Vite dev server).

- **Package**: `packages/dovault/src/index.ts:12` — exports `Vault`, `createVault`.
- **Top-level interface**: `packages/dovault/src/vault.ts:60-225`
  - `class Vault.spawn(command, args, SpawnOptions): Promise<JailedProcess>`
    (`vault.ts:108-225`)
  - `class Vault.exec(command, args, ExecOptions): Promise<ExecResult>`
    (`vault.ts:241-284`) — one-shot, timeout-bounded, no Permission Model
  - `Vault.lockConfigs(projectPath)` / `Vault.isLockedFile(path)`
    (`vault.ts:290-314`)
- **Type contracts**: `packages/dovault/src/types.ts`
  - `SpawnOptions` (line 46-89): `cwd`, `jail`, `readOnlyPaths`, `lockConfigs`,
    `blockChildProcess`, `blockOutboundNet`, `env`, `resourceLimits`, `stdio`.
  - `JailedProcess` (line 110-117): `{ process: ChildProcess, pid, kill() }` —
    NOT a custom shape, the underlying Node `ChildProcess` is exposed so callers
    can keep using `.stdout`, `.on("close")`, etc.
  - `ResourceLimits` (line 95-104): `memoryMax`, `cpuQuota`, `tasksMax`.
  - `AuditEntry` (line 123-127): `kind ∈ {config_lock, spawn, permission_jail,
    resource_limit}`.
- **Layer 1 — Config Guard**: `packages/dovault/src/config-guard.ts` — overwrites
  `vite.config.ts`, `postcss.config.js`, `tailwind.config.ts` with safe templates
  and deletes shadowing variants. Vite-specific today.
- **Layer 2 — Process Jail (Node.js Permission Model)**: `packages/dovault/src/process-jail.ts` —
  resolves `command` to a JS entry point and prepends `node --experimental-permission
  --allow-fs-read=<jail> --allow-fs-write=<jail>`. Returns `null` if the command
  cannot be resolved as a Node script (i.e. fails open for non-Node binaries).
- **Layer 3 — Resource backends** (`packages/dovault/src/backends/`):
  - `systemd.ts:17` `SystemdBackend` (Linux, priority 80) — wraps spawn with
    `systemd-run --scope -p MemoryMax= -p CPUQuota= -p TasksMax= -p
    IPAddressDeny=any -p IPAddressAllow=localhost`. Cgroup v2 enforced by
    kernel. Also poisons `HTTP_PROXY`/`HTTPS_PROXY` env as defense-in-depth.
  - `win-heap.ts` `WindowsHeapBackend` — V8 heap limit only (best-effort).
  - `windows.ts` `WindowsBackend` — Job Objects for `exec()` only.
  - `direct.ts` `DirectBackend` — no limits (macOS, fallback).
  - `ResourceLimiter` auto-selects the best available backend via
    `backend?: "auto"|"systemd"|"win-heap"|"direct"` (`types.ts:22-29`).
- **Backends are pluggable** — `ResourceBackend` interface in
  `packages/dovault/src/backends/types.ts`. New backends (`docker`, `nsjail`,
  `firecracker`) could be added without touching `Vault`.

### Current usage points (single caller!)

- `services/api/src/projects/vite-jail.ts:82-137` `spawnJailedVite()` — only
  call to `vault.spawn` in the entire codebase.
  - Hard-codes `lockConfigs: false` (line 99 — "AI legitimately edits
    vite.config.ts"), `blockChildProcess: false` (line 100 — esbuild/workers),
    `blockOutboundNet: false` (line 101 — npm install + HMR ws).
  - Wires `resourceLimits` from `VITE_MEMORY_MAX` (default 256M) /
    `VITE_CPU_QUOTA` (default 50%) / `VITE_TASKS_MAX` (default 128) (line 16-20).
  - Falls back to raw `child_process.spawn` on `vault.spawn` failure (line 119-136).
- `services/api/src/projects/file-manager.ts` — uses `vault.lockConfigs` /
  `vault.isLockedFile` (search confirmed via repo grep — guards AI write_file
  tool against editing locked configs).
- No usage from `deploy/`, `git/`, `ai/`, `mcp/`. The build (`deploy/builder.ts`,
  one-shot `vite build`) does NOT go through dovault — it is a plain `spawn`.

### Launch contract (effective signature today)

```ts
spawnJailedVite({
  execPath: string,        // process.execPath (Node binary)
  args: string[],          // [viteEntry, "--host", "127.0.0.1", "--port", N, "--strictPort", "--base", "/preview/{id}/"]
  cwd: string,             // /data/projects/{projectId}
  env: Record<string,string>,
  projectId: string,
  stdio: "pipe"|"ignore"|"inherit"
}) => { process: ChildProcess, pid: number, kill: () => void }
```

## Per-project process lifecycle

All in `services/api/src/projects/dev-server-*.ts`. In-memory only — nothing
persisted to disk or DB.

- **State shape** — `dev-server-core.ts:17-25` `DevServerInstance`:
  ```ts
  { projectId, port, process: ChildProcess, url, startedAt: Date,
    ready: boolean, readyPromise: Promise<void> }
  ```
- **Registries** (`dev-server-core.ts:42-49`):
  - `servers: Map<projectId, DevServerInstance>` — running processes.
  - `usedPorts: Set<number>` — claimed ports (in-memory).
  - `startingServers: Map<projectId, Promise>` — single-flight guard against
    concurrent `startDevServer()` calls for the same project.
- **Spawn**: `dev-server-start.ts:65-277` `doStartDevServer()`
  - Allocates port (`allocatePort()`), resolves env vars (vault-backed user
    creds + `env_vars` table) (`dev-server-start.ts:109-120`), calls
    `spawnJailedVite()` (line 122-134).
  - Vite invoked as `node node_modules/vite/bin/vite.js --host 127.0.0.1
    --port {port} --strictPort --base /preview/{projectId}/`
    (`dev-server-start.ts:101-124`).
  - Readiness signal: parses `child.stdout`/`stderr` for
    `"Local:"` or `"ready in"` (line 167-184). Backed by `STARTUP_TIMEOUT_MS =
    90_000` (line 13 of `dev-server-core.ts`) — on timeout, if process is alive
    it is *assumed* ready (line 222-228).
  - Health check: HTTP fetch loop on `/preview/{id}/` up to 10×500ms after Vite
    signals ready (line 241-273). Soft warning on failure, does not throw.
- **Monitor**: `child.on("error" | "close")` handlers (`dev-server-start.ts:186-207`).
  On `close` after-ready, the registry entry is cleaned up so the next request
  re-spawns. There is **no auto-restart on crash** — restart is lazy, on the
  next inbound `/preview/` request.
- **Kill**: `dev-server-ops.ts:21-72` `stopDevServer()`:
  - Linux/mac: `process.kill("SIGTERM")` then 5 s later `SIGKILL`.
  - Windows: `taskkill /pid X /T /F` (tree-kill, line 35-43) because
    `shell:true` cmd.exe doesn't propagate signals.
- **Idle/crash policy**:
  - **No idle timeout**. Once started, a Vite process runs forever (or until
    process exit / explicit stop). Confirmed via grep — no `setTimeout`,
    `lastActive`, or LRU-style eviction code path.
  - **No max concurrent dev-servers** — bounded only by port range (101 ports).
  - **Crash recovery**: lazy. On next request, `proxy-handler.ts:38-45` calls
    `isRunning(projectId)` (which auto-cleans dead entries via
    `dev-server-ops.ts:154-163`), then re-spawns.
- **Restart**: `dev-server-ops.ts:192-211` `restartDevServer()` — stop + delete
  `node_modules/.vite` cache + start. Used after `install_package` AI tool.
- **Process exit cleanup**: `dev-server-ops.ts:223-229` registers SIGINT/SIGTERM
  handlers that call `stopAllDevServers()` (parallel `stopDevServer` for every
  entry).

## Port allocation

- **File**: `dev-server-core.ts:77-103`.
- **Range**: `PORT_RANGE_START = 3100`, `PORT_RANGE_END = 3200` (line 10-11) —
  101 ports total. `DEV_SERVER_HOST = process.env.DEV_SERVER_HOST ?? "127.0.0.1"`.
- **Mechanism**: linear scan. For each candidate port:
  1. Skip if `usedPorts.has(port)`.
  2. Probe with `net.createServer().listen(port, "127.0.0.1")` — if EADDRINUSE
     (catches *external* orphaned processes from previous API runs), skip and
     log warning.
  3. If free, `usedPorts.add(port)` and return.
- **Persistence**: NONE. `usedPorts`/`servers` are pure in-memory `Map`/`Set`.
  Every API restart reallocates from 3100. Orphaned processes from before the
  restart are skipped via the OS probe but their ports are NOT reclaimed (you
  must manually kill them).
- **Conflict handling**: throws `"No available ports in range 3100-3200"` if
  the entire range is exhausted (line 93-96).
- **Vite is started with `--strictPort`** (`dev-server-start.ts:124`) so Vite
  itself never auto-picks a different port silently.

## Caddy publish layer

- **Caddyfile path (runtime)**: `/etc/caddy/Caddyfile` (env-overridable via
  `CADDYFILE_PATH`).
- **Generators / writers**:
  - `setup-server.sh:543-577` — initial server setup, hard-coded heredoc
    Caddyfile. Runs `systemctl enable caddy && systemctl restart caddy`.
  - `services/api/src/services/caddy-domains.ts:28-90` `generateCaddyfile()` —
    runtime regeneration when a custom domain is verified. Combines:
    1. Wildcard subdomain handler for `*.doable.me`.
    2. One explicit `handle @cd_<safeName>` block per custom domain.
  - `caddy-domains.ts:97-115` `applyCaddyConfig()` writes file +
    `execSync("systemctl reload caddy")`. Linux-only (logs config on Windows).
- **Wildcard rule for `*.doable.me`** (`caddy-domains.ts:55-89`):
  ```caddy
  {
      auto_https off
      admin 127.0.0.1:2019
  }
  :8080 {
      bind 127.0.0.1
      @has_subdomain {
          header_regexp subdomain Host ^([a-z0-9][-a-z0-9]*)\.doable\.me$
      }
      handle @has_subdomain {
          root * /data/sites/{re.subdomain.1}/live   # ← subdomain 1:1 = dir name
          try_files {path} /index.html               # ← SPA fallback (Vite-shaped)
          file_server
          header { ... CSP/HSTS/etc ... }
          encode gzip
      }
      handle { respond "Not Found" 404 }
  }
  ```
  - Caddy listens on `127.0.0.1:8080` only (`bind 127.0.0.1`, line 61). External
    access via Cloudflare Tunnel.
- **Reverse-proxy capability today**: **YES, but not in the published-site
  path.** Two distinct reverse-proxy surfaces exist:
  1. The Hono API itself reverse-proxies *dev* preview traffic at
     `services/api/src/routes/preview-proxy/proxy-handler.ts:29-80` —
     `/preview/:projectId/*` → `http://localhost:{vitePort}/preview/{id}/*`.
     This is **inside the API process**, not in Caddy.
  2. Caddy's published-site config has **no `reverse_proxy` directive at all**
     today — only `file_server` (static files). To host a long-lived per-app
     Node server, Caddy would need a new handler block that does
     `reverse_proxy 127.0.0.1:{appPort}`.

## Site directory model

- **Layout**: `/data/sites/{subdomain}/{live|test}/` (env-overridable via
  `SITES_DIR`). On Windows dev: `./data/sites/{subdomain}/{live|test}/`.
- **Writers**:
  - `setup-server.sh:537-541` creates `${INSTALL_DIR}/sites` (chmod 755) at
    install time.
  - `services/api/src/deploy/adapters/doable-cloud.ts:97-108` `DoableCloudAdapter.deploy()`
    — `mkdir(siteDir)`, `rm(targetDir, recursive)`, `mkdir(targetDir)`,
    `cp(buildOutputDir, targetDir, {recursive})`. The API process (running as
    root in production per `start.sh`) owns the writes.
- **Ownership/permissions**: production runs the entire stack as root (per
  `setup-server.sh` and the systemd unit). No per-tenant uid separation. Caddy
  reads as root too. There is **no chroot, no namespace, no user separation**
  between published sites.
- **`envDir = environment === "preview" ? "test" : "live"`** —
  `doable-cloud.ts:93`. Production publishes write `.../live/`; preview
  publishes write `.../test/`.
- **Test → live promotion**: there is **no atomic promotion mechanism**.
  Preview goes to `test/`, production goes to `live/` — they are two
  *independent* `runPipeline()` invocations with different `environment`
  arguments. Caddy's wildcard only routes to `/live/` (caddy-domains.ts:69).
  Preview hosting relies on the dev environment publishing under a
  `dev-` / `p-` subdomain prefix (`PUBLISH_SUBDOMAIN_PREFIX` env, see
  `doable-cloud.ts:28-44`) and apparently a *separate* Caddyfile / Cloudflare
  tunnel that maps the prefix to `/test/` — **not visible in this repo's
  Caddyfile**, flagged in `01-vite-flow.md:271-281` as an open ambiguity.
- **No teardown** — `DoableCloudAdapter.teardown()` is a stub (line 176-198,
  just enumerates dirs and logs). Old `live/` and `test/` directories
  accumulate forever.

## Process supervision

- **Top-level supervisor**: `systemd doable.service` (`setup-server.sh:589-608`)
  → wraps a tmux session named `doable` (Type=forking).
  - tmux session is created by `start.sh:19-37` with three windows:
    - `api`: `pnpm dev:api` (tsx watch on Hono, port 4000)
    - `web`: Next.js standalone build, port 3000
    - `ws`: `pnpm dev:ws` (tsx watch, port 4001)
- **Watchdog**: `doable-watchdog.service` + `.timer`
  (`setup-server.sh:613-636`) runs `watchdog.sh` every 2 min for health checks.
- **User-app processes (Vite dev servers, future per-app servers)**:
  - **Children of the API server process**, NOT supervised by systemd or tmux.
  - Spawned via `vault.spawn` → optionally wrapped by `systemd-run --scope`
    (Linux) which creates a transient *cgroup scope* (NOT a service unit, NOT
    persisted across reboots, NOT auto-restarted by systemd).
  - When the API process dies, all dev-server children die too (because of the
    SIGINT/SIGTERM handlers + tmux killing the API tab on restart). After API
    restart, dev-servers are re-spawned lazily on the next `/preview/` hit
    (proxy-handler.ts:38-45).
  - **No cross-process dev-server registry**, so two API processes (e.g.
    accidental `pnpm dev:api` + tmux) would each spawn their own duplicate
    Vite — bounded only by `--strictPort` and port-probe.
- Build (`vite build` for publish) runs in `services/api/src/deploy/builder.ts`
  via plain `child_process.spawn`, NOT through dovault, NOT through systemd.

## Gaps for Next.js-style long-lived runtime

To host a per-app long-lived Node server (Next.js production, Nuxt, Remix
adapter, Express SSR, etc.) the following are MISSING today:

- **Persisted process registry**: current `servers` Map is in-memory, dies with
  the API. A long-lived runtime needs an on-disk record of `{projectId, pid,
  port, framework, startCmd, lastActive, healthUrl}` so processes survive API
  restarts (or, alternatively, are re-spawned deterministically on boot).
- **Independent supervision**: Vite dev-servers being children of the API is
  fine for ephemeral preview. A production app server needs to be supervised
  *outside* the API process — candidates: systemd template unit
  `app@.service`, PM2-style supervisor inside dovault, or per-app tmux pane.
- **Idle timeout / scale-to-zero**: there is no idle eviction. With 100s of
  published apps each running a Node server, plain "always-on" will exhaust
  memory. Need an idle-timeout + on-demand cold-start path.
- **Crash auto-restart with backoff**: today crash recovery is "lazy on next
  request" — fine for preview, wrong for production traffic that should not
  see a 503 until 90 s after a Vite crash.
- **Caddy reverse_proxy generation**: `caddy-domains.ts` only emits
  `file_server` blocks. A long-lived runtime needs an emitted
  `reverse_proxy 127.0.0.1:{appPort}` per app + Caddy reload on app
  start/stop. Today `applyCaddyConfig()` reloads on custom-domain change only.
- **Port allocation across instances**: `usedPorts` is in-memory; with two
  supervisors or post-restart, no shared truth. Need DB-backed allocation
  (e.g. `project_runtime` row with reserved port) and free-list cleanup.
- **Health probes**: dev-server "ready" is a stdout grep + one HTTP retry
  loop. Production needs a real `/healthz` contract per framework adapter,
  with timeout + retry + circuit-breaker semantics.
- **Sandbox tightening for untrusted prod code**: the Vite caller passes
  `lockConfigs:false`, `blockChildProcess:false`, `blockOutboundNet:false`
  (`vite-jail.ts:99-101`). For a multi-tenant production runtime these need
  to flip back on (or be re-evaluated per-framework). Outbound net policy
  especially matters — `IPAddressDeny=any` should be the default for tenant
  traffic.
- **No teardown / GC**: `DoableCloudAdapter.teardown` is a stub. Long-lived
  runtimes need stop+remove on un-publish, including DNS unregister at
  Cloudflare and systemd unit cleanup.
- **No process-level resource accounting export**: dovault audits spawn but
  doesn't sample memory/cpu over time. Billing or quota enforcement on a
  per-app runtime would require this.
- **Per-app secrets at runtime**: `resolveProjectEnvVars()` runs once at
  spawn (`dev-server-start.ts:109-120`). For a long-lived app, secret
  rotation needs a restart hook or live reload.
- **Framework adapter shape**: build adapter interface exists
  (`services/api/src/deploy/adapter.ts` — `DeployAdapter`) but there is **no
  runtime adapter** equivalent. Wave 2 needs to design something like
  `RuntimeAdapter { startCmd, healthUrl, port, idleTimeout, env }`.

## Open questions for design wave

- Should per-app servers live as transient `systemd-run --scope` units (current
  dovault pattern) or proper `app@{slug}.service` units that persist? The
  former is zero-config but loses the cgroup on API restart; the latter
  requires writing unit files to `/etc/systemd/system/`.
- How does Caddy learn about runtime ports? Two options: (a) dynamic
  Caddyfile regen + reload on every app start (slow at scale), (b) Caddy
  Admin API at `127.0.0.1:2019` (already enabled, see `caddy-domains.ts:57`,
  `setup-server.sh:548`) for incremental config updates. (b) is preferred.
- Does the `test/` directory + Caddy-only-routes-`live/` mismatch (see
  `01-vite-flow.md:271-281`) actually work in dev? Either there is a second
  Caddyfile not in this repo, or preview = "build + serve via Vite preview
  server" via a different code path. Confirm before designing promotion.
- Is multi-tenant isolation a Wave 2 requirement, or is "all apps run as root
  in shared root cgroup" the deliberate ~100-user policy? If isolation is
  needed, we need user-namespace or rootless-podman-shaped backends in
  dovault, which today only ships systemd/win-heap/direct.
- Does the long-lived runtime share a single Node `node_modules` per project
  with the dev server, or get its own production-only `node_modules`? Affects
  build pipeline and disk/memory budget.
- Per-project per-port budget: 101 ports (3100–3200) is fine for dev
  preview; production might need a separate range (e.g. 4100–6100) or
  Unix sockets (`/run/doable/{slug}.sock`) so port count doesn't cap tenants.
