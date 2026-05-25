---
name: "inbuilt-database"
description: "Built-in per-project PGlite database — no external DB needed. Triggers on: database, persist data, store data, save records, PGlite, data.query, data.migrate, data.schema, CRUD, tables, rows, SQL, relational data, user data storage, backend storage."
---

# Inbuilt Database

Every Doable project has a built-in PGlite (PostgreSQL-compatible) database that is per-project and isolated. You do **not** need Supabase, localStorage, an external API, or any third-party database service — the database is already there.

## Core rules

1. **The inbuilt DB is the ONLY persistence layer.** Whenever the user wants to store, save, persist, or retrieve data, you MUST use the inbuilt database: create the schema with `data.migrate` at build time, and read/write it from app code via `import { db } from "@doable/data"`.
2. **🚫 localStorage / sessionStorage / IndexedDB / in-memory arrays are FORBIDDEN as the data store.** Never fall back to them to persist user records (tasks, leads, posts, notes, etc.). They are acceptable ONLY for trivial ephemeral UI state (e.g. "dark mode on", "sidebar collapsed", a draft being typed) — never as the place real data lives.
3. **`@doable/data` is PRE-LINKED, not missing.** It is deliberately absent from `package.json` yet fully resolvable — the platform links it into `node_modules` of every project. Just `import { db } from "@doable/data"`. NEVER add it to `package.json` and NEVER run install_package for it. Its absence from the dependency list does NOT mean it is unavailable, and is NOT a reason to fall back to localStorage.
4. **Never suggest an external database.** You do not need Supabase or any third-party DB — the inbuilt one is already there.
5. **Always check `data.schema` first** before writing app code that references a table. Never invent table or column names without verification.
6. **⛔ SCHEMA-FIRST HARD GATE.** Create every table with `data.migrate` (use `CREATE TABLE IF NOT EXISTS`) BEFORE writing the app code that queries it. The runtime `db.query` path only accepts `SELECT/INSERT/UPDATE/DELETE` — it rejects `CREATE TABLE`, and `db.exec` throws in app code. A table you reference from `db.query` but never migrated does not exist, so every query fails silently and the app shows no data. Order: (1) `data.migrate` → (2) `data.schema` to verify → (3) write app code.

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
  created_by  uuid NOT NULL DEFAULT (nullif(current_setting('app.user_id', true), ''))::uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
  -- add your columns here
);
ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;
CREATE POLICY <name>_owner ON <name>
  USING (created_by::text = current_setting('app.user_id', true))
  WITH CHECK (created_by::text = current_setting('app.user_id', true));
```

**Why `created_by::text`?** An absent end-user identity is an empty string `''`. Casting to `::uuid` would raise an error instead of cleanly matching zero rows, so always compare the text form to `current_setting('app.user_id', true)`.

**Insert rule:** do NOT include `created_by` in your INSERT and do NOT filter SELECTs by it. The column DEFAULT stamps `created_by` from the session identity automatically, and RLS auto-scopes every read/write to the current user. Manually passing `created_by` (e.g. a value the app made up) will mismatch the session identity and the row will be rejected by the WITH CHECK or invisible to reads.

### Multi-tenant / workspace apps

Add `workspace_id uuid NOT NULL` and a second RLS policy that joins through a workspace-membership table.

---

## Runtime: generated app code

In generated TypeScript/React code, import the pre-linked `@doable/data` package (do NOT add it to package.json, do NOT install_package it — it is already resolvable):

```ts
import { db } from "@doable/data";
```

The user's identity token is injected automatically by the preview runtime (`globalThis.__DOABLE_DATA_TOKEN`) — you do not need to pass it manually.

Every call returns a `{ ok, rows, rowCount, error }` result — it does NOT throw on a SQL error. Always check `ok` before using `rows`:

```ts
import { db } from "@doable/data";

const r = await db.query<{ id: string; title: string }>(
  "SELECT id, title FROM tasks ORDER BY created_at DESC LIMIT $1",
  [50],
);
if (!r.ok) {
  console.error(r.error?.message);
  return;
}
const tasks = r.rows; // typed rows
```

### Query pattern (always parameterised)

```ts
import { db } from "@doable/data";

// SELECT
const result = await db.query<{ id: string; title: string }>(
  "SELECT id, title FROM tasks ORDER BY created_at DESC LIMIT $1",
  [50],
);
const rows = result.ok ? result.rows : [];

// INSERT
await db.query(
  "INSERT INTO tasks (title) VALUES ($1)",
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
