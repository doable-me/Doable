---
name: "inbuilt-runtime"
description: "Doable app runtime overview — named queries first, auto CRUD, workflows, cron, webhooks, CDC. Triggers on: backend, full-stack, API, REST, Express, Fastify, server.js, webhook, cron, schedule, workflow, automation, .doable/backend, @doable/runtime, runtime.queries, named query, business logic, backend logic, serverless, Edge Function."
---

# Inbuilt App Runtime

Every Doable project can use the **platform app runtime** under `.doable/backend/`.
You do **not** create Express, Fastify, Koa, Next.js API routes for CRUD, or a
custom Node server. Persistence stays on the inbuilt PGlite DB (`inbuilt-database`);
app data access and automation go through this runtime.

## Core rules

1. **Named queries are the default data path — ENFORCED.** UI and workflows call the
   same query names. Prefer `runtime.queries.run` / `ctx.queries.run`. create_file /
   edit_file **reject** raw `db.query` / Express in app source while the runtime is on
   (default; set `DOABLE_APP_RUNTIME_ENABLED=0` to opt out).
2. **⛔ Never invent Express / Fastify / Koa / `server.js` / custom HTTP servers**
   for project backends. Use auto CRUD (`/__doable/api`) or named-query HTTP.
3. **`@doable/runtime` is PRE-LINKED** (like `@doable/data`). Import it; do not
   add it to `package.json` or run `install_package` for it. `@doable/data` is for
   **auth only** (`db.auth.*`).
4. **Schema still comes from `data.migrate`.** Runtime does not replace
   `inbuilt-database` — it sits on top of the same PGlite + RLS.
5. **Pick the right surface** (see decision table). Do not bolt cron into the
   React tree or poll with `setInterval` for server work.
6. **Before claiming done:** `runtime.validate` + `runtime.test_query` /
   `runtime.test_workflow` as applicable.

## When to use what

| Need | Use | Not |
|------|-----|-----|
| List / create / update from UI | Named query + `runtime.queries.run` | Inline `db.query("SELECT…")` in components |
| Simple table admin / scaffold REST | Auto CRUD + `tables.json` | Hand-rolled Express |
| Multi-step logic, side effects, integrations | Workflow `.workflow.js` + `run(ctx)` | Client-only `fetch` loops |
| Time-based job | Schedule manifest + workflow | Browser `setInterval` |
| External system pushes events | Webhook manifest + workflow | Public unauthenticated custom route |
| React to row insert/update/delete | CDC binding → topic and/or workflow | PGlite `LISTEN/NOTIFY` |
| Live UI updates | Topics SSE via `runtime.topics.subscribe` | Polling every N seconds |

## On-disk layout

Write only under:

```
.doable/backend/
  queries/                  # ★ Mustache SQL (primary)
    list_leads.sql
    list_leads.meta.json
    create_lead.sql
  api/
    tables.json             # auto CRUD ACL
  workflows/
    lead-intake.workflow.js
  schedules/
    nightly-digest.json
  topics/
    manifest.json
  webhooks/
    lead-intake.json
  cdc/
    bindings.json
  secrets.refs.json         # names only
  data-templates.lock.json
```

## Ordered checklist (full-stack feature)

1. Clarify triggers (UI-only? webhook? cron? CDC?). Expand feature scope: every role + every entity gets real CRUD/workflows, not UI shells.
2. `data.schema` — inspect existing tables.
3. Migrate schema (`data.migrate`) **or** `runtime.apply_data_template`.
4. Write named queries (`.sql` + optional `.meta.json`); `runtime.test_query`.
5. **Seed demo/catalog data with `data.query` INSERTs** (and `db.auth.signup` for named demo accounts). Never `SEED_*` in React.
6. Expose auto CRUD only if needed (`api/tables.json`).
7. Write workflow JS that prefers `ctx.queries.run` + manifests (when needed).
8. Add secret **names** to `secrets.refs.json` (values via vault).
9. Wire UI to `runtime.queries.run` (not inline SQL / not Context mocks). Include signup + login when roles/accounts exist.
10. `runtime.validate` (+ `runtime.test_workflow` when workflows exist).
11. Only then mark complete.

**Multi-turn:** Large apps may span several Agent turns. Keep this order within and across turns — never ship `src/` screens before steps 3–5 for that feature. If `.doable/plan.md` exists, follow its steps and call `mark_step_complete` after each.

## Copy-paste: UI + same query in workflow

```ts
// Frontend
import { runtime } from "@doable/runtime";

const list = await runtime.queries.run("list_leads", { status: "new", limit: 50 });
if (!list.ok) {
  console.error(list.error?.message);
  return;
}
```

```js
// .doable/backend/workflows/nightly-digest.workflow.js
/** @typedef {import("@doable/runtime").WorkflowContext} WorkflowContext */
/** @param {WorkflowContext} ctx */
export async function run(ctx) {
  const r = await ctx.queries.run("list_leads", { status: "new", limit: 200 });
  if (!r.ok) throw new Error(r.error?.message ?? "query failed");
  ctx.log.info("digest count", { n: r.rowCount });
  return { ok: true, count: r.rowCount };
}
```

## Build-time MCP tools (`builtin:runtime`)

| Tool | Purpose |
|------|---------|
| `runtime.validate` | Parse manifests + Mustache + workflow syntax |
| `runtime.upsert_query` | Write/update named query + compile check |
| `runtime.test_query` | Run query with fixture params |
| `runtime.apply_data_template` | Apply starter data packs |
| `runtime.upsert_schedule` | Register cron schedule |
| `runtime.upsert_webhook` | Register webhook + secret ref |
| `runtime.upsert_cdc_binding` | CDC table → topic/workflow |
| `runtime.test_workflow` | Dry-run workflow with fixture |
| `runtime.openapi` | OpenAPI for exposed tables + query names |

Companion skills: `named-queries`, `auto-crud-api`, `workflows-js`,
`webhooks-and-schedules`, `topics-and-cdc`, `secrets-and-refs`, `data-templates`.

## Anti-patterns

- ⛔ Creating `server.js`, Express routers, or Next route handlers for CRUD.
- ⛔ Putting raw SQL strings in React components via `db.query`.
- ⛔ Using `localStorage` / IndexedDB for server-owned records.
- ⛔ Inventing Supabase / Firebase / custom Postgres when the inbuilt DB exists.
- ⛔ Skipping `runtime.validate` before saying the backend is done.
- ⛔ Embedding secret values in source or `.env` committed to the project.
