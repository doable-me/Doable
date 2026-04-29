# 06 — Per-App Runtime & Publish

> Companion to `04-framework-abstraction.md` (build-time) and the discovery
> briefs at `_discovery/01-vite-flow.md` and `_discovery/02-runtime-infra.md`.
> Scope: how a published Doable app actually serves traffic. Today only the
> static-SPA path works (Vite → `dist/` → Caddy `file_server`). This PRD adds
> a *long-lived process* path (Next.js standalone, Nuxt, Django, Express SSR)
> without breaking the static path.

Branch baseline: `main` @ `80b4f85`. All filesystem paths refer to production
deployment under `/data/...` and `/etc/...`. Windows dev paths mirror under
`./data/...`. References of the form `02-runtime-infra.md §"Foo"` point at the
discovery brief.

---

## 1. Goals & non-goals

### Goals

1. **Two runtime kinds, one mental model.** A published project is either a
   bag of static files (`static`) or a long-lived process Caddy reverse-proxies
   to (`process`). Everything else is policy on top.
2. **Static path UNCHANGED.** Today's Vite → `/data/sites/{slug}/live/` →
   `file_server` flow keeps working bit-for-bit. The new code is additive.
3. **Provider-agnostic, VPS-default.** The runtime ships on a single Ubuntu
   VPS with systemd + Caddy + Cloudflare Tunnel. Cloud-specific flavors
   (AWS, Cloudflare Workers, Netlify) are *export adapters* users can opt
   into later — never the runtime path.
4. **No OpenNext-style transpilers in the runtime path.** We use the
   framework's own production output: Next.js `output: "standalone"`, Nuxt
   `.output/server/index.mjs`, Django `manage.py runserver` /
   `gunicorn`/`daphne`, Express `node server.js`. No `@opennextjs/cloudflare`,
   no `@opennextjs/aws`, no edge-runtime translation.
5. **Survives an API restart.** Per-app processes are *not* children of
   `services/api`. Killing `doable.service` does not take 30 published apps
   offline.
6. **Scales to ~100 published apps on a 4-vCPU / 16 GB VPS** by sleeping
   idle apps and waking on first request.
7. **One sandbox.** Production processes spawn through the existing `dovault`
   abstraction (see brief 02 §"Sandbox abstraction"), with stricter defaults
   per framework. No parallel sandbox.

### Non-goals (this PRD)

- Multi-region, multi-VPS routing, regional failover.
- Per-tenant uid/gid isolation. Today everything runs as root; tightening to
  a per-project unix user is tracked in §13 (Open issues).
- TLS for custom apex/subdomains (cloudflared handles this for `*.doable.me`;
  custom domain TLS is a separate doc).
- "Edge" / "lambda" runtime kinds. They may be added later as **export
  adapters** (build artifact → user's own AWS/CF account), not as a runtime
  kind in our supervisor.
- Billing / metering on per-app CPU/RAM samples. The data shape is laid out
  here; the billing doc consumes it.
- Reusing the dev preview proxy (`services/api/src/routes/preview-proxy/...`)
  for live traffic. Editor preview is its own thing; it should not be load
  bearing for published apps.

### Explicit anti-goals

- ❌ Doable does **not** rewrite or recompile a framework's server output
  (no OpenNext, no `@vercel/nft` tracing, no edge-runtime polyfills).
- ❌ Doable does **not** ship its own per-language runtime managers. We use
  whatever Node / Python / Ruby is on the VPS at versions chosen at
  scaffold time. Pinning is the framework adapter's job (`engines.node`,
  `python_requires`).
- ❌ The published runtime does **not** auto-deploy on every save. It runs
  the built artifact produced by `runPipeline` in `04-framework-abstraction.md`.

---

## 2. Two runtime kinds

A `runtime_kind` is a **deploy-time** property of a project, derived from
the framework adapter's declaration. It is persisted on every successful
publish and never changes silently.

### 2.1 `static`

- **Definition**: framework produces a directory of static files
  (`index.html`, JS, CSS, images). No server process needs to run to handle
  a request.
- **Examples today**: Vite (React/Vue/Solid SPA), Astro static, Next.js
  with `output: "export"`, SvelteKit `adapter-static`, Nuxt `nitro.preset:
  "static"`.
- **Caddy**: matches the existing wildcard handler in
  `services/api/src/services/caddy-domains.ts:55-89`:
  ```caddy
  handle @has_subdomain {
      root * /data/sites/{re.subdomain.1}/live
      try_files {path} /index.html
      file_server
  }
  ```
- **Process**: NONE. There is nothing to spawn, supervise, or wake.
- **Storage**: same `/data/sites/{subdomain}/{live|test}/` directory model
  as today (`01-vite-flow.md §"Site directory model"`).
- **Today's Vite flow lands here, unchanged.** A `RuntimeAdapter` of kind
  `static` is a thin wrapper whose `start`/`stop`/`healthCheck` are no-ops.

### 2.2 `process`

- **Definition**: framework produces a server entry point that listens on a
  TCP port (or unix socket) and is required to be running to serve a
  request. Caddy reverse-proxies live traffic to it.
- **Examples (Wave 3)**:
  - **Next.js standalone** — `node /data/projects/{id}/dist-server/server.js`
    (the build copies `.next/standalone/server.js` here). Requires
    `next.config.js` `output: "standalone"`.
  - **Nuxt** — `node /data/projects/{id}/.output/server/index.mjs`.
  - **Express / Hono / Fastify** — `node {entry}` from the framework
    adapter's `serverEntry`.
  - **Django** — `gunicorn project.wsgi:application --workers 2 --bind unix:{sock}`.
    (Runtime adapter id `python-wsgi` or `python-asgi` for Channels/FastAPI.)
- **Caddy**: a *new* per-project route block that does
  `reverse_proxy unix//run/doable/{slug}.sock` (or `127.0.0.1:{port}` on
  the TCP fallback path). See §6.
- **Process**: a long-lived systemd unit per project, supervised
  independently of `services/api`. See §4.
- **Storage**: same site directory rule as `static`, but the *contents*
  are the framework's server bundle plus any static assets it expects to
  be siblings (`.next/static`, `.output/public`, etc.). A future
  optimization may serve the static subset directly via Caddy and proxy
  only dynamic routes — out of scope here.

### 2.3 What we are explicitly NOT adding now

- `edge` (V8 isolate per request).
- `lambda` (per-invocation cold start).
- `container` (one OCI image per app — would replace systemd-as-supervisor;
  could revisit if/when we move to per-tenant uid isolation).

These may appear later as **export adapters** that hand a build artifact off
to user-owned infra (e.g. "Export to Cloudflare Workers"). They are NOT in
the supervised runtime path.

---

## 3. The `RuntimeAdapter` interface

`RuntimeAdapter` is *distinct* from `FrameworkAdapter` defined in
`04-framework-abstraction.md`. The framework adapter handles scaffold,
install, dev, build. The runtime adapter handles **what to do with the
built artifact when a request arrives in production**. A framework picks
exactly one runtime adapter at build time (e.g. Next.js with
`output:"export"` → `static-files`; Next.js with `output:"standalone"` →
`node-standalone`).

### 3.1 TypeScript

```ts
// services/api/src/runtime/adapter.ts (new)
export type RuntimeKind = "static" | "process";

export type ListenContract = "tcp-port" | "unix-socket";

export interface RuntimeContext {
  projectId: string;
  projectSlug: string;            // dns-safe, matches subdomain
  workspaceSlug: string;
  siteDir: string;                // /data/sites/{slug}/live or /test
  projectDir: string;             // /data/projects/{projectId}
  framework: { id: string; version?: string };
  env: Record<string, string>;    // resolved at start, not at deploy
  listen:
    | { kind: "unix-socket"; path: string }
    | { kind: "tcp-port";   host: "127.0.0.1"; port: number };
  userId: string | null;
}

export interface RuntimeHandle {
  id: string;                     // systemd unit name OR `static:{slug}`
  pid?: number;                   // present for process kind, after start
  startedAt: Date;
  listenAddr: string;             // "/run/doable/abc.sock" | "127.0.0.1:4123"
  listenContract: ListenContract;
}

export type HealthStatus =
  | { ok: true;  uptimeMs: number; memBytes?: number; cpuPct?: number }
  | { ok: false; reason: "no-process" | "no-socket" | "http-failed" |
                          "timeout" | "unknown"; detail?: string };

export interface RuntimeAdapter {
  /** Stable identifier — picked from a registry. */
  id: string;                     // "static-files" | "node-standalone" | "python-wsgi" | …

  kind: RuntimeKind;

  /** Listening contract this adapter speaks. `static` returns "tcp-port"
   *  by convention but never listens — Caddy reads from disk. */
  listenContract: ListenContract;

  /**
   * Idle eviction policy (process kind only; ignored for static).
   *  - `null`  → never sleep
   *  - number → sleep after this many ms with zero in-flight requests
   * Default 30 * 60_000 (30 min). Overridable per project.
   */
  idleTimeoutMs: number | null;

  /** Per-spawn env layered on top of resolved project secrets. */
  env(ctx: RuntimeContext): Record<string, string>;

  /** Materialize whatever the supervisor needs. For `process` kind, this
   *  installs/updates a systemd unit and starts it. For `static`, no-op. */
  start(ctx: RuntimeContext): Promise<RuntimeHandle>;

  /** Stop the unit (process) / no-op (static). Idempotent. */
  stop(handle: RuntimeHandle): Promise<void>;

  /** Probe. For `process`: checks unit ActiveState + an HTTP HEAD on
   *  `/_doable/health` (default) or adapter-supplied `healthPath`. For
   *  `static`: checks that the site dir exists and is non-empty. */
  healthCheck(handle: RuntimeHandle): Promise<HealthStatus>;
}
```

### 3.2 Built-in adapters at launch

| `id`              | `kind`    | `listenContract` | `idleTimeoutMs` | Notes                                               |
|-------------------|-----------|------------------|-----------------|-----------------------------------------------------|
| `static-files`    | static    | tcp-port (n/a)   | null            | Today's Vite path. Wraps `DoableCloudAdapter`.      |
| `node-standalone` | process   | unix-socket      | 30·60_000       | Next.js `output:"standalone"`, also Nuxt/Remix.     |
| `node-server`     | process   | unix-socket      | 30·60_000       | Plain Express/Hono/Fastify with explicit `server.js`|
| `python-wsgi`     | process   | unix-socket      | 30·60_000       | gunicorn for Django/Flask. Python child workers ok. |
| `python-asgi`     | process   | unix-socket      | 30·60_000       | uvicorn/daphne for FastAPI/Channels.                |

The `FrameworkAdapter.declareRuntime(buildResult)` method (defined in
`04-framework-abstraction.md`) returns one of these `id`s plus parameters
(server entry, healthPath, env). Examples:

```ts
// nextjs-standalone framework adapter
declareRuntime: (b) => ({
  id: "node-standalone",
  serverEntry: "dist-server/server.js",
  healthPath: "/_doable/health",
  envOverrides: { HOSTNAME: "0.0.0.0", PORT: "${LISTEN}" }, // see §4.2
});

// django framework adapter
declareRuntime: (b) => ({
  id: "python-wsgi",
  wsgiTarget: "myproj.wsgi:application",
  workers: 2,
  healthPath: "/_doable/health",
});
```

---

## 4. Per-app process model

### 4.1 Supervision: systemd template unit

Per-app processes are **not** children of the API server (corrects today's
Vite-dev model where `services/api/src/projects/dev-server-*.ts` keeps a
`Map<projectId, ChildProcess>` in memory — see brief 02
§"Per-project process lifecycle"). Instead, on publish we install a
**systemd template unit**:

```ini
# /etc/systemd/system/doable-app@.service  (installed once by setup-server.sh)
[Unit]
Description=Doable user app %i
After=network-online.target
PartOf=doable-apps.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
EnvironmentFile=/etc/doable/apps/%i.env
ExecStart=/usr/bin/env -S /usr/local/bin/doable-app-launcher %i
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30
TimeoutStopSec=15

# Sandboxing (additive to dovault — doesn't replace it)
NoNewPrivileges=yes
ProtectSystem=strict
ReadWritePaths=/data/projects/%i /data/sites
PrivateTmp=yes
PrivateDevices=yes
RuntimeDirectory=doable
RuntimeDirectoryMode=0750

[Install]
WantedBy=doable-apps.target
```

- `%i` is the project slug (e.g. `abc1234`). Used as both the unit instance
  name and the unix socket path component (`/run/doable/abc1234.sock`).
- `doable-app-launcher` is a tiny shim (~50 lines) that:
  1. Reads `/etc/doable/apps/{slug}.json` (the runtime descriptor — see §5).
  2. Calls into the `RuntimeAdapter.start` logic *out-of-process* by execing
     the adapter's chosen command through `dovault` with the right
     `SpawnOptions` (see §8). The launcher itself is not the long-lived
     process; it execs into the framework's server.
  3. Sets the `LISTEN_FDS=1` / `LISTEN_PID=$$` env vars when systemd hands
     us a pre-bound socket (see §4.3).
- `EnvironmentFile=/etc/doable/apps/{slug}.env` is regenerated each publish
  with the resolved project env vars (see §10).

**Why this and not "child of API"?**

- Survives `systemctl restart doable.service`. API can deploy, app keeps
  serving.
- Native restart-on-failure with backoff. Today's Vite path has no
  auto-restart (brief 02 §"Idle/crash policy" — "Crash recovery: lazy on
  next request"). For production traffic that's wrong: a crash mid-request
  should resurface in <5s, not on the next user click.
- `journalctl -u doable-app@abc1234 -f` is a free observability surface for
  ops/support and for the editor's "Logs" tab.
- Standard Linux toolchain. No bespoke supervisor in `services/api`.

### 4.2 Listen contract: prefer Unix sockets

Each `process`-kind app listens on `/run/doable/{slug}.sock` (mode `0660`,
group `caddy` — Caddy on Ubuntu runs under `caddy` user; the launcher
chowns the socket after binding so Caddy can connect).

Why sockets > TCP ports:

1. **No port budget**. Today's dev preview is capped at 101 ports
   (3100–3200; brief 02 §"Port allocation"). With 100s of published apps
   that ceiling is tight. Sockets are bounded by inode count, effectively
   unlimited.
2. **Filesystem permissions**. A socket at `0660 root:caddy` cannot be
   reached from another tenant — even before per-uid isolation lands.
3. **No collisions**. The slug *is* the path. We never need a port
   allocator across multiple supervisors.
4. **Caddy supports it natively**: `reverse_proxy unix//run/doable/x.sock`
   has been stable since Caddy 2.0.

**TCP fallback** (port range `4100–6100`, 2001 ports — separate from dev's
`3100-3200`). Used when:

- The framework or runtime explicitly cannot bind a socket (rare: some
  Python ASGI servers historically had patchy unix-socket support).
- Local dev on Windows where unix sockets need WSL.
- A migration path: an app starts on TCP, a follow-up publish moves it to
  unix socket. Tracked in `project_runtime.listen_kind`.

The TCP allocator is DB-backed (see §5). It scans `project_runtime`,
finds the smallest free port in `[4100, 6100]`, and writes it back in
the same transaction that flips state to `starting`. No in-memory `Set`.

### 4.3 Idle eviction — socket-activated services

DEFAULT idle timeout: **30 minutes**. Tunable per project (`projects.idle_timeout_ms`,
nullable; null = never sleep, charged differently).

Two implementations were considered:

**A. Supervisor-managed sleep** — Caddy proxies to a "wake shim" on a
control endpoint; the shim runs `systemctl start doable-app@{slug}`,
polls the socket, then proxies. Implementable today.

**B. systemd socket-activated services** — define a sibling
`doable-app@.socket` unit that owns the socket on disk and is always
"listening" cheaply. systemd starts the matching `.service` only on the
first connection, hands it the pre-bound FD via `LISTEN_FDS`. On
inactivity timeout, systemd stops `.service` but keeps `.socket`
listening. Zero polling, zero shim, zero cold-start coordination.

We pick **B (socket-activated)** as the default, with A as the documented
fallback for runtime adapters whose framework cannot accept a passed-in
listen FD.

```ini
# /etc/systemd/system/doable-app@.socket
[Unit]
Description=Doable user app socket %i
PartOf=doable-apps.target

[Socket]
ListenStream=/run/doable/%i.sock
SocketMode=0660
SocketGroup=caddy
Accept=no

[Install]
WantedBy=sockets.target
```

When the framework cannot accept `LISTEN_FDS` (Django before
gunicorn 20.x with socket activation; older Node versions in some matrices),
the launcher falls back to: bind the socket itself, advertise readiness,
let systemd's idle stop kill the unit on quiet. systemd's
`StopWhenUnneeded=` + a small "idle reaper" timer service handles the
"no-traffic for 30 min" detection — the reaper queries Caddy's metrics
endpoint (`/metrics`) for per-route last-request-at and stops the
matching unit.

**Worst-case cold start**: starting the unit + loading Node + framework
boot. Targeting **<2 s** for `node-standalone` (Next.js prod boot is
~600–900 ms on a warm node_modules cache); **<3 s** for `python-wsgi`
gunicorn boot. Caddy `reverse_proxy` already retries upstream connects;
we set `lb_try_duration 5s` so the first request after wake gets buffered,
not 502'd.

### 4.4 Crash auto-restart

systemd handles this directly via `Restart=on-failure` with `RestartSec=5s`.
Burst protection: `StartLimitBurst=5` over `StartLimitIntervalSec=300`
(5 fast restarts in 5 minutes → unit goes hard-down, state
`failed`).

When the unit is hard-down:

1. `doable-supervisor` (a small loop in `services/api/src/runtime/supervisor.ts`)
   subscribes to systemd journal (`journalctl --output=json -f`) and
   updates `project_runtime.state = 'failed'`, increments `fail_count`.
2. Editor surface: the project page shows a red banner "App crashed —
   Restart?" with a single button that calls `POST
   /projects/:id/runtime/restart`, which `systemctl reset-failed
   doable-app@{slug} && systemctl start doable-app@{slug}`.
3. We do NOT auto-resurrect a hard-down unit on the next request. That
   path leads to crash loops invisible to the user.

### 4.5 Graceful shutdown

On `SIGTERM` (systemd-stop on idle eviction or unpublish):

1. Caddy is told to drain via Admin API (set route to 503 "draining" with
   a 30 s grace) — ONLY for unpublish, not for idle eviction. Idle
   eviction uses an empty-queue check.
2. `TimeoutStopSec=15` gives the framework 15 s to close in-flight
   connections. Beyond that, SIGKILL.

---

## 5. DB-backed runtime registry

A new table replaces the in-memory `servers` Map (brief 02
§"Per-project process lifecycle" — `dev-server-core.ts:42-49`). The
in-memory map sticks around for **dev preview** (which is by-design
ephemeral and re-spawns lazily). The new table covers **published**
apps.

### 5.1 DDL

```sql
-- migration: 0NNN_runtime_registry.sql
CREATE TABLE project_runtime (
  project_id        uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,

  -- shape
  framework_id      text NOT NULL,                     -- 'nextjs', 'vite-react', 'django', …
  framework_version text,                              -- captured at publish time
  runtime_kind      text NOT NULL CHECK (runtime_kind IN ('static','process')),

  -- listening (process kind only; NULL for static)
  listen_kind       text CHECK (listen_kind IN ('unix-socket','tcp-port')),
  listen_addr       text,                              -- '/run/doable/abc.sock' | '127.0.0.1:4123'

  -- supervision
  systemd_unit      text,                              -- 'doable-app@abc.service' | NULL
  state             text NOT NULL CHECK (state IN ('stopped','starting','running','failed','draining'))
                            DEFAULT 'stopped',

  -- lifecycle
  last_active_at    timestamptz,
  last_started_at   timestamptz,
  fail_count        int  NOT NULL DEFAULT 0,
  idle_timeout_ms   int,                               -- per-project override; NULL = adapter default

  -- audit
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_runtime_state_idx ON project_runtime (state) WHERE state <> 'static';
CREATE INDEX project_runtime_idle_idx ON project_runtime (last_active_at)
  WHERE state = 'running';

-- TCP port allocation (only used when listen_kind = 'tcp-port')
CREATE TABLE runtime_port_allocation (
  port            int PRIMARY KEY CHECK (port BETWEEN 4100 AND 6100),
  project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
  allocated_at    timestamptz NOT NULL DEFAULT now()
);
-- pre-seeded in migration with rows for every port; project_id NULL = free.
```

State machine:

```
stopped ──start()──▶ starting ──ready──▶ running
   ▲                    │                  │
   │                    │ failed-to-start  │ idle / explicit-stop
   │                    ▼                  ▼
   └─── unpublish ── failed         draining ──drained──▶ stopped
                       ▲                      │
                       └──── repeated crash ──┘
```

Transitions are guarded by an advisory lock keyed on `project_id`
(prevents two `services/api` instances from racing a publish). The
supervisor (§4.4) is the single writer for `state` other than the
publish/unpublish paths.

### 5.2 Why DB-backed

- `services/api` may be restarted, multi-instance (future), or replaced
  while apps keep running. Asking systemd "what's running?" is fine
  but slow at scale; the DB is the cached truth.
- `last_active_at` lets reaper queries pick eviction candidates with
  one SQL.
- Port allocator (TCP path) needs a strongly consistent free-list. A
  unique index on `runtime_port_allocation.port` + `UPDATE ... WHERE
  project_id IS NULL ... LIMIT 1` is enough.

### 5.3 Operations

- **Publish** (`process` kind): single transaction inserts/updates
  `project_runtime`, allocates port (if TCP), writes
  `/etc/doable/apps/{slug}.env` and `/etc/systemd/system/doable-app@{slug}.d/override.conf`,
  `systemctl daemon-reload`, `systemctl enable --now doable-app@{slug}.socket`.
- **Unpublish**: `systemctl stop doable-app@{slug}.socket
  doable-app@{slug}.service`, `systemctl disable …`, remove env file +
  drop-in dir, free port row, delete `project_runtime` row, DELETE
  Caddy route via Admin API (§6).
- **Restart**: `systemctl restart doable-app@{slug}.service` —
  `socket` survives, no traffic loss for in-flight TCP-buffered requests
  (window is the cold-start budget).

---

## 6. Caddy integration via Admin API

setup-server.sh:548 already enables Caddy's Admin API on
`127.0.0.1:2019` (verified in brief 02 §"Caddy publish layer" lines
167–171 of the wildcard block). We use it to add and remove
per-process-app routes incrementally, **without** regenerating the
whole Caddyfile (today's `caddy-domains.ts:97-115` does
`writeFile + systemctl reload caddy` — that's fine for the rare
custom-domain change but is too slow for every publish).

### 6.1 Route shape for `process` apps

Conceptually, we replace the static handler block with a chooser: if
the subdomain is in the "process apps" list, reverse-proxy; else fall
through to the file-server wildcard. In Caddy JSON config the addition
is per-host:

```jsonc
// POST /config/apps/http/servers/srv0/routes
{
  "match": [{ "host": ["myapp.doable.me"] }],
  "handle": [
    {
      "handler": "reverse_proxy",
      "upstreams": [{ "dial": "unix//run/doable/myapp.sock" }],
      "transport": { "protocol": "http" },
      "load_balancing": { "try_duration": "5s" },
      "headers": {
        "request": {
          "set": {
            "X-Forwarded-Proto": ["https"],
            "X-Forwarded-Host": ["{http.request.host}"]
          }
        }
      }
    }
  ],
  "terminal": true
}
```

For TCP fallback, replace `dial` with `127.0.0.1:4123`.

### 6.2 Lifecycle hooks

- **Add route on publish (`process` kind only)**:
  ```
  PATCH /config/apps/http/servers/srv0/routes/0
  { "@id": "doable-app-myapp", ...route... }
  ```
  Inserted at index 0 so it wins over the wildcard.
- **Remove route on unpublish**:
  ```
  DELETE /id/doable-app-myapp
  ```
  Caddy's `@id` indexing supports direct delete.
- **Bulk read-back for reconciliation** (supervisor boot):
  `GET /config/apps/http/servers/srv0/routes` — diff against
  `project_runtime` rows where `state IN ('running','starting')`,
  re-add missing ones. Idempotent.

### 6.3 The static wildcard stays

We do **not** touch the existing wildcard block in
`caddy-domains.ts:55-89`. Static apps continue to be served by it
because no per-host route is registered above it. The only edit to
`caddy-domains.ts` is wiring `applyCaddyConfig` to also push current
process-app routes when it does a full regen — so a custom-domain
change doesn't blow them away.

### 6.4 Configurability

Admin API base is configurable via `CADDY_ADMIN_URL`
(default `http://127.0.0.1:2019`). On Windows dev, the Admin API
isn't running, so the runtime module no-ops the calls and logs them —
mirrors `caddy-domains.ts:115`'s existing Windows shim.

---

## 7. Static path: noop runtime adapter

The `static-files` runtime adapter is intentionally tiny:

```ts
// services/api/src/runtime/adapters/static-files.ts
export const staticFilesAdapter: RuntimeAdapter = {
  id: "static-files",
  kind: "static",
  listenContract: "tcp-port",  // unused
  idleTimeoutMs: null,
  env: () => ({}),
  async start(ctx) {
    // no process; just confirm the site dir exists and is non-empty.
    const ok = await dirNonEmpty(ctx.siteDir);
    if (!ok) throw new Error(`siteDir ${ctx.siteDir} empty`);
    return {
      id: `static:${ctx.projectSlug}`,
      startedAt: new Date(),
      listenAddr: ctx.siteDir,
      listenContract: "tcp-port",
    };
  },
  async stop()        { /* no-op */ },
  async healthCheck(h) {
    const ok = await dirNonEmpty(h.listenAddr);
    return ok ? { ok: true, uptimeMs: 0 }
              : { ok: false, reason: "no-process", detail: "site dir empty" };
  },
};
```

Persisted shape:

```sql
INSERT INTO project_runtime
  (project_id, framework_id, runtime_kind, state)
VALUES
  ($1, 'vite-react', 'static', 'running');
-- listen_kind, listen_addr, systemd_unit are all NULL.
```

`runtime_kind = 'static'` rows are excluded from the supervisor's
process scans (`WHERE state <> 'static'` partial index). This means:

- **Today's Vite flow lands here unchanged.** `DoableCloudAdapter.deploy`
  in `services/api/src/deploy/adapters/doable-cloud.ts:97-108` keeps doing
  its mkdir/cp dance into `/data/sites/{slug}/live/`. After it returns
  successfully, the publish pipeline (§13 of `04-framework-abstraction.md`)
  upserts a `project_runtime` row with `runtime_kind='static'`. That's
  the only added line for the static path.
- No systemd unit, no socket, no Caddy Admin API call. The wildcard
  serves it. Verified path matches the existing brief-01 §"Caddy contract"
  (lines 257–272).

---

## 8. Sandbox tightening for production

Production code is built — the AI is no longer rewriting it. So the
loosened defaults from `services/api/src/projects/vite-jail.ts:99-101`
flip the other direction. The launcher uses `dovault.spawn` (brief 02
§"Sandbox abstraction" — `Vault.spawn` at `vault.ts:108-225`) with these
**production-only** defaults, declared on the `RuntimeAdapter`:

```ts
type ProductionSandboxProfile = {
  lockConfigs: true;
  blockChildProcess: boolean;       // varies by adapter
  blockOutboundNet: false;          // see below
  resourceLimits: { memoryMax: string; cpuQuota: string; tasksMax: number };
};
```

### 8.1 Per-adapter profiles

| Adapter           | lockConfigs | blockChildProcess | resourceLimits (default)              | Notes                                                      |
|-------------------|-------------|-------------------|---------------------------------------|------------------------------------------------------------|
| `static-files`    | n/a         | n/a               | n/a                                   | No child process at all.                                   |
| `node-standalone` | **true**    | **true**          | `512M` / `50%` / `256`                 | Next.js standalone shouldn't spawn esbuild in prod.        |
| `node-server`     | **true**    | **true**          | `512M` / `50%` / `256`                 | Tighten further per project if user keeps it CRUD-shaped.  |
| `python-wsgi`     | **true**    | **false**         | `512M` / `50%` / `256`                 | Gunicorn forks workers — must allow child process.         |
| `python-asgi`     | **true**    | **false**         | `512M` / `50%` / `256`                 | uvicorn `--workers >1` likewise.                           |

Justifications:

- `lockConfigs: true` — production deploys are not the time to discover
  that `next.config.js` was edited at runtime. Locks `next.config.js`,
  `nuxt.config.ts`, `gunicorn.conf.py` per adapter — list extends the
  Vite-only one in `services/api/src/projects/vite-jail.ts:4`.
- `blockChildProcess` — true for Node where the build is finished and
  there's no legitimate `child_process.spawn` from a user app server
  (we ban `eval`-style shelling out from tenants). False for Python
  where forking workers is how gunicorn/uvicorn scale.
- `blockOutboundNet: false` — apps need to call their database, their
  third-party APIs (OpenAI, Stripe, Supabase). Outbound is allowed by
  default. **Egress allow-listing comes in a follow-up doc**: each
  project will declare its egress hosts (DB url, allowed third-parties)
  and dovault's `IPAddressAllow` will include only those. Until then,
  default-allow.
- `resourceLimits` — 512 MB is the default upper bound on memory; CPU
  is throttled to 50% of one vCPU; `tasksMax: 256` caps the cgroup's
  PID count, blocking fork bombs but allowing reasonable worker
  counts. Per-project override surfaces on the project settings page
  (write-through to `projects.runtime_resource_limits jsonb`).

These are PER-ADAPTER on purpose: when Wave 3 lands new adapters, they
each declare a profile rather than collapsing into a single
"production sandbox". This pulls the foot-gun out of brief 02
§"Sandbox tightening for untrusted prod code".

### 8.2 Resource limit backend

Same `dovault` resource backends as today: prefer `SystemdBackend`
(`packages/dovault/src/backends/systemd.ts:17`). For the `process`
kind, the systemd unit's own `MemoryMax=` + `CPUQuota=` directives are
the authoritative limits — written into the per-app drop-in:

```ini
# /etc/systemd/system/doable-app@abc.service.d/limits.conf
[Service]
MemoryMax=512M
CPUQuota=50%
TasksMax=256
IPAddressDeny=any
IPAddressAllow=localhost
# IPAddressAllow=<project-egress-hosts>  ← future
```

The launcher does NOT additionally invoke `systemd-run --scope` — the
unit IS the scope. dovault's role here is about config-lock and
permission-jail layers; the cgroup is owned by systemd directly.

---

## 9. Preview vs live

`01-vite-flow.md:271-281` flags an unresolved gap: the deploy adapter
writes `preview` deploys to `/data/sites/{subdomain}/test/`, but the
production Caddyfile only routes to `/live/`. There is no second
wildcard in the repo. Three options were considered:

### Option A — Drop preview hosting

Tear out the `test/` path entirely; "preview" becomes the editor's
in-app preview only. Simplest. Loses the ability to share a preview URL
with a client/teammate before going live, which is a real product use
case.

### Option B — `p-{slug}.doable.me` → `/test/`

Add a second wildcard handler in the Caddyfile that matches
`^p-([a-z0-9][-a-z0-9]*)\.doable\.me$` and roots at
`/data/sites/{1}/test`. For `process` kind, the Caddy Admin API also
inserts a parallel route per preview at `p-{slug}.doable.me` proxying
to a *separate* preview unit (`doable-app-preview@{slug}.service`),
listening on `/run/doable/{slug}.preview.sock`. Predictable URL shape,
works today.

### Option C — Atomic blue/green via symlink swap

Both `live/` and `test/` exist; promotion is a symlink swap from
`current → live` to `current → test`. Caddy roots at `current`. For
`process` kind, two units run simultaneously and an Admin API patch
flips the upstream. Truly atomic; complicates the mental model and the
URL is the same for preview and live.

**Recommendation: Option B.** It matches the existing
`PUBLISH_SUBDOMAIN_PREFIX` "p-" convention in
`services/api/src/deploy/adapters/doable-cloud.ts:28-44`, requires no
symlink choreography, gives previews their own URL (shareable), and
keeps the static and process paths symmetric. The "second wildcard
not in this repo" mystery is resolved by *adding* it explicitly.

Concrete change to `services/api/src/services/caddy-domains.ts`:

```caddy
:8080 {
    bind 127.0.0.1
    @has_subdomain     header_regexp subdomain Host ^([a-z0-9][-a-z0-9]*)\.doable\.me$
    @has_preview       header_regexp pslug    Host ^p-([a-z0-9][-a-z0-9]*)\.doable\.me$
    handle @has_preview {
        root * /data/sites/{re.pslug.1}/test
        try_files {path} /index.html
        file_server
    }
    handle @has_subdomain {
        root * /data/sites/{re.subdomain.1}/live
        try_files {path} /index.html
        file_server
    }
    handle { respond "Not Found" 404 }
}
```

Process-kind preview routes go in via Admin API at `p-{slug}.doable.me`.

---

## 10. Secrets at runtime

Today: `resolveProjectEnvVars(projectId, environment, undefined, userId)`
runs once at spawn time
(`services/api/src/projects/dev-server-start.ts:109-120`). For dev
this is fine — the user restarts the preview to pick up new secrets.
For published long-lived apps it is not — a user rotating their
Stripe key shouldn't see traffic against the old key for hours.

### 10.1 Spawn-time resolution

`RuntimeAdapter.start(ctx)` is called with `ctx.env` already resolved.
The result is rendered to `/etc/doable/apps/{slug}.env`:

```
DATABASE_URL=postgres://…
STRIPE_SECRET_KEY=sk_live_…
DOABLE_PROJECT_ID=abc1234
DOABLE_PUBLIC_URL=https://myapp.doable.me
NODE_ENV=production
PORT=                            # left empty when unix-socket; set when tcp
```

The `EnvironmentFile=` directive in the systemd unit reads it. File
mode is `0640 root:root` — readable only by root. Never logged.

### 10.2 Rotation flow

1. User edits a secret in the editor's "Environment Variables" panel.
2. Web → `PUT /projects/:id/env-vars` updates the DB.
3. API marks `project_runtime.needs_restart = true` (new column,
   nullable bool — added to DDL above by migration follow-up).
4. UI shows a yellow banner on the project: "Secret changed — restart
   to apply". With two buttons: "Restart now" and "Restart on next
   idle window".
5. "Restart now" → `systemctl restart doable-app@{slug}.service`.
   Cold-start budget applies; ~1–3 s.
6. "Restart on next idle window" → on next zero-traffic eviction,
   bring back up with new env file. (Effectively: do nothing; the
   normal idle/wake cycle picks up the new envfile.)

We deliberately do NOT support hot env reload — most frameworks read
env at process boot. Forcing them to honor a SIGHUP is a deep
per-framework rabbit hole.

### 10.3 Vault credentials at runtime

If the project uses Doable's vault (per-user OAuth tokens), the launcher
currently fetches them at spawn (`dev-server-start.ts:112`). Same
behavior in prod: spawn-time resolution writes a fresh OAuth token into
the env file. Token refresh is owned by the relevant integration's
refresh job, with a "stale envfile" check on each idle wake.

---

## 11. Capacity model

### 11.1 Worked numbers

Assumptions (Wave 3 launch sizing):

- VPS: 4 vCPU, 16 GB RAM, 2 GB swap, 80 GB SSD.
- Doable platform processes: ~2 GB RAM (Postgres + API + Web + WS +
  Caddy + cloudflared).
- Free for tenants: ~12 GB RAM.

| Scenario                                  | RAM/app  | Apps | Total RAM | Notes                                |
|-------------------------------------------|----------|------|-----------|--------------------------------------|
| Static (`runtime_kind='static'`)          | 0        | 100+ | 0         | Caddy serves files. Disk only.       |
| Sleeping process (socket-activated only)  | 0        | 100+ | 0         | systemd holds the socket FD.         |
| Idle warm Node app (just booted)          | 70 MB    | 30   | ~2.1 GB   | Next.js standalone empty handler.    |
| Active Node app under light load          | 120 MB   | 10   | ~1.2 GB   | A few hundred req/min.               |
| Active Python WSGI (gunicorn 2 workers)   | 180 MB   | 10   | ~1.8 GB   | Each worker ~70-90 MB.               |

So a **realistic mixed steady state** of "100 published apps, 30 active,
70 sleeping" lands at:

- 30 × 100 MB Node-ish + 10 × 180 MB Python-ish ≈ **4.8 GB**
- Headroom: 12 GB - 4.8 GB ≈ **7.2 GB** for spikes & cold starts.

### 11.2 Watch list

- **Memory creep on long-running Node apps**. Set
  `--max-old-space-size=384` (in `node-standalone` adapter env). systemd
  `MemoryMax=512M` is the hard cap; OOM-kill goes through systemd's
  restart-on-failure with backoff (§4.4).
- **systemd unit count**. 100s of units is fine; 10 000s starts
  slowing `daemon-reload`. We're nowhere near.
- **inotify watchers**. Some Node frameworks watch the working
  directory in dev. `node-standalone` defaults to NODE_ENV=production
  and disables that. Spot-check after first 100 published apps.
- **Disk**. Each project's `node_modules` (~250–400 MB) lives in
  `/data/projects/{id}`. With 100 projects, ~25–40 GB. Plus
  `/data/sites/{slug}/{live,test}` build outputs (~50 MB each, ~5 GB
  for 100). 80 GB drive is 60% used at saturation — fine, but plan
  the next-VPS-tier point at ~80 paid users.
- **Cold-start storms**. After API restart, supervisor reconciles the
  full set of running units. Don't bulk-start — let socket activation
  defer to first-request. The reconciler only writes Caddy routes
  (cheap) and trusts systemd state.

---

## 12. Migration / coexistence

### 12.1 Phase 1 — Land the abstraction (no behavior change)

- Ship `RuntimeAdapter` interface, `static-files` adapter, and
  `project_runtime` table.
- After every successful publish, also upsert a `project_runtime` row
  with `runtime_kind='static', state='running'`.
- Existing static projects: backfill rows in a migration (one row per
  `projects.published_url IS NOT NULL`).
- **No `process`-kind code paths are exercised yet.** No systemd
  template installed. No Caddy Admin API calls.

Risk: cosmetic; the new row is just metadata. If anything goes wrong,
drop the table.

### 12.2 Phase 2 — Process-kind behind a flag

- Install `doable-app@.service` + `.socket` template (idempotent in
  `setup-server.sh`).
- Add `node-standalone` runtime adapter.
- Add per-project feature flag `projects.runtime_kind_override` — the
  publish pipeline only emits a `process`-kind unit when this is set.
- Beta with internal users + a Next.js template.
- Editor surfaces "Logs", "Restart", "Status" only for projects whose
  `project_runtime.runtime_kind = 'process'`.

### 12.3 Phase 3 — Default for new frameworks

- Next.js standalone, Nuxt, Express templates default to `process`.
- Vite, Astro static, Next.js export remain `static`.
- Existing projects unchanged unless the user explicitly migrates
  (one-click in editor → re-publish with new framework adapter).

### 12.4 Rollback

A `process`-kind project can be downgraded to `static` only if the
framework supports it (e.g. Next.js with `output: "export"` if no SSR
APIs are used). Adapter declares `canExportStatic(buildResult)`; UI
exposes "Switch to static" when true. Otherwise, rollback = restore
previous version, which already worked.

---

## 13. Open issues / future work

1. **TLS for custom domains on `process` kind.** Caddy does
   automatic HTTPS, but the cloudflared tunnel currently terminates
   TLS at Cloudflare for `*.doable.me`. Custom domains add complexity
   for both `static` and `process`; tracked separately.
2. **Per-tenant uid isolation.** Today every app runs as root via the
   launcher. The unit template already uses `ProtectSystem=strict`,
   `PrivateTmp=`, `RuntimeDirectory=`. Next step: a per-project
   `User=doable-app-{N}` allocated from a pool, with a dedicated
   `/data/projects/{id}` ownership flip at scaffold. Requires
   touching dovault to drop privileges similarly.
3. **Egress allow-list.** Per §8, `IPAddressAllow=` is currently
   localhost-only. The follow-up doc declares an `egress_hosts: text[]`
   per project, populated from `next.config.js` rewrites,
   `database_url`, and integration metadata.
4. **Multi-region / multi-VPS.** Out of scope here. A second VPS
   would currently double the supervisor and assume DNS round-robin.
   Do nothing until paid-user count justifies it.
5. **Per-app metrics export to billing.** The dovault audit log
   (`AuditEntry` in `types.ts:123-127`) and Caddy's `/metrics`
   endpoint together can drive billing samples; codifying that is a
   separate doc.
6. **Unix-socket pre-bind for non-systemd envs.** macOS dev / CI
   doesn't have systemd. The runtime layer needs a dev-only
   shim (`launchctl`-equivalent or simple `node --watch` pool) that
   honors the same `RuntimeAdapter.start` contract. Don't write it
   until at least one Wave-3 adapter exists to drive requirements.
7. **Build vs runtime version drift.** Capture
   `framework_version` on every publish; warn when an adapter
   version newer than what built the artifact tries to run it. Soft
   warning, not blocking.
8. **`PROJECTS_ROOT` vs `DOABLE_PROJECTS_DIR`** drift flagged in
   `01-vite-flow.md:443-446`. Resolve in the framework-abstraction
   doc; runtime adapter consumes whatever single env var wins there.

---

## Appendix A — End-to-end publish example (Next.js standalone)

1. User clicks "Publish" in the editor.
2. `POST /deploy/:projectId` → `runPipeline` (existing).
3. Framework adapter `nextjs-standalone` runs `next build`. Output
   contains `.next/standalone/` and `.next/static/`.
4. `DoableCloudAdapter.deploy` (extended) recognizes
   `runtime_kind === 'process'` from the framework adapter's
   `declareRuntime()` return:
   - Copies `.next/standalone/` → `/data/projects/{id}/dist-server/`.
   - Copies `.next/static/` → `/data/sites/{slug}/live/_next/static/`
     (so Caddy could later serve it directly; today reverse-proxy
     handles it).
   - Copies `public/` → `/data/sites/{slug}/live/`.
5. Pipeline writes `/etc/doable/apps/{slug}.env` with resolved
   secrets + `NODE_ENV=production` + `HOSTNAME=127.0.0.1`.
6. Pipeline writes
   `/etc/systemd/system/doable-app@{slug}.service.d/override.conf`:
   ```ini
   [Service]
   WorkingDirectory=/data/projects/{id}/dist-server
   ExecStart=/usr/bin/node server.js
   MemoryMax=512M
   CPUQuota=50%
   TasksMax=256
   ```
7. `systemctl daemon-reload && systemctl enable --now
   doable-app@{slug}.socket`. Socket created at
   `/run/doable/{slug}.sock`, mode 0660, group caddy. Service is
   *not* started yet — waits for first request.
8. Pipeline POSTs to Caddy Admin API:
   ```
   PATCH /config/apps/http/servers/srv0/routes/0
   ```
   with the route block in §6.1.
9. Pipeline upserts `project_runtime`:
   ```sql
   INSERT INTO project_runtime
     (project_id, framework_id, framework_version, runtime_kind,
      listen_kind, listen_addr, systemd_unit, state)
   VALUES
     ($1, 'nextjs-standalone', '15.4.0', 'process',
      'unix-socket', '/run/doable/{slug}.sock',
      'doable-app@{slug}.service', 'stopped');
   ```
10. User hits `https://myapp.doable.me/`:
    - Cloudflare → tunnel → Caddy:8080 → matched per-host route →
      `unix//run/doable/{slug}.sock`.
    - systemd sees connection → starts `doable-app@{slug}.service` →
      passes the socket FD via `LISTEN_FDS=1`.
    - `node server.js` reads `LISTEN_FDS`, accepts the inherited socket.
    - Response back upstream within ~1.5 s of first hit.
    - Supervisor flips `project_runtime.state = 'running'`,
      `last_started_at = now()`.
11. 31 minutes of zero requests → reaper runs `systemctl stop
    doable-app@{slug}.service`. Socket stays. State → `stopped`.
12. Next request → goto step 10.

---

## Appendix B — Cited sources

- `_discovery/02-runtime-infra.md` §"Sandbox abstraction" — dovault's
  shape and current single caller (vite-jail).
- `_discovery/02-runtime-infra.md` §"Per-project process lifecycle" —
  in-memory registry shape we are replacing for published apps.
- `_discovery/02-runtime-infra.md` §"Caddy publish layer" — Admin API
  on `127.0.0.1:2019` already enabled by `setup-server.sh:548`.
- `_discovery/02-runtime-infra.md` §"Gaps for Next.js-style long-lived
  runtime" — explicit gap list this PRD closes.
- `_discovery/02-runtime-infra.md` §"Open questions for design wave"
  — five questions, answered in §4 (systemd template), §6 (Admin API),
  §9 (preview-vs-live with `p-{slug}` wildcard), §13 (uid isolation
  out of scope), §11 (disk/budget for prod node_modules).
- `_discovery/01-vite-flow.md` §"Caddy contract" — wildcard handler
  we keep for static apps.
- `_discovery/01-vite-flow.md` §"Site directory model" — `/data/sites/{slug}/{live|test}/`
  layout reused.
- `_discovery/01-vite-flow.md` §"Hardcoded Vite assumptions" #17 —
  the static-only-adapter assumption this PRD breaks.
