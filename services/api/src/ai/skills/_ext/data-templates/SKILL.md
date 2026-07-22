---
name: "data-templates"
description: "Apply starter data packs before custom SQL — saas-leads, todo, waitlist. Triggers on: data template, apply_data_template, starter schema, saas-leads, waitlist template, todo-multi-tenant, seed data, boilerplate tables, data-templates.lock.json, scaffold database."
---

# Data Templates

Reusable schema (+ optional seed) packs. Prefer applying a template **before**
hand-writing migrations when the user’s domain matches a pack.

## Core rules

1. **Apply packs first** via `runtime.apply_data_template` when a starter fits
   (waitlist, leads CRM, multi-tenant todo, etc.).
2. Templates run sequential `data.migrate`-style migrations; then you add
   **named queries** and workflows on top.
3. Record applied ids in `.doable/backend/data-templates.lock.json` (tool-managed).
4. Still follow `inbuilt-database` RLS rules — templates should ship owner RLS;
   do not strip it.
5. After apply: `data.schema` → write named queries → UI via `runtime.queries.run`.
6. Do not re-implement the same tables manually if the template already created them.

## Ordered checklist

1. Match user request to a template slug (or skip if truly custom).
2. `runtime.apply_data_template` with the slug.
3. `data.schema` to verify tables/columns.
4. Write named queries for the product UI (do not stop at raw tables).
5. Optional: auto CRUD `tables.json`, workflows, schedules.
6. `runtime.validate` + `runtime.test_query`.

## Typical pack layout (platform)

```
packages/doable-runtime/templates/data/<slug>/
  manifest.json
  migrations/*.sql
  seed.sql              # optional
  SKILL.snippet.md      # optional
```

## Copy-paste: after applying a waitlist pack

```ts
// Named queries on template tables — then bind UI
import { runtime } from "@doable/runtime";

await runtime.queries.run("create_waitlist_entry", {
  email: form.email,
});

const list = await runtime.queries.run("list_waitlist", { limit: 100 });
```

```sql
-- .doable/backend/queries/create_waitlist_entry.sql
INSERT INTO waitlist_entries (email)
VALUES ({{email}})
RETURNING id, email, created_at
```

## When to skip templates

- Domain is novel and no pack matches → `data.migrate` custom schema.
- User already has tables → extend with migrations; do not re-apply conflicting packs.

## Anti-patterns

- ⛔ Hand-rolling the same waitlist/leads schema a template already provides.
- ⛔ Applying a template then ignoring it and using `localStorage`.
- ⛔ Stopping after migrate — product UI still needs **named queries**.
- ⛔ Editing template migration files in the package instead of additive project migrations.
- ⛔ Claiming done without `data.schema` verification after apply.
