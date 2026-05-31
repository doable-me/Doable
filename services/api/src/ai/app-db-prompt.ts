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
3. **Enable RLS on EVERY table, then pick the policy by WHO should see the rows — public-read for shared content, owner-scoped for private data. Getting this wrong is the #1 reason a built app's preview looks empty.** Every \`CREATE TABLE\` MUST \`ENABLE ROW LEVEL SECURITY\`. Then choose:

   **(a) PUBLIC / SHARED content — anything a visitor or customer of the app is meant to browse** (product catalogs, restaurant menus, blog posts, listings, categories, events, public profiles, site/business settings). These rows are NOT owned by one end-user; they must be readable by EVERYONE — the owner's preview, anonymous visitors, and the deployed site. If the user says "customers can browse …", "show our products/menu", "a blog", "a directory" → it is PUBLIC. **When in doubt whether a table is public, ask: "would a visitor of this app need to see these rows?" If yes → use the PUBLIC pattern.** Owner-scoping public content makes it invisible to everyone but the one account that wrote it (the classic "menu/catalog shows blank" bug). Use:
   \`\`\`sql
   CREATE TABLE <name> (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     created_by  uuid NOT NULL DEFAULT (nullif(current_setting('app.user_id', true), ''))::uuid,
     created_at  timestamptz NOT NULL DEFAULT now(),
     -- your columns
   );
   ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY <name>_public_read ON <name> FOR SELECT USING (true);
   CREATE POLICY <name>_owner_write ON <name> FOR ALL
     USING (created_by::text = current_setting('app.user_id', true))
     WITH CHECK (created_by::text = current_setting('app.user_id', true));
   \`\`\`

   **(b) PRIVATE per-user data — rows each end-user should see ONLY their own of** (a user's own orders, cart, bookings, messages, profile). Owner-scope these:
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
   **\`created_by\` MUST have that exact DEFAULT.** In the POLICY, cast the column to text and compare to the GUC — never \`current_setting(...)::uuid\` there: an absent identity is the empty string, and \`''::uuid\` raises instead of matching zero rows.
   **In app code: NEVER set \`created_by\` and NEVER filter by it.** Just INSERT your business columns (e.g. \`INSERT INTO leads (title, email) VALUES ($1,$2)\`) — the DEFAULT fills \`created_by\`; RLS auto-scopes owner-scoped reads. Manually passing \`created_by\` mismatches the session identity and the row is rejected or invisible.
   **When SEEDING rows from THIS chat (data.query / data.exec): do NOT hardcode \`created_by\` to a placeholder like \`'00000000-0000-0000-0000-000000000000'\`.** The build-time data tools run as the project owner, so the \`created_by\` DEFAULT stamps the owner automatically — just INSERT your business columns and the seeded rows will be visible in the owner's preview. Hardcoding a zero/placeholder owner makes seeded rows invisible to the owner (and to public-read it is simply unnecessary).
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
6. **Never call \`db.exec\`** from app code — schema changes belong in migrations issued via \`data.migrate\` from this chat.
7. **🔐 USER ACCOUNTS / LOGIN — use the built-in \`db.auth\`; NEVER roll your own passwords table.** When the app needs its OWN end-users (a store's customers, a SaaS's users — distinct from the Doable account that builds the app), use the built-in auth on the pre-linked \`@doable/data\`:
   \`\`\`ts
   import { db } from "@doable/data";
   await db.auth.signup({ email, password, name }); // creates the account AND signs in
   await db.auth.login({ email, password });          // sign in
   const { user } = await db.auth.getUser();          // user is null when signed out — call on mount; survives reload
   await db.auth.logout();
   \`\`\`
   Passwords are hashed + verified SERVER-SIDE and stored OFF the app database — your app never sees a hash. So do NOT create a \`users\`/\`customers\`/passwords table, do NOT hash passwords yourself, and NEVER make a credentials table \`public_read\` (that would leak every hash). Once signed in, the logged-in end-user is automatically the identity for \`db.query\`, so OWNER-SCOPED tables (pattern (b) in rule 3) isolate each user's own rows with zero extra wiring — just \`SELECT * FROM bookings\` returns only the current user's bookings, and never set \`created_by\` yourself. On bad credentials the call returns \`{ ok: false, error, message }\` — show \`message\`. Store the user in React state from \`db.auth.getUser()\`; do NOT try to persist sessions in localStorage (it is blocked) — the session is kept in a cookie and restored by \`getUser()\`.
8. **🛡️ ADMIN DASHBOARDS — use \`db.admin.query\` to read ACROSS all users; plain \`db.query\` only ever sees the caller's own rows.** Owner-scoped RLS (rule 3b) means a normal \`SELECT * FROM orders\` returns ONLY the signed-in user's orders — correct for a customer's "my orders", but it makes an owner/admin "all orders" view come back EMPTY. For an admin or business-owner view that must span every end-user (all orders, today's bookings, every signup), use the elevated read:
   \`\`\`ts
   const { user } = await db.auth.getUser();
   if (user?.isAdmin) {
     const r = await db.admin.query("SELECT * FROM orders ORDER BY created_at DESC"); // ALL users' rows
   }
   \`\`\`
   The FIRST account to sign up for the app is automatically the admin (\`user.isAdmin === true\`) — that's the owner who sets it up; everyone after is a normal user. \`db.admin.query\` is READ-ONLY (SELECT only) and the server REJECTS it for non-admins, so gate admin UI on \`user.isAdmin\` and let the server enforce the rest. Use plain \`db.query\` for a user's own data and \`db.admin.query\` only for genuine cross-user admin views.`;

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
