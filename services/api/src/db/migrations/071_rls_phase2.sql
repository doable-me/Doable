-- 071_rls_phase2.sql
-- Extend RLS to multi-tenant tables that today rely only on app-layer authz.
-- Mirrors the style of 045: permissive when doable.current_user_id is unset
-- (covers migrations / background jobs / WS service); enforces row visibility
-- when set.

-- ════════════════════════════════════════════════════════════
-- Helper: SECURITY DEFINER lookup of the workspace ids a user belongs to.
-- Used by the workspace_members policy to avoid the infinite-recursion trap
-- that hits when a policy on T self-references T inside its USING clause —
-- the inner SELECT would itself be RLS-checked, causing
-- "infinite recursion detected in policy for relation". A SECURITY DEFINER
-- function bypasses RLS for its body, so the helper can read membership
-- directly without re-entering the policy.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION doable_user_workspace_ids(uid uuid) RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM workspace_members WHERE user_id = uid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Second helper: workspace ids where the user is owner/admin. Used by the
-- WITH CHECK clause below. Both helpers MUST be SECURITY DEFINER so they
-- bypass RLS on workspace_members — otherwise any self-reference inside the
-- policy causes "infinite recursion detected in policy" the moment Postgres
-- plans an insert against the table (recursion is detected at plan time, not
-- via runtime OR short-circuit, so the doable_current_user_id() IS NULL guard
-- doesn't save us — see migration 074).
CREATE OR REPLACE FUNCTION doable_user_admin_workspace_ids(uid uuid) RETURNS SETOF uuid AS $$
  SELECT workspace_id FROM workspace_members
  WHERE user_id = uid AND role IN ('owner', 'admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ════════════════════════════════════════════════════════════
-- workspace_members — visible only to fellow members of the same workspace
-- ════════════════════════════════════════════════════════════
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
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

-- ════════════════════════════════════════════════════════════
-- ai_providers — visible to workspace members only
-- ════════════════════════════════════════════════════════════
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_providers FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_providers_workspace_member ON ai_providers
  USING (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_providers.workspace_id
        AND wm.user_id = doable_current_user_id()
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_providers.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ════════════════════════════════════════════════════════════
-- credit_balances — user sees their own; workspace owners/admins see all in workspace
-- ════════════════════════════════════════════════════════════
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_balances_owner_or_workspace_admin ON credit_balances
  USING (
    doable_current_user_id() IS NULL
    OR user_id = doable_current_user_id()
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = credit_balances.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = credit_balances.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ════════════════════════════════════════════════════════════
-- project_api_keys — visible to project's workspace members
-- ════════════════════════════════════════════════════════════
ALTER TABLE project_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_api_keys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_api_keys_workspace_member ON project_api_keys;
CREATE POLICY project_api_keys_workspace_member ON project_api_keys
  USING (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_api_keys.project_id
        AND wm.user_id = doable_current_user_id()
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM projects p
      JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = project_api_keys.project_id
        AND wm.user_id = doable_current_user_id()
        -- The workspace_role enum has owner | admin | member | viewer (no
        -- 'editor'). Anyone except viewer can mutate project API keys.
        AND wm.role IN ('owner', 'admin', 'member')
    )
  );
