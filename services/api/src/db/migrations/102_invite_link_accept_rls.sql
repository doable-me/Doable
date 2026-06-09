-- 102_invite_link_accept_rls.sql
-- Fix: accepting a SHAREABLE INVITE LINK fails with 500 / "Couldn't accept invite".
--
-- 078 added doable_user_has_pending_invite() so an invite ACCEPTER can self-insert
-- into workspace_members under RLS. But that helper only matches invites whose
-- `email` equals the caller's own email:
--     WHERE wi.workspace_id = target AND wi.email = u.email AND wi.expires_at > now()
--
-- Shareable invite links are stored with the sentinel email '__invite_link__'
-- (see workspaces.createInviteLink + the accept handler's isLinkInvite branch),
-- which never equals a real user's email. So for link invites the helper returns
-- false -> the workspace_members WITH CHECK policy rejects the self-insert ->
-- acceptInvite()'s addMember() INSERT throws -> POST /workspaces/invite/accept 500s.
--
-- Per-email invites are unaffected; only link-based joins were broken.
--
-- Fix: also treat a valid, unexpired shareable-link invite for the target
-- workspace as a "pending invite" for ANY authenticated caller. This matches the
-- product intent of a shareable link (anyone holding the link may join) and is
-- safe as a defense-in-depth gate: the only path that inserts the row is the
-- token-gated accept handler, which validates the link token via
-- getInviteByToken() BEFORE calling addMember(). RLS here just confirms the
-- workspace currently has a live invite mechanism.
--
-- SECURITY DEFINER (unchanged from 078) so the policy on workspace_members does
-- not recurse into workspace_invites / users RLS.

CREATE OR REPLACE FUNCTION doable_user_has_pending_invite(target_workspace_id uuid, viewer_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM workspace_invites wi
    JOIN users u ON u.id = viewer_id
    WHERE wi.workspace_id = target_workspace_id
      AND wi.expires_at > now()
      AND (
        wi.email = u.email          -- per-email invite addressed to this user
        OR wi.email = '__invite_link__'  -- shareable link: anyone with the link may join
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
