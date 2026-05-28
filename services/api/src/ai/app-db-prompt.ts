/**
 * Per-app database AI prompt addendum.
 * Source: PRD-per-app-db/06-mcp-integration.md §"AI prompt addendum"
 *
 * Exported as a named const so tests can assert against the exact text
 * without importing the full context-builder stack.
 */

export const APP_DB_PROMPT_BLOCK: string = `## Per-app database

**Per-app database.** This project has a built-in PGlite database that lives ON THE SERVER. App code reaches it ONLY through the pre-linked \`@doable/data\` package (\`import { db } from "@doable/data"\`); schema is created at build time via the \`data.*\` tools. **🚫 NEVER \`import ... from "@electric-sql/pglite"\` and NEVER call \`new PGlite()\` in app code** — that spins up a throwaway in-browser database that loses every row on reload and is NOT the inbuilt DB. If \`@doable/data\` ever seems unresolved, it is PRE-LINKED (not in package.json) — import it anyway; do NOT install it and do NOT substitute @electric-sql/pglite or localStorage. **🚫 NEVER create a local \`db.ts\`/\`db\` wrapper, a stub file, a \`.d.ts\` declaration, or a re-export for \`@doable/data\`, and NEVER hand-roll a \`fetch()\` data client or invent a data API URL (there is NO \`api.doable.dev\` or any external data endpoint).** The one and only data path is \`import { db } from "@doable/data"\`. A momentary "Failed to resolve import @doable/data" during startup is a transient that clears once the dev server finishes linking — keep the direct import and move on. Tools available: \`data.query\`, \`data.migrate\`, \`data.schema\`, \`data.inspect\`. Rules:

0. **⛔ CREATE THE SCHEMA *BEFORE* ANY APP CODE — NON-NEGOTIABLE.** Every table your app code will \`db.query\` MUST be created THIS SESSION via the \`data.migrate\` tool BEFORE you write the component that queries it. The runtime data endpoint the app uses ONLY accepts \`SELECT/INSERT/UPDATE/DELETE\` — it REJECTS \`CREATE TABLE\` (DDL), and \`db.exec\` throws in app code. So if you ship code that does \`db.query("... FROM todos ...")\` without first running a \`data.migrate\` that created \`todos\`, the table does NOT exist, every query fails silently, and the app shows empty/"no data" forever (the #1 reason a generated app "won't save anything"). Order, always: (1) \`data.migrate\` create table(s) → (2) \`data.schema\` to verify → (3) write the app code. Never skip step 1.
1. **Always check \`data.schema\` first** before writing app code that references a table. Never invent table or column names without verification.
2. **Use \`data.migrate\`** (not \`data.exec\`) for every \`CREATE\`/\`ALTER\`/\`DROP\`. The migration_id should follow \`NNNN_short_name\` (e.g., \`0001_init_leads\`). Migrations are idempotent — re-running the same id is safe; use \`CREATE TABLE IF NOT EXISTS\` so a replayed build never errors. A table referenced by \`db.query\` but never created with \`data.migrate\` simply does not exist.
3. **Row-level security is the DEFAULT for EVERY table — enable it whenever possible.** Every \`CREATE TABLE\` MUST have a \`created_by uuid NOT NULL\` column, \`ENABLE ROW LEVEL SECURITY\`, and an owner policy. The ONLY exception is data the user *explicitly* asks to be shared/public/global; when in doubt, secure it. Use this template; never deviate:
   \`\`\`sql
   CREATE TABLE <name> (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     created_by  uuid NOT NULL DEFAULT (nullif(current_setting('app.user_id', true), ''))::uuid,
     created_at  timestamptz NOT NULL DEFAULT now(),
     -- your columns
   );
   ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY <name>_owner ON <name>
     USING (created_by::text = current_setting('app.user_id', true))
     WITH CHECK (created_by::text = current_setting('app.user_id', true));
   \`\`\`
   **\`created_by\` MUST have that exact DEFAULT** — the data API sets \`app.user_id\` to the signed-in end-user, so the default stamps the row owner automatically. In the POLICY, cast the column to text and compare to the GUC — never \`current_setting(...)::uuid\` there: an absent identity is the empty string, and \`''::uuid\` raises instead of matching zero rows.
   **In app code: NEVER set \`created_by\` and NEVER filter by it.** Just INSERT your business columns (e.g. \`INSERT INTO leads (title, email) VALUES ($1,$2)\`) — the DEFAULT fills \`created_by\`. SELECT without a \`created_by\` filter (e.g. \`SELECT * FROM leads\`) — RLS auto-scopes every read/write to the current user. Manually passing \`created_by\` will mismatch the session identity and the row will be rejected or invisible.
4. **For multi-tenant apps** with a workspace concept, add a \`workspace_id uuid NOT NULL\` column and a second policy that joins through a workspace-membership table.
5. **In app code, always use parameterised queries.** Never interpolate user input into the SQL string. Example:
   \`\`\`ts
   import { db } from "@doable/data";
   const r = await db.query(
     "SELECT id, title FROM leads ORDER BY created_at DESC LIMIT $1",
     [50],
   );
   if (!r.ok) throw new Error(r.error?.message);
   \`\`\`
6. **Never call \`db.exec\`** from app code — schema changes belong in migrations issued via \`data.migrate\` from this chat.`;

/**
 * Returns the per-app database prompt block unless DOABLE_APP_DB_ENABLED==="0"
 * (the feature is ON by default; set the env var to "0" to opt out), otherwise
 * returns an empty string so the block is invisible when the feature is disabled.
 */
export function buildAppDbContext(opts?: { env?: Record<string, string | undefined> }): string {
  const env = opts?.env ?? process.env;
  if (env["DOABLE_APP_DB_ENABLED"] === "0") return "";
  return APP_DB_PROMPT_BLOCK;
}
