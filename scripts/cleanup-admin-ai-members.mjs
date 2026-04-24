/**
 * Cleanup spurious workspace memberships created by the old admin-ai
 * auto-add side effect.
 *
 * Background: prior to the admin-ai fix, every `PUT /admin/users/:userId/ai-allocation`
 * and `POST /admin/users/ai-allocations/copy-my-settings` call silently
 * inserted the target user into the admin's workspace as a `member`.
 * This script removes those rows safely:
 *
 * Deletion criteria (ALL must hold for a row to be deleted):
 *   - row.role = 'member' (never touch owner/admin)
 *   - row.invited_by IS NOT NULL (was added by someone, not self-created)
 *   - row.invited_by != user_id (sanity)
 *   - the user owns a *different* workspace (their own home workspace)
 *   - no `workspace_invites` row exists for (workspace_id, user.email)
 *     proving they were never legitimately invited
 *
 * Usage:
 *   DRY RUN (default): node scripts/cleanup-admin-ai-members.mjs
 *   APPLY:              APPLY=1 node scripts/cleanup-admin-ai-members.mjs
 */

import { createRequire } from "node:module";

// Resolve the `postgres` package from the api service so this script doesn't
// require its own node_modules. Override the lookup base via REQUIRE_FROM if
// you want to resolve from somewhere else.
const requireFrom = process.env.REQUIRE_FROM
  ? new URL(`file://${process.env.REQUIRE_FROM}/`)
  : new URL("../services/api/package.json", import.meta.url);
const require = createRequire(requireFrom);
const postgres = require("postgres");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const APPLY = process.env.APPLY === "1";

const sql = postgres(DATABASE_URL);

const candidates = await sql`
  SELECT
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.invited_by,
    wm.joined_at,
    u.email             AS member_email,
    inv_u.email         AS inviter_email,
    w.name              AS workspace_name,
    w.slug              AS workspace_slug,
    own_w.id            AS owns_workspace_id,
    own_w.slug          AS owns_workspace_slug
  FROM workspace_members wm
  INNER JOIN users u       ON u.id = wm.user_id
  LEFT  JOIN users inv_u   ON inv_u.id = wm.invited_by
  INNER JOIN workspaces w  ON w.id = wm.workspace_id
  LEFT  JOIN LATERAL (
    SELECT w2.id, w2.slug
    FROM workspaces w2
    INNER JOIN workspace_members wm2
      ON wm2.workspace_id = w2.id
     AND wm2.user_id = wm.user_id
     AND wm2.role = 'owner'
    ORDER BY w2.created_at ASC
    LIMIT 1
  ) own_w ON true
  WHERE wm.role = 'member'
    AND wm.invited_by IS NOT NULL
    AND wm.invited_by <> wm.user_id
    AND own_w.id IS NOT NULL
    AND own_w.id <> wm.workspace_id
    AND NOT EXISTS (
      SELECT 1 FROM workspace_invites wi
      WHERE wi.workspace_id = wm.workspace_id
        AND lower(wi.email) = lower(u.email)
    )
  ORDER BY w.slug, u.email
`;

console.log(`Found ${candidates.length} spurious membership(s):\n`);
for (const r of candidates) {
  console.log(
    `  - workspace="${r.workspace_slug}" (${r.workspace_name})  ` +
      `member=${r.member_email}  invited_by=${r.inviter_email ?? r.invited_by}  ` +
      `joined=${new Date(r.joined_at).toISOString()}  ` +
      `(user owns ws "${r.owns_workspace_slug}")`
  );
}

if (!APPLY) {
  console.log(
    `\nDRY RUN. Re-run with APPLY=1 to delete these ${candidates.length} row(s).`
  );
  await sql.end();
  process.exit(0);
}

if (candidates.length === 0) {
  console.log("\nNothing to delete.");
  await sql.end();
  process.exit(0);
}

const ids = candidates.map((r) => [r.workspace_id, r.user_id]);
let deleted = 0;
for (const [wsId, userId] of ids) {
  const result = await sql`
    DELETE FROM workspace_members
    WHERE workspace_id = ${wsId}
      AND user_id = ${userId}
      AND role = 'member'
  `;
  deleted += result.count;
}

console.log(`\nDeleted ${deleted} row(s).`);
await sql.end();
