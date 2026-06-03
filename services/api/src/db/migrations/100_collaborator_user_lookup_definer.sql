-- 100_collaborator_user_lookup_definer.sql
--
-- BUG (Share dialog shows "No collaborators yet" for link-join collaborators):
--   `GET /projects/:id/collaborators` (services/api/src/routes/projects/item-routes.ts)
--   resolves collaborator display info with a raw `JOIN users u ON u.id = pc.user_id`.
--   That JOIN runs under the `users` FORCE-RLS policy `users_workspace_visible`
--   (migration 076) as the application role `doable_app`, which only exposes user
--   rows that share a workspace with the caller. A project shared via a
--   collaboration LINK adds the joiner to `project_collaborators` only (NOT
--   `workspace_members`), so a link-join collaborator shares NO workspace with the
--   project owner — the JOIN drops their row and the owner sees "No collaborators
--   yet" even though the `project_collaborators` rows exist (that table has no RLS).
--   Net effect: every link-join collaborator is invisible in the Share dialog's
--   collaborators list (each caller only ever sees their own row).
--
--   This is the same RLS class as BUG-CORPUS-PROJ-005, which fixed the *email
--   lookup* path (POST /collaborators, /workspaces/:id/invite) via the SECURITY
--   DEFINER helper `doable_lookup_user_by_email` (migration 084). The *list* path
--   was never given the same treatment.
--
-- FIX: a SECURITY DEFINER helper that resolves a SET of user ids to the minimal
--   public-safe columns (id, email, display_name, avatar_url), bypassing the users
--   visibility RLS but only for authenticated callers (doable_current_user_id()
--   non-null). The list handler already gates access via requireProjectAccess(),
--   and project_collaborators has no RLS, so enumerating a project's collaborators
--   is a legitimate, already-authorized operation. Mirrors migration 084 exactly:
--   never exposes password_hash, mfa secrets, or any other sensitive column.
--   The function is owned by the migration superuser (`doable`), so SECURITY
--   DEFINER bypasses the users FORCE-RLS. Permanent schema migration → applies to
--   every install method (bare-metal, docker, doable-cli) on every deploy.
--   Idempotent (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION doable_lookup_users_by_ids(target_ids uuid[])
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  avatar_url text
) AS $$
  SELECT u.id, u.email, u.display_name, u.avatar_url
  FROM users u
  WHERE u.id = ANY(target_ids)
    AND doable_current_user_id() IS NOT NULL
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- No PUBLIC grant: the function is a no-op for unauthenticated calls and is only
-- invoked by the application role. Mirrors migration 084.
DO $idem$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION doable_lookup_users_by_ids(uuid[]) FROM PUBLIC';
EXCEPTION WHEN OTHERS THEN NULL;
END $idem$;
