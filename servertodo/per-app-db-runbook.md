# Per-App Database — Operator Runbook

Feature: per-project PGlite database (PRD `doablechore/PRD-per-app-db`).
Branch: `feature/per-app-db`. Default OFF — set `DOABLE_APP_DB_ENABLED=1` to enable.

## What it is

Each project gets a supervised PGlite (Postgres-in-WASM) worker process. The
deployed app talks to it over a credential-less data-plane proxy at
`/__doable/data/{query,exec,schema,migrate}`; the build-time AI talks to it via
the builtin `doable.data` MCP server. Row-Level Security isolates end-users.

## Kill switch / rollback

- `DOABLE_APP_DB_ENABLED=0` (default) → no `/__doable/data/*` routes mounted, no
  pool sweeper, no MCP registration. Restart the API. Existing on-disk data is
  untouched; nothing else reads `.doable/app.db/`.
- Per-project opt-out without an env flip: `UPDATE projects SET app_db_enabled=false WHERE id=...`.

## Architecture quick map

- Worker: `services/api/src/data-worker/index.ts` (PGlite + serial IPC loop).
- Pool: `services/api/src/data-worker/pool.ts` (Map<projectId,WorkerHandle>,
  idle reaper, LRU evict, crash drain). API owns the IPC listener; worker connects.
- Routes: `services/api/src/routes/app-data.ts` (reuses connector-proxy auth).
- MCP: `services/api/src/mcp/builtin/data/transport.ts` (in-process, 5 data.* tools).
- Data dir: `${PROJECTS_ROOT}/<projectId>/.doable/app.db/`.

## RLS correctness (IMPORTANT — PGlite-specific)

PGlite's only login is the `postgres` SUPERUSER, and **superusers bypass RLS
entirely — even `FORCE ROW LEVEL SECURITY` does not constrain them.** The data
plane therefore runs `query` ops as a non-superuser role `doable_app` (created +
granted at worker bootstrap, with `ALTER DEFAULT PRIVILEGES` so AI-created tables
auto-grant DML). `ENABLE ROW LEVEL SECURITY` + an owner policy then isolates
users correctly. `exec`/`migrate` run as `postgres` (RLS-bypassing) — correct for
schema authoring. The AI prompt template uses `ENABLE` (not `FORCE`).

## Common operations

### Triage a stuck / runaway worker
1. `GET /admin` pool snapshot (getDataPoolSnapshot) or check `getDataPoolSnapshot()`
   for per-project pid / uptime / inflight / idle.
2. A worker with high `inflight` and old `lastActivityAt` is stuck — the idle
   sweeper (`DOABLE_APP_DB_SWEEP_MS`, default 60s) reaps idle workers past
   `DOABLE_APP_DB_IDLE_MS` (default 10 min). To force: kill the pid; the pool
   drops it and the next request cold-starts a fresh worker (WAL replay recovers).

### OOM (Linux prod)
- cgroup `memory.max` (default 128 MB via `DOABLE_APP_DB_MEMORY_MB`) kills the
  worker (exit 137). The pool drains inflight with `WORKER_CRASHED` and removes
  the entry; next request cold-starts. No manual recovery. Raise memory per
  `07-resource-management.md` if p95 RSS nears the cap.

### Reap orphan workers
- Orphans self-clean: the worker self-shuts-down after `--idle-shutdown-ms`
  (pool idle + 60s) even if the API died. To sweep manually, kill PIDs whose
  `.doable/app.db/postmaster.pid` no longer maps to a live process.

### Cold-start latency
- First query to a project pays a full PGlite `initdb`: **sub-second on Linux,
  but ~15-20s on a Windows dev volume** (filesystem-bound). Reopening an
  initialised dir is fast. On Windows dev, raise `DOABLE_APP_DB_READY_MS`
  (default 5000) — e.g. `60000` — or the spawn handshake will time out.

## Sandbox / isolation status

- Linux prod: the worker is composed into a bwrap jail (`sandbox-args.ts`):
  `--unshare-net`, ro `/usr` mounts, rw bind only of `.doable/`, `--cap-drop ALL`,
  `--die-with-parent`. The bwrap mount namespace is what currently isolates one
  project's filesystem view from another's.
- **KNOWN GAP (pre-prod blocker — see pre-prod gates below): the per-project uid
  drop is NOT yet applied at spawn.** `acquireDevUid(projectId)` is called and the
  uid is carried in the sandbox plan, but `pool.ts:workerInvocation` does not yet
  wrap the spawn with the per-project uid (no `setpriv`/`spawn({uid})`), so on the
  current Linux path the worker runs as the **API service uid**, not a per-project
  uid. Consequence: sibling DB files are isolated by the bwrap mount namespace, but
  NOT additionally by DAC/file-ownership. This MUST be wired (reuse the vite-jail
  `sandbox-spawn`/setpriv mechanism) and validated on a Linux runner before the
  prod flag-on. Do not rely on uid/DAC isolation until then.
- cgroup memory/CPU/PID caps: composed in the bwrap profile per the PRD but
  likewise validated only on a Linux runner (pre-prod gate), not on this box.
- Windows / macOS / dev: DEGRADED — the worker runs as a plain child process
  (no Job Object / cgroup kernel caps), exactly as `vite-jail.ts` degrades
  off-Linux. Production targets Linux. A Windows Job Object wrapper is a
  follow-up (see PRD 03 §Windows).
- Role selection (PRD 04 §6.3 deviation, intentional): the superuser-vs-`doable_app`
  choice is made by the IPC frame `op` field on a single socket (not two distinct
  sockets). Safe because the HTTP route hardcodes `op` and tier-gates `exec`; the
  browser cannot set `op`. Documented here as a simplification of the two-socket
  design in the PRD.

## Pre-prod verification gates (NOT code — operator must run before flag-on in prod)

These are required by `09-testing-verification.md` and are out of the
implementation's automated scope (they need a dedicated runner / live AI / a
Postgres):
- [ ] Migrations 093 + 094 applied on the target Postgres (`pnpm db:migrate`).
- [ ] Linux CI run of the data-worker integration + isolation tests under real bwrap.
- [ ] 24-hour soak: 50 concurrent projects × 5 QPS; assert no worker leak, <5% RSS growth.
- [ ] Performance SLO bench on a dedicated runner (p95 indexed read ≤ 20ms warm).
- [ ] Live-AI nightly on dev.doable.me: CRM / todo / jewelry prompts emit CREATE POLICY.
- [ ] Playwright MCP Apps UI: CSP + iframe sandbox + XSS-escape checks in Chromium.
- [ ] LUKS/BitLocker at-rest encryption on the data partition (PGlite has none).

## Config reference

See `07-resource-management.md` §"Configuration reference" for the full
`DOABLE_APP_DB_*` env var list and defaults.
