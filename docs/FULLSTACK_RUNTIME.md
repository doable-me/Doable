# Doable Full-Stack App Runtime — Implementation Spec

**Status:** Ready for implementation  
**Audience:** Coding agents + humans implementing the fork extension  
**Companion:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) (current platform map)  
**Goal:** Extend Doable from a **UI app builder** into a **full-stack app builder** while keeping AI generation quality at (or above) the current UI bar, and keeping fork changes **sync-safe** with upstream `doable-me/doable`.

---

## 0. One-sentence summary

Add a **platform-hosted app runtime** (`/__doable/*` + jailed JS workflows) so generated apps get **named Mustache SQL queries**, auto-CRUD APIs, schedules, topics, webhooks, CDC, secrets, and data templates — taught to the coding agent via **overlay skills + validate tools + a typed SDK**, without rewriting the Copilot chat path.

---

## 1. Why we are doing this

### Problem

Doable already generates excellent Vite/Next UIs and can persist via per-project PGlite (`@doable/data` + `builtin:data`). But “backend” for generated apps stops at:

- **ad-hoc SQL embedded in frontend** (`db.query("SELECT …", […])` against the inbuilt DB)
- connector-proxy for third-party actions
- optional Supabase

That frontend-SQL pattern works for demos but is weak for real apps: queries are duplicated, hard to reuse from workflows, easy to drift, and the “API surface” is whatever the browser decides to send.

There is no first-class way for the AI to generate **named server-side queries** or **server-side automation**: REST APIs, cron jobs, inbound webhooks, pub/sub, change-driven workflows, or secret-safe server logic.

### Why not “just generate a Node server in the project”

| Approach | Verdict |
|----------|---------|
| AI writes Express/Fastify in the project tree | Breaks preview model, sandbox, deploy pipeline, multi-tenant ops |
| Force every app onto Supabase/PostgREST | Abandons inbuilt DB advantage; secrets/CDC still fragmented |
| **Platform runtime + AI writes config/JS against SDK** | Matches existing `/__doable/data`, `/__doable/ai`, connector-proxy patterns |

### Success criteria

1. User can say *“build a lead intake app with webhook, nightly digest, and admin REST API”* and the agent produces working UI **and** runtime artifacts that execute on the platform.
2. Generated backend quality matches UI quality: schema-first, RLS, no secrets in source, validated before “done”.
3. Upstream merges remain mechanical — new code lives in overlay packages/dirs; core chat files get only tiny registration hooks.

---

## 2. What we are building (scope)

### In scope (v1)

| Capability | User-facing meaning |
|------------|---------------------|
| **Named queries (Mustache SQL)** | AI writes `.doable/backend/queries/<name>.sql` with `{{param}}` placeholders; frontend + workflows call by `query_name` + params — **primary** data access (replaces inline frontend SQL) |
| **Auto CRUD REST** | Schema → authenticated REST under `/__doable/api/...` with RLS (scaffold / admin; named queries win for custom reads/writes) |
| **Workflows (JS)** | Small jailed JS modules with SDK (`queries`, `http`, `db`, `secrets`, `topics`, `files`, `log`, integrations, `callWorkflow`) |
| **Scheduling** | Cron → enqueue workflow run |
| **Topics / pub-sub** | Per-project named topics; workflows + live clients subscribe |
| **Incoming webhooks** | `POST /hooks/:projectId/:name` → verify → workflow |
| **CDC** | Table mutation outbox → topic → optional workflow trigger |
| **Secrets** | Vault refs by name; injectable only into runtime (never into source/skills) |
| **Data templates** | Reusable schema+seed packs (marketplace-ready) |

### Explicitly out of scope (v1)

- Visual workflow designer UI (manifest + JS is enough; designer later)
- Multi-region worker affinity / durable workflow engines (Temporal)
- Replacing PGlite with shared Postgres for all apps
- Arbitrary long-lived user Node servers
- GraphQL (REST + SQL first)

### Non-goals

- Do not orphan or rewrite the Copilot `send-handler` path.
- Do not put fork skills into upstream `_system/` if that causes merge pain — use `_ext/` (see §6).
- Do not teach the model to invent custom servers when the runtime SDK exists.

---

## 3. How we are doing it (architecture)

### 3.1 Mental model

```
┌─────────────────────────────────────────────────────────────┐
│ Generated app (Vite/Next)                                   │
│  @doable/data     → auth only (+ rare admin/debug SQL)      │
│  @doable/runtime  → queries.run(name, params)  ← PRIMARY    │
│                   → api.*, workflows, topics, secrets       │
└──────────────────────────┬──────────────────────────────────┘
                           │ /__doable/*
┌──────────────────────────▼──────────────────────────────────┐
│ services/api — App Runtime (NEW overlay)                    │
│  query engine: Mustache SQL → $N binds → PGlite            │
│  routes: queries / api / hooks / topics / runtime-admin     │
│  runner: jailed workflow VM (reuses same named queries)     │
│  scheduler: cron tick → run queue                           │
│  bus: in-process + optional Redis                           │
│  outbox: data-worker mutation → CDC                         │
└───────┬───────────────────┬───────────────────┬─────────────┘
        │                   │                   │
   PGlite pool         credential vault    sandbox/jailedSpawn
   (existing)          (existing)          (existing)
```

### 3.1a Named queries (Mustache) — primary data access

**Problem today:** Generated UIs call `db.query` with raw SQL in the browser. That SQL never lives in one place workflows can share, and the browser is an unconstrained SQL client (bounded only by RLS + classifier).

**v1 rule:** App reads/writes go through **named queries** stored under `.doable/backend/queries/`. Frontend and workflows call the same names.

```
.doable/backend/queries/
  list_leads.sql
  create_lead.sql
  lead_by_email.sql
```

**Mustache syntax (values → bind params, never string-spliced into SQL):**

```sql
-- list_leads.sql
SELECT id, email, status, created_at
FROM leads
WHERE 1=1
{{#status}}
  AND status = {{status}}
{{/status}}
{{#search}}
  AND email ILIKE {{search_pattern}}
{{/search}}
ORDER BY created_at DESC
LIMIT {{limit}}
```

**Compile rules (security-critical):**

| Syntax | Meaning |
|--------|---------|
| `{{name}}` | Replace with next `$N` placeholder; push `params.name` as bind value |
| `{{#name}}…{{/name}}` | Include block only if `params.name` is present / truthy |
| `{{^name}}…{{/name}}` | Include block only if `params.name` is absent / falsy |
| `{{{ident}}}` or `{{@ident}}` | **Forbidden in v1** (no raw identifier interpolation). Tables/columns are fixed in the `.sql` file. |

After compile: `sqlText` + `values[]` → existing data-worker `query` path (RLS `app.user_id` still applied).

**Call sites (same query_name everywhere):**

```ts
// Frontend
import { runtime } from "@doable/runtime";
const r = await runtime.queries.run("list_leads", { status: "new", limit: 50 });

// Workflow
export async function run(ctx) {
  const r = await ctx.queries.run("list_leads", { status: "new", limit: 50 });
  // …
}
```

**HTTP:**

```
POST /__doable/queries/:queryName
{ "params": { "status": "new", "limit": 50 } }
```

**Optional meta** (`.doable/backend/queries/list_leads.meta.json`):

```json
{
  "description": "List leads for the current user",
  "params": {
    "status": { "type": "string", "required": false },
    "limit": { "type": "number", "required": false, "default": 50, "max": 200 }
  },
  "allow": ["end_user", "workflow", "api_key"]
}
```

**Relationship to `@doable/data`:**

| API | When to use (v1+) |
|-----|-------------------|
| `runtime.queries.run` | **Default** for all app screens and shared logic |
| `runtime.api.*` (auto CRUD) | Simple table admin / quick scaffolds |
| `db.query` (`@doable/data`) | Auth helpers stay; **discourage** ad-hoc SQL in UI — skill says ⛔ prefer named queries |
| `ctx.db.query` in workflows | Escape hatch only; prefer `ctx.queries.run` so UI + automation share SQL |

### 3.2 Keep PGlite multi-tenant as-is

**Already true today:** one PGlite worker per `projectId`, `acquireWorker` on first request, idle sweep (`DOABLE_APP_DB_*`).

**v1 additions only:**

1. **Mutation outbox** — after successful DML in the data-worker (or API wrapper around `query`/`exec`), emit change events.
2. **Warm pin** — if a project has active live-query subscribers or pending workflow runs, skip idle eviction (`pinReasons: Set`).
3. **Do not** rely on PGlite `LISTEN/NOTIFY` across pool lifecycle — CDC and live queries go through the **platform bus**.

### 3.3 Event bus (CDC + topics + live)

```
data-worker DML success
    → write _doable_outbox row (optional durable)
    → bus.publish(`proj:{id}:cdc`, ChangeEvent)
    → matching CDC bindings → enqueue workflow
    → topic aliases (optional) → bus.publish(`proj:{id}:topic:{name}`)
    → live SSE/WS subscribers
```

**Single-node default:** in-process `EventEmitter` / tiny pubsub.  
**Multi-node later:** Redis Streams or NATS (interface-stable from day one).

### 3.4 Workflow execution

1. Trigger fires (cron | webhook | topic | cdc | manual | `callWorkflow`).
2. Row inserted into `app_runtime_runs` (platform Postgres).
3. Runner acquires project sandbox profile `app-workflow` (new profile mirroring `ai-bash` limits).
4. Loads `.doable/backend/workflows/<id>.workflow.js`.
5. Injects frozen SDK object (no `process`, no `fs` except SDK `files`, no raw `net`).
6. Captures logs → `app_runtime_run_logs`.
7. Timeouts + memory caps from env (`DOABLE_APP_WF_*`).

### 3.5 Auto CRUD REST

Introspect PGlite `information_schema` (reuse `data.schema` path) → mount:

```
GET    /__doable/api/v1/:table
GET    /__doable/api/v1/:table/:id
POST   /__doable/api/v1/:table
PATCH  /__doable/api/v1/:table/:id
DELETE /__doable/api/v1/:table/:id
```

Rules:

- Same auth as `/__doable/data/*` (data token + app session → `app.user_id`).
- Only tables present in schema; deny `_doable_*` internals.
- Optional per-table ACL file: `.doable/backend/api/tables.json`.
- Mutations go through the same SQL path so **CDC still fires**.

### 3.6 Webhooks

```
POST /hooks/:projectId/:webhookName
  Headers: x-doable-webhook-secret: <vault secret value OR hashed token>
  Body: JSON
  → verify → enqueue workflow bound in webhooks.json
```

Public edge route (no browser JWT). Rate-limit per project. Body size cap.

### 3.7 Schedules

Platform ticker (start with `setInterval` + DB lease; upgrade to `pg-boss` / Redis later) reads `.doable/backend/schedules/*.json` synced into `app_runtime_schedules` on deploy/save.

### 3.8 Secrets

Reuse workspace/project credential vault + env-vars.

- Source/AI may only see **names**: `STRIPE_SECRET`, `WEBHOOK_SECRET`.
- Runtime resolves via `secrets.get(name)` inside workflow jail.
- Extend vault-bridge pattern used for preview env injection.

### 3.9 Data templates

Directory packs:

```
packages/doable-runtime/templates/data/<slug>/
  manifest.json
  migrations/*.sql
  seed.sql          # optional
  SKILL.snippet.md  # optional teaching fragment
```

AI applies via tool `runtime.apply_data_template` → sequential `data.migrate`.

Marketplace: extend `@doable/marketplace-bundle` codec later to include `dataTemplates` + `workflows` (v1.1).

---

## 4. Package & dependency choices

> **Implementers:** this is the canonical package list. Prefer these; do not invent alternate stacks without updating this section.

### 4.1 New first-party packages

| Package | Role |
|---------|------|
| **`packages/doable-runtime/`** (`@doable/runtime`) | Client SDK for generated apps: `queries.run`, `api.*`, topics, workflows invoke + shared types. Mirror `@doable/data` style: zero/few deps, pre-linked into projects. |
| **`services/api/src/app-runtime/`** | Server implementation (query engine, CRUD, workflows, bus, hooks — not a separate deployable in v1). |

Do **not** create a new microservice until multi-node bus forces it.

### 4.2 Existing first-party (reuse heavily)

| Existing | Reuse for |
|----------|-----------|
| `services/api/src/data-worker/*` | SQL execution, RLS, pool, acquire-on-demand (named queries compile then call this) |
| `packages/doable-data` | End-user **auth** client; keep available but **not** the primary query path once runtime is on |
| `integrations/credential-vault.ts` + `env/vault-bridge.ts` | Secrets |
| `sandbox/orchestrator.ts` + profiles | Workflow jail |
| `packages/dovault` | Lock policy files if needed; allow AI writes to `queries/*.sql` + workflow JS |
| `packages/docore` PolicyStore | Gate new AI tools |
| `builtin:data` MCP | Keep for migrate/schema; add sibling `builtin:runtime` |
| `ai/skills` + materializer | Teach the model |
| `@doable/marketplace-bundle` | Future packaging of query packs / templates / workflows |
| Preview `/__doable/*` injection (`injected-scripts.ts`, Caddy carve-out) | Same path for runtime client |

### 4.3 Third-party libraries (recommended)

Prefer small, boring deps already aligned with the stack (Hono, Zod, Node).

| Need | Package | Why |
|------|---------|-----|
| Schema validation | **`zod`** (already in api) | Manifests, query `.meta.json`, tool args, webhook bodies |
| Mustache SQL compile | **Custom compiler in `app-runtime/queries/compile.ts`** (preferred) *or* **`mustache`** only if we keep a strict token allowlist | Full Mustache HTML-escaping is the wrong model for SQL; we need `{{x}}` → `$N` binds. A ~100-line compiler is clearer and safer than depending on Mustache’s escape semantics |
| Cron parsing | **`croner`** or **`cron-parser`** | Lightweight; avoid `node-cron` daemon assumptions |
| Job queue (phase 2+) | **`pg-boss`** on platform Postgres | Uses existing PG; durable schedules/runs; no Redis required for single-node |
| Job queue (multi-node later) | **`bullmq` + Redis** *or* stay on pg-boss | Only if horizontal API replicas |
| Workflow sandbox | Existing **`jailedSpawn`** first; **`isolated-vm`** later if spawn cost hurts | Already proven in sandbox profiles |
| HTTP inside workflows | Node **`fetch`** (Node 22) | No axios |
| SSE live / topics | Hono streaming (existing SSE chat patterns) | Consistency |
| ID generation | `crypto.randomUUID()` | Already used |

**Avoid for v1:** Temporal, Inngest Cloud, Kafka, custom Postgres logical replication into PGlite, Deno as second runtime, string-interpolating Mustache into SQL, ORMs (Prisma/Drizzle) inside generated apps.

### 4.4 Why not ActivePieces flows / Zapier

ActivePieces pieces remain the **integration action library**. We are not embedding their flow engine — we need first-party triggers tied to PGlite CDC, project sandbox, named queries, and AI-authored JS with our SDK.

---

## 5. On-disk layout (generated project)

AI and tools write only under:

```
.doable/
  backend/
    README.md                 # short human/AI pointer (optional)
    queries/                  # ★ named Mustache SQL (primary data access)
      list_leads.sql
      list_leads.meta.json    # optional param schema / allow
      create_lead.sql
      create_lead.meta.json
    api/
      tables.json             # optional ACL / expose list (auto CRUD)
    workflows/
      lead-intake.workflow.js
      nightly-digest.workflow.js
    schedules/
      nightly-digest.json
    topics/
      manifest.json
    webhooks/
      lead-intake.json
    cdc/
      bindings.json
    secrets.refs.json         # names only: ["STRIPE_SECRET", ...]
    data-templates.lock.json  # applied template ids
```

**Example named query** (`queries/create_lead.sql`):

```sql
INSERT INTO leads (email, source)
VALUES ({{email}}, {{source}})
RETURNING id, email, created_at
```

**Example workflow reusing named queries** (preferred over raw `db.query`):

```js
/** @typedef {import("@doable/runtime").WorkflowContext} WorkflowContext */

/**
 * @param {WorkflowContext} ctx
 */
export async function run(ctx) {
  const { queries, topics, log, trigger } = ctx;

  log.info("lead webhook", { type: trigger.type });

  const email = trigger.payload?.email;
  if (!email) throw new Error("email required");

  const r = await queries.run("create_lead", {
    email,
    source: "webhook",
  });
  if (!r.ok) throw new Error(r.error?.message ?? "insert failed");

  await topics.publish("leads.created", { id: r.rows[0].id, email });
  return { ok: true, id: r.rows[0].id };
}
```

**Example frontend** (same query name):

```ts
import { runtime } from "@doable/runtime";

const created = await runtime.queries.run("create_lead", {
  email: form.email,
  source: "web",
});
const list = await runtime.queries.run("list_leads", { status: "new", limit: 50 });
```

**Example schedule:**

```json
{
  "id": "nightly-digest",
  "cron": "0 9 * * *",
  "timezone": "UTC",
  "workflow": "nightly-digest",
  "enabled": true
}
```

**Example CDC binding:**

```json
{
  "bindings": [
    {
      "id": "leads-to-topic",
      "table": "leads",
      "ops": ["insert", "update"],
      "topic": "leads.changed",
      "workflow": null
    },
    {
      "id": "leads-notify",
      "table": "leads",
      "ops": ["insert"],
      "workflow": "lead-intake",
      "topic": null
    }
  ]
}
```

---

## 6. Sync-safe repo organization (fork vs upstream)

### 6.1 Overlay rule

All fork-first work lives in paths upstream is unlikely to own:

```
packages/doable-runtime/                    # NEW package
services/api/src/app-runtime/               # NEW module tree
services/api/src/ai/skills/_ext/            # NEW skills root (fork)
services/api/src/mcp/builtin/runtime/       # NEW builtin MCP
docs/FULLSTACK_RUNTIME.md                   # this file
docs/FORK_EXTENSIONS.md                     # short divergence index (create with PR)
```

### 6.2 Allowed thin hooks in upstream-touched files

Prefer **one-liner registration**, not logic:

| File | Hook |
|------|------|
| API router index | `app.route("/", appRuntimeRoutes)` |
| `system-skills.ts` / materializer | Also prepend `_ext/` dirs |
| `mcp/builtin-connectors` or data register | `registerBuiltinRuntime(projectId)` |
| `data-worker` response path | `emitCdcIfMutation(...)` call into `app-runtime/cdc` |
| `injected-scripts.ts` | Expose `__DOABLE_RUNTIME` token/helpers if needed |
| Framework prompts | Single paragraph: “If backend needed, follow `@doable/runtime` + `_ext` skills” |

Document every hook in `docs/FORK_EXTENSIONS.md`.

### 6.3 Skills placement policy

| Location | Use |
|----------|-----|
| `_system/` | Only if contributing upstream-ready skills |
| **`_ext/`** | Fork full-stack skills (default for this work) |
| DB `context_skills` | Workspace-specific overrides |

Loader change: `getSystemSkillDirs()` returns `_system/*` **then** `_ext/*`.

---

## 7. How the AI will generate these (quality bar)

### 7.1 Same quality formula as UI

UI quality today =

**mode prompt + framework prompt + system skills + hard tools + validation guards + templates**

Backend must mirror that — **not** “hope the model invents Express.”

### 7.2 New `_ext` skills (required)

Create these with rich `description` trigger keywords (SDK matches on description):

| Slug | Teaches |
|------|---------|
| `inbuilt-runtime` | Overview: named queries first; when to use API vs workflow vs cron vs webhook; layout under `.doable/backend` |
| `named-queries` | Mustache SQL files, `runtime.queries.run` / `ctx.queries.run`, meta.json, ⛔ no inline `db.query` in UI |
| `auto-crud-api` | Schema-first → tables.json → never hand-roll REST (secondary to named queries) |
| `workflows-js` | `run(ctx)` contract, prefer `ctx.queries.run`, SDK methods, error handling, idempotency |
| `webhooks-and-schedules` | Manifests, secrets refs, cron timezone |
| `topics-and-cdc` | Outbox mental model, bindings, no PGlite LISTEN |
| `secrets-and-refs` | Names only in repo; vault UX |
| `data-templates` | Apply packs before custom SQL |

Each skill must include:

1. Hard rules (⛔ / MUST) like `inbuilt-database`
2. Ordered checklist (migrate → **named queries** → bind → workflow → verify)
3. Copy-paste correct examples
4. Anti-patterns (“do not create Express”, “do not put secrets in source”, “do not embed raw SQL in React components”, “do not use localStorage for server state”)

**Amend `inbuilt-database` (or `_ext` overlay note):** when `DOABLE_APP_RUNTIME_ENABLED=1`, after migrate/schema the AI MUST write `.doable/backend/queries/*.sql` and call them from the UI — not `db.query` with string SQL in components.

### 7.3 New build-time tools / MCP (`builtin:runtime`)

| Tool | Purpose |
|------|---------|
| `runtime.validate` | Parse all `.doable/backend/**` manifests + query Mustache + workflow syntax |
| `runtime.upsert_query` | Write/update a named query `.sql` (+ optional `.meta.json`) and validate compile |
| `runtime.test_query` | Run a named query with fixture params (RLS identity optional) |
| `runtime.apply_data_template` | Run template migrations |
| `runtime.upsert_schedule` | Register schedule (DB + file) |
| `runtime.upsert_webhook` | Register webhook + ensure secret ref exists |
| `runtime.upsert_cdc_binding` | Write bindings + validate table exists |
| `runtime.test_workflow` | Dry-run with fixture payload (sandbox) |
| `runtime.openapi` | Return generated OpenAPI for exposed tables (+ list query names) |

Wire through existing MCP tool-bridge naming: `mcp_runtime_*` or native Copilot custom tools — **prefer MCP builtin** for consistency with `builtin:data`.

### 7.4 Prompt injection (framework)

Add a short **Backend contract** section to `framework-prompts/vite-react.ts` and `nextjs-app.ts` (or a shared snippet imported by both):

```
## Backend (platform runtime)
- Persistence schema: data.migrate + inbuilt-database (unchanged).
- App data access: named Mustache queries in .doable/backend/queries/*.sql
  — call via runtime.queries.run("query_name", params) from the UI.
  — ⛔ Do NOT put raw SQL strings in React/components via db.query.
- Workflows reuse the SAME query names via ctx.queries.run(...).
- REST: auto CRUD (/__doable/api) for simple table admin — do not create Express.
- Automation: .doable/backend/workflows/*.workflow.js with @doable/runtime SDK.
- Triggers: schedules/, webhooks/, cdc/ manifests — never invent custom listeners.
- Secrets: names in secrets.refs.json only; values via platform vault.
- Before claiming done: runtime.validate + runtime.test_query / runtime.test_workflow.
```

### 7.5 Generation algorithm (what the agent should do)

When the user asks for a full-stack feature, the skill-enforced order is:

1. **Clarify triggers** (webhook? cron? UI-only? table change?).
2. **`data.schema`** — see existing tables.
3. **Migrate** schema (`data.migrate`) or `runtime.apply_data_template`.
4. **Write named queries** (`.doable/backend/queries/*.sql` + meta) — one query per use-case; `runtime.test_query`.
5. **Expose auto CRUD** only if needed (`api/tables.json`).
6. **Write workflow JS** that calls `ctx.queries.run` + manifests (schedule/webhook/cdc/topics).
7. **`secrets.refs.json`** + `request_integration` / vault hint if values needed.
8. **`runtime.validate`** (+ `runtime.test_workflow` when workflows exist).
9. **UI** wired to `runtime.queries.run` (not inline SQL).
10. Only then mark complete.

### 7.6 Quality gates (must implement)

| Gate | Enforcement |
|------|-------------|
| No Express/Fastify/Koa in AI output for backends | Skill + optional scanner pattern in `security/scanner-patterns.ts` |
| No raw `db.query("SELECT…")` in `src/**` app UI when runtime enabled | Skill + scanner |
| Named queries compile (Mustache → `$N`) | `runtime.validate` / `runtime.upsert_query` |
| Workflows export `run`; prefer `queries.run` | `runtime.validate` |
| Secret values never in files | scanner + validate |
| CDC tables exist | validate against schema |
| Cron valid | zod + croner |
| RLS on new tables | existing inbuilt-database rules |
| Query + workflow smoke | `runtime.test_query` / `runtime.test_workflow` before “done” |

### 7.7 Do we need extra agents?

| Phase | Agent strategy |
|-------|----------------|
| **v1** | **No new Copilot agent.** Skills + tools + prompt section. |
| **v1.5** | Optional editor mode `backend` with tool allowlist focused on data/runtime (deny visual-edit noise). |
| **v2** | Sub-agent only if sessions thrash between UI polish and backend — not required to start. |

Cursor-side skills (`.cursor/skills`) are for **platform developers**, not end-user generation. Optional: add a Cursor skill that points implementers at this doc.

---

## 8. Platform data model (platform Postgres)

New tables (migration under `services/api/src/db/migrations/` with fork prefix e.g. `9xx_` or dated):

```sql
-- app_runtime_schedules
--   id, project_id, workflow_id, cron, timezone, enabled, next_run_at, lease_owner, lease_until

-- app_runtime_webhooks
--   id, project_id, name, workflow_id, secret_ref, enabled

-- app_runtime_cdc_bindings
--   id, project_id, table_name, ops[], topic, workflow_id

-- app_runtime_runs
--   id, project_id, workflow_id, trigger_type, trigger_payload jsonb,
--   status (queued|running|succeeded|failed|cancelled),
--   error, started_at, finished_at, attempt

-- app_runtime_run_logs
--   id, run_id, ts, level, message, data jsonb

-- app_runtime_secrets_refs
--   project_id, name, vault_connection_id nullable, env_var_id nullable
```

RLS: workspace-scoped via existing project membership patterns.

Per-app PGlite optional table (auto-migrated by runtime):

```sql
CREATE TABLE IF NOT EXISTS _doable_outbox (
  id bigserial PRIMARY KEY,
  table_name text NOT NULL,
  op text NOT NULL,
  row_pk text,
  payload jsonb,
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);
```

---

## 9. HTTP / SDK contracts

### 9.1 Routes (API service)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/__doable/queries/:queryName` | data token + app session |
| `GET` | `/__doable/queries` | data token (list names + meta, no SQL body to end users if locked) |
| `*` | `/__doable/api/v1/:table[/:id]` | data token + app session |
| `POST` | `/hooks/:projectId/:name` | webhook secret |
| `GET` | `/__doable/topics/:name/subscribe` | data token (SSE) |
| `POST` | `/__doable/topics/:name/publish` | data token or workflow identity |
| `POST` | `/__doable/runtime/workflows/:id/run` | project member / API key |
| `GET` | `/__doable/runtime/runs/:runId` | project member |
| `GET` | `/projects/:id/runtime/*` | dashboard admin UI later |

### 9.2 `@doable/runtime` client (generated apps)

```ts
import { runtime } from "@doable/runtime";

// ★ Primary data access — named queries (Mustache SQL on the server)
const list = await runtime.queries.run("list_leads", { status: "new", limit: 50 });
const created = await runtime.queries.run("create_lead", { email: "a@b.com", source: "web" });

await runtime.api.list("leads", { limit: 50 }); // auto CRUD (optional)
await runtime.api.create("leads", { email: "a@b.com" });
await runtime.topics.subscribe("leads.created", (ev) => { ... });
await runtime.workflows.invoke("nightly-digest", { dryRun: false });
```

Workflow context type exported for JSDoc in workflow files.

### 9.3 Workflow SDK surface (server-injected `ctx`)

| API | Behavior |
|-----|----------|
| **`ctx.queries.run(name, params)`** | **Preferred** — same named queries as the frontend |
| `ctx.db.query/exec` | Escape hatch only (ad-hoc SQL); discourage in skills |
| `ctx.http.fetch(url, init)` | Allowlist: https only; block link-local/metadata IPs |
| `ctx.secrets.get(name)` | From refs only |
| `ctx.topics.publish/subscribe` | Project-scoped |
| `ctx.files.read/write` | Sandbox dir or S3 adapter behind flag |
| `ctx.log.info/warn/error` | Persisted run logs |
| `ctx.integrations.invoke(id, action, input)` | Existing connector-proxy |
| `ctx.callWorkflow(id, payload)` | Enqueue child run (depth limit 3) |
| `ctx.trigger` | `{ type, payload, meta }` |

---

## 10. Security model

1. **Workflow jail** — no arbitrary shell; network via `ctx.http` only; FS via `ctx.files` only.
2. **Secret isolation** — decrypt only inside runner; never echo to logs (redact patterns from tracing).
3. **Webhook auth** — constant-time compare; rotate via vault.
4. **CDC privilege** — bindings only for tables that exist; payload size cap.
5. **CRUD / named queries** — RLS always on; only registered query names are executable from the client; param values are binds only (no SQL injection via Mustache).
6. **SSR F/deploy** — Caddy already carves `/__doable/*` to API; extend for `/hooks/*` public route.
7. **AI** — PolicyStore allow new tools; dovault may lock `secrets.refs.json` shape.

---

## 11. Implementation phases (for agents)

### Phase 0 — Scaffold (0.5–1 day)

**Do:**

- Create `packages/doable-runtime` with types + stub client.
- Create `services/api/src/app-runtime/{index,config,types}.ts`.
- Create `_ext/` loader hook + empty skills placeholders.
- Add `docs/FORK_EXTENSIONS.md` listing hooks.
- Feature flag: `DOABLE_APP_RUNTIME_ENABLED` (ON by default; set `0` to opt out).

**Done when:** package type-checks; flag off = zero behavior change.

### Phase 1 — Event bus + CDC outbox

**Do:**

- `app-runtime/bus.ts` (in-process).
- Hook data path to emit `ChangeEvent` on DML.
- Optional `_doable_outbox` migration in worker bootstrap.
- Warm-pin API on pool when subscribers > 0.
- Unit tests for emit + pin.

**Done when:** inserting a row via `/__doable/data/query` publishes an in-process event observed by a test subscriber.

### Phase 2 — Named queries + Auto CRUD REST

**Do:**

- Mustache → `$N` compiler (`app-runtime/queries/compile.ts`) + unit tests (injection attempts must fail / stay bound).
- Load `.doable/backend/queries/*.sql` (+ optional `.meta.json`).
- Route `POST /__doable/queries/:queryName`.
- `@doable/runtime` client: `queries.run(name, params)`.
- Auto CRUD route module + `tables.json` ACL + OpenAPI tool.
- Skills: `named-queries`, `auto-crud-api`, `inbuilt-runtime`.
- Tools: `runtime.upsert_query`, `runtime.test_query`.
- Link `@doable/runtime` into project node_modules like `@doable/data`.
- Scanner: flag raw `db.query("` in app `src/` when runtime enabled.

**Done when:**

1. AI (or test) migrates `tasks`, writes `list_tasks.sql` / `create_task.sql`, frontend lists/creates via `runtime.queries.run` only.
2. Workflow (stub) can call the same `list_tasks` name.
3. Optional: `GET/POST /__doable/api/v1/tasks` still works for CRUD scaffold.

### Phase 3 — Workflows + secrets

**Do:**

- Runner via `jailedSpawn` profile `app-workflow`.
- Manifest load from `.doable/backend/workflows`.
- `ctx` SDK with **`ctx.queries.run`** wired to the same engine as HTTP.
- `runtime.validate` + `runtime.test_workflow`.
- Skill `workflows-js` + `secrets-and-refs`.
- Runs/logs tables.

**Done when:** manual `POST .../workflows/demo/run` executes JS that uses `ctx.queries.run("create_lead", …)` and writes logs.

### Phase 4 — Webhooks + schedules + topics

**Do:**

- Public `/hooks/...`.
- Scheduler loop + lease.
- Topics publish/subscribe SSE.
- Skills `webhooks-and-schedules`, `topics-and-cdc`.
- CDC bindings → enqueue.

**Done when:** webhook → workflow → topic → SSE client receives event; cron fires in test with fake clock.

### Phase 5 — Data templates + polish

**Do:**

- 2–3 starter templates (saas-leads, todo-multi-tenant, waitlist).
- `runtime.apply_data_template`.
- Framework prompt snippet.
- Scanner anti-patterns.
- Enable flag default `1` in dev.
- Update `ARCHITECTURE.md` inventory.

**Done when:** golden prompt eval (below) passes manually.

---

## 12. Golden prompt eval (AI quality)

Agents must not ship a phase without running these prompts in a real project session (or recording fixtures):

| # | Prompt | Expect |
|---|--------|--------|
| G1 | “Build a waitlist with email signup and admin table” | migrate + **named queries** + UI via `runtime.queries.run`; RLS; no localStorage; no raw SQL in components |
| G2 | “Add a public REST API for waitlist entries” | `tables.json` + `/__doable/api`; no Express |
| G3 | “Add an inbound webhook that creates a lead and publishes topic `leads.created`” | webhook + workflow calling **`ctx.queries.run("create_lead")`** + secret ref + validate/test |
| G4 | “Every night at 09:00 UTC email a count of new leads” | schedule + workflow using named query for count + integration/http |
| G5 | “When a lead is inserted, run workflow `notify-slack`” | cdc binding; no LISTEN hacks |
| G6 | “Reuse the same list query from the dashboard and a nightly workflow” | one `list_*.sql`; both UI and workflow call same `query_name` |

Failure modes to watch: inventing Supabase without ask, putting secrets in source, skipping `runtime.validate`, creating `server.js`, **embedding SQL in React**, Mustache string-splicing instead of binds.

---

## 13. Config / env reference

```bash
DOABLE_APP_RUNTIME_ENABLED=0          # master switch — ON unless set to 0
DOABLE_APP_WF_TIMEOUT_MS=30000
DOABLE_APP_WF_MEMORY_MB=128
DOABLE_APP_WF_MAX_CONCURRENCY=8
DOABLE_APP_WF_MAX_CALL_DEPTH=3
DOABLE_APP_HOOK_BODY_MAX_BYTES=1048576
DOABLE_APP_BUS=inprocess              # later: redis
DOABLE_APP_SCHEDULER_TICK_MS=15000
# Existing DB pool knobs still apply:
# DOABLE_APP_DB_IDLE_MS, DOABLE_APP_DB_MAX_WORKERS, ...
```

While enabled (default), `create_file` / `edit_file` reject `db.query` / `db.admin.query` / `db.exec` and Express/Fastify/Koa in app source files. Opt out with `DOABLE_APP_RUNTIME_ENABLED=0`.

---

## 14. Testing requirements

| Layer | What |
|-------|------|
| Unit | Mustache compile → `$N`; injection attempts; zod manifests; cron parse; ACL; secret redaction |
| Integration | named query HTTP; worker DML → bus; CRUD RLS; webhook; workflow `queries.run` |
| Pool | warm-pin prevents idle kill while SSE subscribed |
| Contract | `@doable/runtime` types match server |
| AI eval | golden prompts G1–G6 |

Follow existing `tsx --test` patterns under `app-runtime/__tests__/`.

---

## 15. Implementation checklist for coding agents

Copy this into the implementing agent’s task list:

1. Read this doc + `ARCHITECTURE.md` §4–8 + `data-worker/pool.ts` + `inbuilt-database` skill.
2. Implement **Phase 0** only first; keep flag off.
3. Do not edit legacy `AIEngine` / orphaned `ai/tools/*`.
4. Prefer additive files under `app-runtime/` and `packages/doable-runtime/`.
5. For every user-facing capability, ship **skill + validate tool + test** in the same PR when possible.
6. Update `docs/FORK_EXTENSIONS.md` for any hook into upstream files.
7. Update `ARCHITECTURE.md` maturity table when a phase lands.
8. Never commit real secrets; use refs only in fixtures.

---

## 16. Decision log (locked for v1)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend hosting | Platform `/__doable` + jail | Matches data/AI/connectors |
| DB | Keep per-project PGlite | Already multi-tenant + RLS |
| **App SQL** | **Named Mustache queries on server** | Move SQL out of frontend; share with workflows |
| Mustache compile | Custom `{{x}}` → `$N` binds | Prevent SQL injection / bad Mustache HTML escape |
| Live/CDC | Platform bus, not PG LISTEN | Pool idle/recycle breaks LISTEN |
| Workflows | JS `run(ctx)` + `ctx.queries.run` | AI-native; sandboxable; shared SQL |
| Queue v1 | DB table + in-process worker | Simple; pg-boss later |
| Skills | `_ext/` overlay | Sync-safe vs upstream `_system` |
| Extra Copilot agent | Not in v1 | Skills+tools sufficient |
| ActivePieces | Actions only, not flow engine | Avoid dual orchestrators |

---

## 17. Open questions (do not block Phase 0–2)

1. S3 vs local sandbox for `ctx.files` default in self-host vs cloud.
2. Whether deployed static sites get workflow runs on the same API (yes by default).
3. Billing/credits metering for workflow minutes.
4. Marketplace codec fields for workflow bundles.

Record resolutions in this section when decided.

---

*End of spec. Implementing agents: start at §11 Phase 0; keep AI quality rules in §7 non-negotiable.*
