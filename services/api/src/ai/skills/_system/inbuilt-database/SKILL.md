---
name: "inbuilt-database"
description: "Built-in per-project PGlite database — no external DB needed. Triggers on: database, persist data, store data, save records, PGlite, data.query, data.migrate, data.schema, CRUD, tables, rows, SQL, relational data, user data storage, backend storage, seed data, demo accounts, bookings, services catalog, admin dashboard, signup, login, management app."
---

# Inbuilt Database

Every Doable project has a built-in PGlite (PostgreSQL-compatible) database that is per-project and isolated. You do **not** need Supabase, localStorage, an external API, or any third-party database service — the database is already there.

## Core rules

1. **The inbuilt DB is the ONLY persistence layer.** Whenever the user wants to store, save, persist, or retrieve data, you MUST use the inbuilt database: create the schema with `data.migrate` at build time, then **named Mustache queries** under `.doable/backend/queries/*.sql` called from the UI via `import { runtime } from "@doable/runtime"` → `runtime.queries.run("name", params)`.
2. **🚫 localStorage / sessionStorage / IndexedDB / in-memory arrays / React Context entity lists are FORBIDDEN as the data store.** Never fall back to them to persist user records (tasks, leads, posts, notes, services, bookings, etc.). **⛔ Never invent `SEED_*` / `DEMO_*` / `INITIAL_*` / `DEMO_USERS` constants in app source** — seed with `data.query` INSERTs during the build, then load via `runtime.queries.run`. They are acceptable ONLY for trivial ephemeral UI state (e.g. "dark mode on", "sidebar collapsed", a draft being typed) — never as the place real data lives.
3. **`@doable/data` and `@doable/runtime` are PRE-LINKED, not missing.** They are deliberately absent from `package.json` yet fully resolvable. Use `@doable/runtime` for app data; use `@doable/data` **only for `db.auth.*`**. NEVER add them to `package.json` and NEVER run install_package for them.
4. **Never suggest an external database.** You do not need Supabase or any third-party DB — the inbuilt one is already there (unless the user explicitly connected Supabase).
5. **Always check `data.schema` first** before writing queries that reference a table. Never invent table or column names without verification.
6. **⛔ SCHEMA-FIRST HARD GATE.** Create every table with `data.migrate` (use `CREATE TABLE IF NOT EXISTS`) BEFORE writing named queries / app code. Order: (1) `data.migrate` → (2) `data.schema` → (3) `.doable/backend/queries/*.sql` → (4) UI via `runtime.queries.run`.
7. **⛔ NO raw SQL in React.** Never call `db.query` / `db.admin.query` / `db.exec` from app components — the platform **rejects** those file writes when the app runtime is enabled (default). Put SQL only in named query files.

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

**Primary data path — named queries (ENFORCED):**

```ts
import { runtime } from "@doable/runtime";

const r = await runtime.queries.run<{ id: string; title: string }>("list_tasks", {
  limit: 50,
});
if (!r.ok) {
  console.error(r.error?.message);
  return;
}
const tasks = r.rows;
```

Corresponding SQL lives in `.doable/backend/queries/list_tasks.sql` (Mustache `{{param}}` binds). See skills `named-queries` and `inbuilt-runtime`.

**Auth only — `@doable/data`:**

```ts
import { db } from "@doable/data";

await db.auth.signup({ email, password, name });
await db.auth.login({ email, password });
const { user } = await db.auth.getUser();
await db.auth.logout();
```

The identity token is injected automatically (`globalThis.__DOABLE_DATA_TOKEN`).

**⛔ Forbidden in app UI:** `db.query(...)`, `db.admin.query(...)`, `db.exec(...)` with SQL strings — create_file/edit_file reject them. **Never call `db.exec`** from app code — schema changes belong in `data.migrate` from this chat session.

---

## Database management UI

The project owner can view, edit, delete, and export all database data from the **Database** settings tab, which provides:

- **Overview** — row counts and table summary
- **Schema** — column definitions and indexes
- **Rows** — browsable, editable table data
- **Queries** — run ad-hoc SQL
- **Migrations** — full migration history
- **Danger Zone** — wipe or reset the database