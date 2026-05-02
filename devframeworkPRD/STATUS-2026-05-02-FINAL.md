# Framework-Agnostic Doable — Final Status (2026-05-02)

> Scope: Waves 12 through 19 of the framework-agnostic initiative.
> SUPERSEDES `STATUS-2026-05-02.md` (which only covered Phase 0–5 + PRD 10
> foundation through commit `3fa412e`). Waves 12–19 are the production-deploy
> + verification + UI-surface follow-on pass.

---

## TL;DR

Waves 12–19 closed every preview and production-deploy gap for the eight
first-class frameworks (Vite-React, Next.js, Nuxt, SvelteKit, Astro, Hono,
FastAPI, Django) and surfaced framework selection + runtime-instance
metrics in the UI. The publish pipeline now stages framework-correct
build output to `dist-server/` and the `node-standalone` / `python-asgi`
runtime adapters dispatch the right entrypoint per framework. A
fixture-based `verify-publish.ts` harness passes 4/4 for the four
node-process frameworks on both Windows and Linux. Linux smoke testing
on a fresh 24.04 droplet exercised the cgroup metrics branch and surfaced
a real `python3-venv` packaging gap (now patched in `setup-server.sh`).
What is **not** yet verified: an actual end-to-end production publish of
any project (no full `setup-server.sh` run completed against a live
Cloudflare tunnel), live `gunicorn`/`uvicorn` execution under a real
systemd unit, and browser testing of the editor RuntimePanel.

---

## What works end-to-end now

| Framework    | Preview (dev) | Production deploy            | AI prompt              | Confidence |
|--------------|---------------|------------------------------|------------------------|------------|
| Vite-React   | yes           | static via Caddy             | yes (relative-fetch)   | high — pre-existing path |
| Next.js      | yes (HMR + WS)| `.next/standalone` → `dist-server/server.js` | yes  | medium-high — verify-publish PASS, no live publish |
| Nuxt         | yes           | nitro `.output/server/index.mjs` → `dist-server/` | yes | medium — verify-publish PASS, no live publish |
| SvelteKit    | yes           | adapter-node `build/index.js` → `dist-server/` | yes | medium — verify-publish PASS, no live publish |
| Astro        | yes           | SSR `dist/server/entry.mjs` → `dist-server/` | yes | medium — verify-publish PASS via node-standalone fallback |
| Hono         | yes           | `dist/index.js` + prod `node_modules` install | yes | medium — verify-publish PASS, no live publish |
| FastAPI      | yes (uvicorn) | source copy + venv → `python-asgi` adapter | yes | low — never run under real systemd |
| Django       | yes           | source copy + venv → ASGI/WSGI dispatch | yes | low — never run under real systemd |

"verify-publish PASS" means the deploy adapter staged the expected
artefact under `dist-server/` against a synthetic project tree. It does
not assert that the systemd unit started, that the upstream port responded,
or that Caddy routed the request.

---

## Wave-by-wave summary

- **Wave 12 — `669e7d0`** Closed five Next.js gaps for flawless preview +
  deploy: WS-upgrade proxy at `/preview/:id/*` for `/_next/webpack-hmr`,
  streaming HTML injection via `TransformStream` (no buffering — preserves
  Next.js streaming SSR / RSC chunks), Next.js system-prompt mandate for
  relative fetch URLs, production stage of `.next/standalone/*` +
  `.next/static/` + `public/` to `dist-server/`, and `ensureDependencies`
  threading `framework_id` from the project row instead of hardcoding
  `vite-react`.

- **Wave 13 — `6aa7fb5`** Per-framework production deploy + AI relative-URL
  guidance for Nuxt, SvelteKit, Astro. `doable-cloud` detects nitro
  (`.output/server/index.mjs`), adapter-node (`build/index.js`), Astro SSR
  (`dist/server/entry.mjs`) and stages each to `dist-server/`. The
  `node-standalone` adapter's `ExecStart` picks the first-existing of
  `server.js → index.mjs → index.js → entry.mjs`, so all four frameworks
  share one runtime adapter. Also landed the previously-untracked Django /
  FastAPI / Hono prompt files and registered all six in
  `framework-prompts/index.ts`.

- **Wave 14 — `c54c364`** Hono / FastAPI / Django production deploy + AI
  guidance — final three first-class frameworks. `doable-cloud` detects
  Hono (`dist/index.js`), FastAPI (`main.py` + `requirements.txt`), Django
  (`manage.py`) and stages with appropriate exclusions (skip
  `node_modules`/`.venv`/`__pycache__`/`.git` for Python). New
  `python-asgi` runtime adapter mirrors `node-standalone` shape but
  dispatches `uvicorn` (FastAPI / Django ASGI) vs `gunicorn` (Django WSGI)
  by inspecting `dist-server/` contents. `pipeline.ts` runtime selection
  becomes 3-way: `ssr-python` → pythonAsgi, otherwise
  `requires-long-lived-process` → nodeStandalone, otherwise staticFiles.

- **Wave 15 — `e06c19f`** Closed three deferred items. (1) Replaced two
  framework-hardcoded sendMessage strings in `apps/web` with
  framework-agnostic copy. (2) `psroot.exe` resolution chain in
  `packages/dovault/src/backends/psroot.ts`: `DOABLE_PSROOT_PATH` env →
  `vendor/psroot/psroot.exe` → system PATH; binary itself stays
  user-supplied with provenance docs in `vendor/psroot/README.md`. (3)
  First non-Vite-React rich starter — `nextjs-todo-app` template (single
  client component, localStorage persistence, priority + due dates, edit
  on double-click).

- **Wave 16-A — `0340302`** Framework selection backend. New 4-step
  resolution chain in project create: explicit `frameworkId` from request
  body → heuristic `detect-framework.ts` from prompt text → workspace
  `default_framework_id` → DB column default (`vite-react`). Adds
  migration 065, `detect-framework.test.ts` (8 cases), and routes
  plumbing in `ai-settings-config.ts` + `projects/list-routes.ts`.

- **Wave 16-B — `7385aba`** Framework selection UI surfaces. Three paths:
  (1) inline framework dropdown next to the Strategize/Work toggle in the
  dashboard's prompt input; (2) `+ New project` button mounts the
  previously-orphaned `CreateProjectDialog` with the full eight-framework
  picker (and now fetches templates from `/templates` instead of using a
  stale hardcoded array); (3) prompt-text detection (server-side, from
  16-A). Plus a workspace-admin "Default framework" section in
  `general-tab.tsx` (disabled for non-admins).

- **Wave 17 — `58e5c1d`** Closed three production-deploy + verification
  gaps. (1) `setupPythonVenv()` creates `dist-server/.venv/` via
  `python3 -m venv` and pip-installs `requirements.txt` (cross-OS:
  `Scripts/pip.exe` vs `bin/pip`). (2) `installNodeProductionDeps()` for
  Hono — seeds `package.json` + `package-lock.json` into `dist-server`,
  runs `npm install --production --omit=dev --legacy-peer-deps` instead
  of copying the full project `node_modules` (was 100–200 MB with dev
  deps). Both helpers are best-effort: warn and continue rather than
  abort. (3) Migration 065 applied to dev DB; column verified via
  `information_schema`.

- **Wave 18 — `91c2b47`** Publish pipeline verification + runtime instance
  metrics. New `services/api/scripts/verify-publish.ts` orchestrates a
  fixture-based test: synthesises project trees under `os.tmpdir()`
  matching each framework's `existsSync` detection branch, invokes the
  deploy adapter via dynamic import (with `PROJECTS_ROOT` env override
  in place at module load), asserts the right `dist-server/` entry per
  the Wave 13 priority list. 4/4 PASS on Windows. New
  `services/api/src/runtime/metrics.ts`: `getInstanceMetrics(slug)` reads
  systemd `ActiveState` + `ActiveEnterTimestamp`, cgroup `memory.current`,
  and samples `cpu.stat` over 200ms for `cpuPct`. Linux-only;
  Windows/macOS dev returns `source: "none"` with null fields. Routes
  added: `GET /projects/:id/runtime/metrics` +
  `GET /workspaces/:wid/runtime/instances`. New `RuntimePanel` component
  created but **not yet mounted** at this commit — that's Wave 19-A.

- **Wave 19-A/B — `0582111`** Mounted `RuntimePanel` as a 280px overlay
  in the bottom-right of the editor preview iframe (80% opacity, 100%
  on hover; conditional on `scaffoldStatus === "ready"`). Added new
  `/runtime` workspace page that polls `apiListWorkspaceInstances` every
  8s and renders a table (project / state / uptime / memory / cpu /
  last-active) with state badges matching the panel's color scheme.
  Banner shown when every instance reports `source: "none"` (dev
  environment).

- **Wave 19-C — `f47f8ef`** Linux smoke test on a fresh Ubuntu 24.04
  droplet (`159.65.144.194`). `verify-publish.ts` 4/4 PASS on Linux.
  `metrics.ts` exercised the Linux code path: `source: "cgroup"`,
  `systemctl show ... ActiveState` returned `"active"` for
  `systemd-journald.service`, nonexistent units gracefully reported
  `state: "stopped"`. Real finding: `python3 -m venv` fails on bare
  Ubuntu 24.04 with the `ensurepip is not available` error because
  `python3-venv` is a separate apt package — Wave 17 `setupPythonVenv`
  silently no-ops in this case. Patched `setup-server.sh` to install
  `python3-venv python3-pip` alongside the Puppeteer/Chrome deps.

---

## Verified vs not verified

### Verified (Windows, this session)

- `tsc --noEmit` clean across all wave commits (one pre-existing error
  in `src/routes/runtime.ts:62` and one in `src/mcp/ssrf-guard.ts`
  remained — neither introduced by Waves 12–19).
- `detect-framework.test.ts` — 8/8 pass.
- `verify-publish.ts` — 4/4 PASS for Next.js / Nuxt / SvelteKit / Hono
  against synthetic project fixtures.
- API server boot smoke test — imports clean (no `Cannot find module` /
  `SyntaxError` / `TypeError` before the secrets-warning + `DATABASE_URL`
  prompt).

### Verified (Linux, fresh Ubuntu 24.04 droplet `159.65.144.194`)

- `verify-publish.ts` — 4/4 PASS (Next.js standalone, Nuxt nitro,
  SvelteKit adapter-node, Hono node-build all stage correctly).
- `metrics.ts` — `source: "cgroup"` (Linux branch taken), `systemctl
  show ... ActiveState` integration works (active unit, exit 0;
  nonexistent unit returns `state: "stopped"` rather than crashing).
- `python3-venv` packaging gap surfaced and patched in `setup-server.sh`.

### NOT verified

- **Actual end-to-end production publish of any project.** No project
  has been published through to a `*.doable.me` subdomain via a real
  Cloudflare tunnel + Caddy reload + systemd unit start. The closest
  signal is `verify-publish.ts` asserting that `dist-server/` contains
  the expected artefact.
- **Python framework live deploy.** `gunicorn` / `uvicorn` have never
  been started under a real systemd unit by this session. The
  `python-asgi` adapter is code-complete but unexercised end-to-end.
- **Caddy admin-API per-host route insertion in production.** The
  `caddy-admin.ts` client has been exercised in dev only.
- **Browser test of the editor RuntimePanel and `/runtime` workspace
  page.** Both compile clean and pass `tsc`, but no human or automated
  browser session has confirmed they render and poll correctly against
  a live API.
- **Cross-platform sandbox runtime under load.** Psroot path resolution
  is wired but `psroot.exe` is user-supplied; no Windows backend smoke
  test was run.

---

## Known gaps with workarounds

- **`python3-venv` is a separate apt package.** Patched in
  `setup-server.sh` (Wave 19-C). Existing servers need
  `apt-get install -y python3-venv python3-pip` before any FastAPI /
  Django publish will produce a working `.venv/`. Without it,
  `setupPythonVenv` warns once and continues, leaving the systemd unit
  with no interpreter to ExecStart.
- **Pre-existing `tsc` strict-mode errors** in
  `services/api/src/routes/runtime.ts:62` and
  `services/api/src/mcp/ssrf-guard.ts`. Not introduced this session;
  not blocking boot or tests. Should be tracked in a future cleanup.
- **`cloudflared` needs interactive login.** `setup-server.sh`
  prompts for `cloudflared tunnel login`, which opens a browser. This
  was skipped on the smoke-test droplet, so no full prod path was
  exercised against a live tunnel.
- **`psroot.exe` not vendored.** `packages/dovault/src/backends/psroot.ts`
  resolves the binary in priority order (env → `vendor/psroot/` →
  PATH); `vendor/psroot/README.md` documents provenance. Cross-org
  licensing prevents shipping the binary in-tree.
- **Editor RuntimePanel mount is in `page.tsx`, not in the dead
  `chat-panel.tsx`.** Aligns with the project memory note that
  `modules/editor/chat/chat-panel.tsx` is dead code — never imported.

---

## Wave 25 — Secure by default

Closed the Wave 21 sandbox-only model and replaced it with build-time +
runtime isolation across the publish pipeline.

- **Build-jail wrap.** `services/api/src/deploy/builder.ts` now invokes
  every `next build` / `vite build` / `npm install` / `pip install`
  through the `dovault` jail (1 GB memory, 100 % CPU, 512 procs,
  filesystem confined to the project dir). Network egress remains open
  for registry installs.
- **Dedicated runtime user.** `services/api/src/runtime/node-standalone.ts`
  and `services/api/src/runtime/python-asgi.ts` write
  `User=doable-app` plus `NoNewPrivileges`, `ProtectSystem=strict`,
  `PrivateTmp`, and `IPAddressDeny=any` (with `127.0.0.0/8` +
  project-workspace allow-list) into the per-project systemd drop-in.
  Apps no longer run as root.
- **Per-project ReadWritePaths.** The same drop-ins narrow
  `ReadWritePaths=` to the project's own `dist-server/` directory only,
  so one compromised app cannot read another project's source tree,
  `.env`, or any path outside its own bundle.
- **chown after staging.** `services/api/src/deploy/doable-cloud.ts`
  `chown -R doable-app:doable-app` the staged `dist-server/` after the
  build completes, giving the runtime user just enough access to read
  its bundle without holding ownership over the source tree above.
- **`doable-app` user creation.** `setup-server.sh` now creates the
  `doable-app` system user (`useradd -r -s /usr/sbin/nologin -M`) as
  part of phase 1 so the systemd drop-ins above resolve correctly on a
  fresh box.

Open items: build-time egress is still unrestricted; all projects share
one `doable-app` UID (per-project UIDs would need additional setup +
templated systemd). See README-DEPLOY.md §7 "Honest gaps still open" for
the full follow-on list.

---

## Operational notes — agent reliability across the wave batch

This batch ran several Opus team agents in parallel with direct edits.
Reliability collapsed midway through:

- **Waves 12–13 (Monitor pattern, frequent T+30/60/90s pings):**
  ~93% completion (≈38 of 41 task assignments). Agents that started
  writing files within 60s of spawn finished cleanly; the few failures
  surfaced quickly via Monitor watching expected file mtimes.
- **Waves 14–19 (same pattern):** roughly 10% (≈2 of the last 20
  agent-assigned subtasks completed without intervention). Most silently
  failed to claim or never showed disk activity, requiring the team
  lead to retry directly.
- **Direct execution by the team lead remained 100%** across the same
  period (every Edit/Write landed and tsc came back clean).

Recommendation for the next batch: reserve agents for genuinely
independent multi-file work where the scope is large enough to amortise
spawn-and-confirm overhead. Mechanical surface migrations, single-file
edits, and known-shape refactors land faster and more reliably via
direct Edit/Write. Keep the Monitor watching expected file mtimes
pre-armed before spawn so silent failures surface within seconds.

---

## Next steps

In rough priority order:

1. **Full end-to-end publish on Linux.** Run `setup-server.sh` to
   completion (including `cloudflared tunnel login`) on a fresh
   droplet, scaffold one project per framework, hit Publish, and
   confirm each `*.doable.me` subdomain serves the expected response.
   This is the load-bearing test the verify-publish harness can't
   substitute for.
2. **Live Python framework deploy.** Drive a FastAPI and a Django
   project through publish on a server with `python3-venv` installed;
   confirm `gunicorn` / `uvicorn` run under a real `doable-app@.service`
   instance and Caddy admin inserts the per-host route.
3. **Browser test the editor RuntimePanel + `/runtime` page.** Manual
   smoke or a Chrome-extension scripted run; confirm the 5s/8s polls
   render correctly and the dev banner appears when `source: "none"`.
4. **Triage the two pre-existing `tsc` strict-mode errors** in
   `routes/runtime.ts` and `mcp/ssrf-guard.ts` — file a small
   follow-up task with the exact line numbers.
5. **Vendor or document `psroot.exe` acquisition** more formally if
   the Windows sandbox path becomes a supported configuration.
