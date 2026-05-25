-- 098_project_collaborator_rls.sql
--
-- BUG (collaboration broken for PRIVATE projects):
--   `project_collaborators` is the canonical per-project Share/invite mechanism
--   (services/api/src/routes/projects/item-routes.ts → POST /:id/collaborators →
--   INSERT INTO project_collaborators). The app-layer gate requireProjectAccess()
--   (routes/projects/helpers.ts) treats a project_collaborators row as full
--   per-project access ("this specific project only").
--   BUT the RLS policy on `projects` (projects_workspace_member, from migration 045)
--   only grants visibility to workspace_members (or public). So a user shared into a
--   PRIVATE project — but who is NOT a workspace member — cannot even SELECT the row:
--   projects.findById() returns NULL under RLS, requireProjectAccess() returns null at
--   its first guard, and the API responds 404 "Project not found". Net effect: every
--   private-project collaborator gets 404 and the editor never loads (no presence,
--   default "My Awesome App" title, cascade of 404s on /view, /connector-proxy-token,
--   etc.). Public projects work only because of the explicit `visibility = 'public'`
--   clause + the auto-join path.
--
-- FIX: extend the `projects` RLS policy so a project_collaborators row also grants
--   access — READ (USING) for any collaborator role, WRITE (WITH CHECK) for editor+.
--   This aligns the RLS layer with the app-layer access model and makes Doable's
--   Share-to-a-private-project feature actually work. Idempotent (DROP IF EXISTS).
--   This is a permanent schema migration, so it applies to every install method
--   (bare-metal, docker, doable-cli) on every deploy.

DROP POLICY IF EXISTS projects_workspace_member ON projects;

CREATE POLICY projects_workspace_member ON projects
  FOR ALL
  USING (
    doable_current_user_id() IS NULL
    OR visibility = 'public'::project_visibility
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = doable_current_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = projects.id
        AND pc.user_id = doable_current_user_id()
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = projects.workspace_id
        AND wm.user_id = doable_current_user_id()
    )
    OR EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = projects.id
        AND pc.user_id = doable_current_user_id()
        AND pc.role IN ('owner', 'admin', 'editor')
    )
  );
