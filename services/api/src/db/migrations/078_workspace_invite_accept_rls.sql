-- 078_workspace_invite_accept_rls.sql
-- Unblocks POST /workspaces/invite/accept under RLS.
--
-- After 64afcf7 (authMiddlewareWithRls on workspaces) the original 071
-- WITH CHECK on workspace_members allowed only `admin_workspace_ids`
-- members to insert rows — fine for invite SENDERS, broken for invite
-- ACCEPTERS who haven't been members of the workspace yet.
--
-- Fix: add a third branch that allows a self-insert (user_id = caller)
-- when a non-expired invite exists for the caller's email + the target
-- workspace. The role on the row is enforced by the app handler against
-- the invite's role column — RLS just gates "is this self-insert backed
-- by a real outstanding invite?".
--
-- We intentionally do NOT check `accepted_at IS NULL`. The accept-invite
-- handler may mark `accepted_at` either BEFORE or AFTER the INSERT into
-- workspace_members; without reading every code path, requiring "still
-- pending" at policy-check time risks a TOCTOU race. The invite's
-- `expires_at` already bounds replay risk, and the handler is expected
-- to delete or invalidate the invite after acceptance.
--
-- SECURITY DEFINER helper bypasses RLS on workspace_invites + users so
-- the policy on workspace_members doesn't recurse.

CREATE OR REPLACE FUNCTION doable_user_has_pending_invite(target_workspace_id uuid, viewer_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_invites wi
    JOIN users u ON u.id = viewer_id
    WHERE wi.workspace_id = target_workspace_id
      AND wi.email = u.email
      AND wi.expires_at > now()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Replace 071's workspace_members WITH CHECK to add the third branch.
-- USING (read visibility) stays untouched from 071.
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
    OR (
      user_id = doable_current_user_id()
      AND doable_user_has_pending_invite(workspace_id, doable_current_user_id())
    )
  );
