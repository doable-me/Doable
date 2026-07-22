---
name: "named-queries"
description: "Named Mustache SQL queries under .doable/backend/queries — primary app data access. Triggers on: named query, Mustache SQL, runtime.queries.run, ctx.queries.run, list_*.sql, create_*.sql, meta.json, parameterized SQL, share SQL between UI and workflow, no inline db.query, SELECT in React, SQL in component."
---

# Named Queries

**Primary data access** for generated apps. Store SQL as named files; call them
from the UI and from workflows by the same name. The server compiles Mustache
tokens to `$N` bind parameters — values never string-splice into SQL.

## Core rules

1. **One query file per use-case** under `.doable/backend/queries/<name>.sql`.
2. **⛔ Do NOT put raw SQL in React/components** via `db.query("SELECT…")` or
   string templates. Use `runtime.queries.run("query_name", params)`.
3. **⛔ Never use `{{{ident}}}` or `{{@ident}}`.** Tables/columns are fixed in
   the `.sql` file — no dynamic identifier interpolation in v1.
4. **`{{name}}` → bind param only.** Optional blocks: `{{#name}}…{{/name}}` /
   `{{^name}}…{{/name}}`.
5. Prefer **the same query name** from UI (`runtime.queries.run`) and workflows
   (`ctx.queries.run`).
6. After writing: `runtime.upsert_query` (or write files) then `runtime.test_query`.
7. Schema must already exist (`data.migrate` / template) before queries reference tables.

## File layout

```
.doable/backend/queries/
  list_leads.sql
  list_leads.meta.json    # optional
  create_lead.sql
  create_lead.meta.json
```

Query name = file basename without `.sql` (e.g. `list_leads`).

## Mustache compile rules

| Syntax | Meaning |
|--------|---------|
| `{{name}}` | Next `$N` placeholder; push `params.name` as bind value |
| `{{#name}}…{{/name}}` | Include block if `params.name` is present / truthy |
| `{{^name}}…{{/name}}` | Include block if `params.name` is absent / falsy |
| `{{{ident}}}` / `{{@ident}}` | **Forbidden** |

## Ordered checklist

1. `data.schema` — confirm table/column names.
2. Write `.sql` with Mustache binds (no string concat of user input).
3. Add optional `.meta.json` (params, allow list, description).
4. `runtime.upsert_query` / save files; compile must succeed.
5. `runtime.test_query` with fixture params (+ optional RLS identity).
6. Call from UI: `runtime.queries.run`; from workflow: `ctx.queries.run`.
7. `runtime.validate` before done.

## Copy-paste: SQL + meta + callers

```sql
-- .doable/backend/queries/list_leads.sql
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

```json
{
  "description": "List leads for the current user",
  "params": {
    "status": { "type": "string", "required": false },
    "search": { "type": "string", "required": false },
    "search_pattern": { "type": "string", "required": false },
    "limit": { "type": "number", "required": false, "default": 50, "max": 200 }
  },
  "allow": ["end_user", "workflow", "api_key"]
}
```

```sql
-- .doable/backend/queries/create_lead.sql
INSERT INTO leads (email, source)
VALUES ({{email}}, {{source}})
RETURNING id, email, created_at
```

```ts
import { runtime } from "@doable/runtime";

const created = await runtime.queries.run("create_lead", {
  email: form.email,
  source: "web",
});
if (!created.ok) throw new Error(created.error?.message ?? "create failed");

const list = await runtime.queries.run("list_leads", {
  status: "new",
  limit: 50,
});
const rows = list.ok ? list.rows : [];
```

```js
// Workflow — same names
export async function run(ctx) {
  const r = await ctx.queries.run("create_lead", {
    email: ctx.trigger.payload?.email,
    source: "webhook",
  });
  if (!r.ok) throw new Error(r.error?.message ?? "insert failed");
  return { ok: true, id: r.rows[0].id };
}
```

## HTTP (platform)

```
POST /__doable/queries/:queryName
{ "params": { "status": "new", "limit": 50 } }
```

## Relationship to `@doable/data`

| API | When |
|-----|------|
| `runtime.queries.run` | **Default** for screens + shared logic |
| `runtime.api.*` | Simple auto CRUD admin (see `auto-crud-api`) |
| `db.query` | Auth helpers only; ⛔ not for ad-hoc UI SQL |
| `ctx.db.query` | Workflow escape hatch; prefer `ctx.queries.run` |

## Anti-patterns

- ⛔ `db.query(\`SELECT * FROM tasks WHERE id = '${id}'\`)` in components.
- ⛔ Duplicating the same SQL in UI and workflow with slight drift.
- ⛔ Mustache that splices identifiers or raw SQL fragments.
- ⛔ Referencing tables that were never migrated.
- ⛔ Skipping `runtime.test_query` after writing a new query.
- ⛔ Putting secret values or API keys inside `.sql` files.
