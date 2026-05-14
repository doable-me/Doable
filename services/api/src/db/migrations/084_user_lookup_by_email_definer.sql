-- 084_user_lookup_by_email_definer.sql
-- BUG-CORPUS-PROJ-005 (real root cause):
-- After migration 076 (users_workspace_visible) the RLS policy on `users`
-- only exposes rows for users who share at least one workspace with the
-- caller. That broke `POST /projects/:id/collaborators` and
-- `POST /workspaces/:id/invite` for the *common* case: looking up a
-- target user by email when that user is NOT yet in the caller's
-- workspace (i.e. exactly when you'd want to add them).
--
-- Symptom: `users.findByEmail(...)` returns undefined → handler returns
-- 404 "User not found" even when the user clearly exists (they can log
-- in with the same email seconds earlier).
--
-- Fix: a SECURITY DEFINER lookup helper that returns the minimal subset
-- of `users` columns needed for invite / collaborator handlers. Only
-- exposes (id, email, display_name, avatar_url) — never password_hash,
-- mfa secrets, or any other sensitive field. Restricts caller to
-- authenticated requests by requiring `doable_current_user_id()` to be
-- non-null; anonymous requests still see nothing (preserves the
-- pre-RLS-context "all visible" fallback for unauth code paths but
-- doesn't widen it to email-based enumeration).
--
-- Caller contract: the application handler MUST gate use of this helper
-- on the caller having permission to add a collaborator / send an
-- invite (workspace member role check). The helper itself only enforces
-- "caller is authenticated".

CREATE OR REPLACE FUNCTION doable_lookup_user_by_email(target_email text)
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  avatar_url text
) AS $$
  SELECT u.id, u.email, u.display_name, u.avatar_url
  FROM users u
  WHERE u.email = lower(target_email)
    AND doable_current_user_id() IS NOT NULL
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Limit invocation to roles the app actually connects as. `doable` is the
-- application role; `postgres` is the superuser already implicitly
-- privileged. The function is a no-op for unauthenticated calls so no
-- PUBLIC grant is needed.
DO $idem$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION doable_lookup_user_by_email(text) FROM PUBLIC';
EXCEPTION WHEN OTHERS THEN NULL;
END $idem$;
