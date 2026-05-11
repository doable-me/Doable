-- 077_workspaces_rls.sql
-- Two changes in one migration, both needed for `authMiddlewareWithRls` on
-- the workspaces router (see commit 64afcf7) to behave correctly:
--
-- 1. Refactor `doable_user_admin_workspace_ids` to ALSO recognise rows where
--    the caller is `workspaces.owner_id`. As-shipped in 071 the helper only
--    looked at `workspace_members`, which created a chicken-and-egg failure:
--    when POST /workspaces fired with RLS context set, the inner
--    INSERT INTO workspace_members for the creator failed WITH CHECK
--    because the user wasn't yet a member of the workspace they just
--    created. Looking at `workspaces.owner_id` (which IS populated atomically
--    in the same tx, before the member insert) closes the gap with no
--    code changes in the route handler.
--
-- 2. Enable RLS on `workspaces` so the table joins the rest of the
--    multi-tenant defence-in-depth set (projects, ai_messages, etc.).
--    Today it's protected only by app-layer JOINs against workspace_members
--    — a single forgotten WHERE in a future query would leak rows.
--
-- Both helpers stay SECURITY DEFINER for the same reason migrations 071 /
-- 074 documented at length: a self-referential lookup inside an RLS policy
-- on `workspace_members` would hit Postgres's recursion detector at plan
-- time, not run time, so the IS NULL guard wouldn't save us.

-- ────────────────────────────────────────────────────────────
-- 1. Helper refactor — include workspaces.owner_id
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION doable_user_admin_workspace_ids(uid uuid) RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM workspace_members
   WHERE user_id = uid
     AND role IN ('owner', 'admin')
  UNION
  SELECT id FROM workspaces
   WHERE owner_id = uid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 2. workspaces RLS — visible to members, mutable by owner
-- ────────────────────────────────────────────────────────────
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

-- SELECT: any member of the workspace can see it. Permissive when the
-- request did not set a user (migrations, background jobs, WS service).
DROP POLICY IF EXISTS workspaces_member_select ON workspaces;
CREATE POLICY workspaces_member_select ON workspaces
  FOR SELECT USING (
    doable_current_user_id() IS NULL
    OR id IN (SELECT doable_user_workspace_ids(doable_current_user_id()))
    OR owner_id = doable_current_user_id()
  );

-- INSERT: you can create a workspace as long as you set yourself as the
-- owner. owner_id is NOT NULL on the table so this is unambiguous.
DROP POLICY IF EXISTS workspaces_self_insert ON workspaces;
CREATE POLICY workspaces_self_insert ON workspaces
  FOR INSERT WITH CHECK (
    doable_current_user_id() IS NULL
    OR owner_id = doable_current_user_id()
  );

-- UPDATE: only the current owner can update. WITH CHECK omits an
-- owner_id-equality so /:id/transfer can hand ownership to another user
-- without immediately becoming invisible to the outgoing owner inside the
-- same statement. The route handler is responsible for validating the
-- new owner is a member of the workspace before issuing the UPDATE.
DROP POLICY IF EXISTS workspaces_owner_update ON workspaces;
CREATE POLICY workspaces_owner_update ON workspaces
  FOR UPDATE USING (
    doable_current_user_id() IS NULL
    OR owner_id = doable_current_user_id()
  );

-- DELETE: only the current owner.
DROP POLICY IF EXISTS workspaces_owner_delete ON workspaces;
CREATE POLICY workspaces_owner_delete ON workspaces
  FOR DELETE USING (
    doable_current_user_id() IS NULL
    OR owner_id = doable_current_user_id()
  );

-- Known follow-up (intentionally NOT in this migration):
--   - POST /workspaces/invite/accept: a brand-new invitee inserting their
--     own workspace_members row still fails 071's WITH CHECK. Fix is
--     either (a) a fourth branch on workspace_members policy that allows
--     self-insert when a matching pending invite exists, or (b) move that
--     handler to plain authMiddleware (no RLS context). Pre-existing
--     regression from the 64afcf7 deploy; tracked separately.
