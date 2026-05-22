-- 076_users_rls_workspace_visible.sql
-- Relax the 045 users_self policy. As-written, USING (id = me) hides every
-- user except the caller's own row, which silently breaks every JOIN that
-- reaches `users` to surface someone else's email/name (workspace owner
-- email, member list, collaborator avatars, etc.). Activating per-request
-- RLS context (see middleware/rls.ts → authMiddlewareWithRls) would have
-- regressed those features the moment it shipped.
--
-- The relaxed policy: a user can SEE themselves AND anyone they share at
-- least one workspace with. WITH CHECK stays strict — RLS still prevents
-- a user from modifying anyone else's row.
--
-- A SECURITY DEFINER helper does the membership lookup so the policy on
-- `users` does not re-enter RLS on `workspace_members` (mirrors the
-- pattern in 071 / 074, which fixed the same recursion trap).

CREATE OR REPLACE FUNCTION doable_user_shares_workspace(target_id uuid, viewer_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_members wm_viewer
    JOIN workspace_members wm_target
      ON wm_target.workspace_id = wm_viewer.workspace_id
    WHERE wm_viewer.user_id = viewer_id
      AND wm_target.user_id = target_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS users_self ON users;

CREATE POLICY users_workspace_visible ON users
  USING (
    doable_current_user_id() IS NULL
    OR id = doable_current_user_id()
    OR doable_user_shares_workspace(id, doable_current_user_id())
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR id = doable_current_user_id()
  );
