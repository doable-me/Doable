-- 074_fix_workspace_members_check_recursion.sql
-- Bug: 071's workspace_members WITH CHECK policy still self-references
-- workspace_members in a subquery. Postgres detects "infinite recursion in
-- policy for relation workspace_members" the moment ANY insert is attempted
-- against the table — even when doable_current_user_id() is NULL, because
-- recursion is detected during planning, not via OR short-circuit at runtime.
--
-- The b2e9ead commit fixed the USING clause but missed WITH CHECK.
-- Effect on prod: every new OAuth signup since 071 was deployed creates an
-- orphan workspace (workspaces row exists, workspace_members row never
-- inserted). On the next /auth/me, ensureWorkspace sees no membership and
-- creates ANOTHER orphan. New users end up with N workspaces and 0 members.
--
-- Fix: introduce a second SECURITY DEFINER helper that returns workspace ids
-- where the user is owner/admin, and rewrite WITH CHECK to use it. SECURITY
-- DEFINER bypasses RLS for the function body, breaking the cycle.

CREATE OR REPLACE FUNCTION doable_user_admin_workspace_ids(uid uuid) RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM workspace_members
  WHERE user_id = uid AND role IN ('owner', 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS workspace_members_self_visibility ON workspace_members;
CREATE POLICY workspace_members_self_visibility ON workspace_members
  USING (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()
    OR workspace_id IN (SELECT doable_user_workspace_ids(doable_current_user_id()))
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR workspace_id IN (SELECT doable_user_admin_workspace_ids(doable_current_user_id()))
  );
