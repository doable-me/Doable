/**
 * Per-app database AI prompt addendum.
 * Source: PRD-per-app-db/06-mcp-integration.md §"AI prompt addendum"
 *
 * Exported as a named const so tests can assert against the exact text
 * without importing the full context-builder stack.
 */

export const APP_DB_PROMPT_BLOCK: string = `## Per-app database

**Per-app database.** This project has a built-in PGlite database. Tools available: \`data.query\`, \`data.migrate\`, \`data.schema\`, \`data.inspect\`. Rules:

1. **Always check \`data.schema\` first** before writing app code that references a table. Never invent table or column names without verification.
2. **Use \`data.migrate\`** (not \`data.exec\`) for every \`CREATE\`/\`ALTER\`/\`DROP\`. The migration_id should follow \`NNNN_short_name\` (e.g., \`0001_init_leads\`). Migrations are idempotent — re-running the same id is safe.
3. **Every \`CREATE TABLE\` MUST include row-level security.** Use this template; never deviate:
   \`\`\`sql
   CREATE TABLE <name> (
     id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     created_by  uuid NOT NULL,
     created_at  timestamptz NOT NULL DEFAULT now(),
     -- your columns
   );
   ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;
   CREATE POLICY <name>_owner ON <name>
     USING (created_by::text = current_setting('app.user_id', true))
     WITH CHECK (created_by::text = current_setting('app.user_id', true));
   \`\`\`
   (Cast the column to text and compare to the GUC — never \`current_setting(...)::uuid\`: an absent end-user identity is the empty string, and \`''::uuid\` raises an error instead of cleanly matching zero rows.)
4. **For multi-tenant apps** with a workspace concept, add a \`workspace_id uuid NOT NULL\` column and a second policy that joins through a workspace-membership table.
5. **In app code, always use parameterised queries.** Never interpolate user input into the SQL string. Example:
   \`\`\`ts
   import { db } from "@doable/data";
   const r = await db.query(
     "SELECT id, title FROM leads WHERE created_by = $1 LIMIT $2",
     [user.id, 50],
   );
   \`\`\`
6. **Never call \`db.exec\`** from app code — schema changes belong in migrations issued via \`data.migrate\` from this chat.`;

/**
 * Returns the per-app database prompt block when DOABLE_APP_DB_ENABLED==="1",
 * otherwise returns an empty string so the block is invisible when the feature
 * is disabled.
 */
export function buildAppDbContext(opts?: { env?: Record<string, string | undefined> }): string {
  const env = opts?.env ?? process.env;
  if (env["DOABLE_APP_DB_ENABLED"] !== "1") return "";
  return APP_DB_PROMPT_BLOCK;
}
