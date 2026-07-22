---
name: "auto-crud-api"
description: "Schema-driven auto CRUD REST under /__doable/api — tables.json ACL, never Express. Triggers on: REST API, CRUD API, public API, OpenAPI, tables.json, /__doable/api, runtime.api.list, runtime.api.create, expose table, admin CRUD, scaffold API, Express, Fastify, hand-roll REST."
---

# Auto CRUD API

After tables exist in PGlite, Doable can expose authenticated REST under
`/__doable/api/v1/:table` from schema + optional ACL. Use this for **simple
table admin / scaffolds**. Custom reads/writes still prefer **named queries**.

## Core rules

1. **Schema first** — `data.migrate` (or data template) before exposing a table.
2. **Configure exposure in** `.doable/backend/api/tables.json` — do not invent
   route handlers.
3. **⛔ Never create Express / Fastify / Koa / custom routers** for CRUD.
4. Named queries win for non-trivial filters, joins, and shared UI+workflow logic.
5. Mutations go through the same SQL path so **CDC still fires**.
6. Deny `_doable_*` internal tables — never expose them.
7. Use `runtime.openapi` to inspect the generated surface.

## Routes (platform-mounted)

```
GET    /__doable/api/v1/:table
GET    /__doable/api/v1/:table/:id
POST   /__doable/api/v1/:table
PATCH  /__doable/api/v1/:table/:id
DELETE /__doable/api/v1/:table/:id
```

Auth: same data token + app session as `/__doable/data/*` → RLS `app.user_id`.

## Ordered checklist

1. `data.schema` — confirm table exists and RLS is on.
2. Decide: auto CRUD enough, or named queries needed? (Prefer queries for product UI.)
3. Write `.doable/backend/api/tables.json` ACL.
4. Call from client via `runtime.api.*` or document the REST paths.
5. `runtime.openapi` to verify; `runtime.validate`.
6. Do **not** add a custom HTTP server.

## Copy-paste: `tables.json`

```json
{
  "tables": {
    "leads": {
      "expose": true,
      "methods": ["GET", "POST", "PATCH", "DELETE"],
      "allow": ["end_user", "api_key"]
    },
    "internal_jobs": {
      "expose": false
    }
  }
}
```

## Copy-paste: client

```ts
import { runtime } from "@doable/runtime";

const page = await runtime.api.list("leads", { limit: 50 });
if (!page.ok) {
  console.error(page.error?.message);
  return;
}

const created = await runtime.api.create("leads", {
  email: "a@b.com",
  source: "web",
});

await runtime.api.update("leads", created.rows[0].id, { status: "qualified" });
await runtime.api.delete("leads", created.rows[0].id);
```

## When NOT to use auto CRUD

- Joins, aggregates, or multi-table writes → **named query**.
- Logic that must run identically in a nightly workflow → **named query** + workflow.
- Webhook/cron side effects → **workflow**, not a custom REST handler.

## Anti-patterns

- ⛔ `npm install express` / writing `app.post("/api/leads", …)`.
- ⛔ Next.js Route Handlers that reimplement CRUD against PGlite.
- ⛔ Exposing `_doable_outbox` or other `_doable_*` tables.
- ⛔ Skipping RLS because “it’s just an admin API”.
- ⛔ Using auto CRUD as the only path when UI and cron need the same filter SQL
  (use a named query instead).
