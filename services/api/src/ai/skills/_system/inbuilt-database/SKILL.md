---
name: "inbuilt-database"
description: "Built-in per-project PGlite database — no external DB needed. Triggers on: database, persist data, store data, save records, PGlite, data.query, data.migrate, data.schema, CRUD, tables, rows, SQL, relational data, user data storage, backend storage."
---

# Inbuilt Database

Every Doable project has a built-in PGlite (PostgreSQL-compatible) database that is per-project and isolated. You do **not** need Supabase, localStorage, an external API, or any third-party database service — the database is already there.

## Core rules

1. **Never suggest an external database.** If the user wants to store or retrieve data, always use the inbuilt database via the tools and runtime import described below.
2. **Never add `@doable/data` to `package.json`.** It is pre-installed in every project. Just import it.
3. **Always check `data.schema` first** before writing app code that references a table. Never invent table or column names without verification.

---

## Build-time: AI tools (MCP)

Use these tools during the AI build session to set up and inspect the database. They are NOT available inside generated app code.

| Tool | Purpose |
|---|---|
| `data.migrate` | Run DDL (CREATE TABLE, ALTER TABLE, DROP TABLE, ENABLE ROW LEVEL SECURITY, CREATE POLICY). Every call requires a unique `migration_id`. |
| `data.query` | Run DML (SELECT, INSERT, UPDATE, DELETE) with RLS applied. Use for seeding or ad-hoc inspection. |
| `data.schema` | Inspect current tables, columns, and indexes. Always call this before writing app code. |

### Migration rules

- `migration_id` must follow `NNNN_short_name` format (e.g. `0001_init_tasks`, `0002_add_priority`).
- Migrations are **idempotent** — re-running the same `migration_id` is a no-op.
- Use `data.migrate` (not `data.query`) for **all** DDL. Never run `CREATE TABLE` or `ALTER TABLE` from app code.

### Row-level security is mandatory by default

**Enable RLS on EVERY table you create — whenever possible.** Each table gets a
`created_by uuid NOT NULL` column + `ENABLE ROW LEVEL SECURITY` + an owner policy.
The ONLY exception is data the user *explicitly* asks to be shared / public /
global. When unsure, secure it. (Owners can also toggle this from the Database →
Schema tab's "Enable RLS" button, but you should never ship a table without it.)

### Required table template (copy exactly, never deviate)

```sql
CREATE TABLE <name> (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
  -- add your columns here
);
ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <name>_owner ON <name>
  USING (created_by::text = current_setting('app.user_id', true))
  WITH CHECK (created_by::text = current_setting('app.user_id', true));
```

**Why `created_by::text`?** An absent end-user identity is an empty string `''`. Casting to `::uuid` would raise an error instead of cleanly matching zero rows, so always compare the text form to `current_setting('app.user_id', true)`.

**Insert rule:** always set `created_by = current_setting('app.user_id', true)::uuid` so RLS lets the row through.

### Multi-tenant / workspace apps

Add `workspace_id uuid NOT NULL` and a second RLS policy that joins through a workspace-membership table.

---

## Runtime: generated app code

In generated TypeScript/React code, import the pre-installed `@doable/data` package:

```ts
import { db } from "@doable/data";
```

The user's identity token is injected automatically by the preview runtime — you do not need to pass it manually.

### Query pattern (always parameterised)

```ts
import { db } from "@doable/data";

// SELECT
const result = await db.query<{ id: string; title: string }>(
  "SELECT id, title FROM tasks WHERE created_by = current_setting('app.user_id', true)::uuid ORDER BY created_at DESC LIMIT $1",
  [50],
);
const rows = result.rows;

// INSERT
await db.query(
  "INSERT INTO tasks (title, created_by) VALUES ($1, current_setting('app.user_id', true)::uuid)",
  [title],
);

// UPDATE
await db.query(
  "UPDATE tasks SET title = $1 WHERE id = $2",
  [newTitle, id],
);

// DELETE
await db.query(
  "DELETE FROM tasks WHERE id = $1",
  [id],
);
```

**Never interpolate user input into SQL strings.** Always use `$1`, `$2`, … placeholders.

**Never call `db.exec`** from app code — schema changes belong in `data.migrate` calls from this chat session.

---

## Database management UI

The project owner can view, edit, delete, and export all database data from the **Database** settings tab, which provides:

- **Overview** — row counts and table summary
- **Schema** — column definitions and indexes
- **Rows** — browsable, editable table data
- **Queries** — run ad-hoc SQL
- **Migrations** — full migration history
- **Danger Zone** — wipe or reset the database
