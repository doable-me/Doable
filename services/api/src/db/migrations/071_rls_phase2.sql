-- 071_rls_phase2.sql
-- Extend RLS to multi-tenant tables that today rely only on app-layer authz.
-- Mirrors the style of 045: permissive when doable.current_user_id is unset
-- (covers migrations / background jobs / WS service); enforces row visibility
-- when set.

-- ════════════════════════════════════════════════════════════
-- workspace_members — visible only to fellow members of the same workspace
-- ════════════════════════════════════════════════════════════
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_members_self_visibility ON workspace_members
  USING (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm2
      WHERE wm2.workspace_id = workspace_members.workspace_id
        AND wm2.user_id = doable_current_user_id()
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm2
      WHERE wm2.workspace_id = workspace_members.workspace_id
        AND wm2.user_id = doable_current_user_id()
        AND wm2.role IN ('owner', 'admin')  -- only owners/admins can mutate membership
    )
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
        AND wm.role IN ('owner', 'admin', 'editor')
    )
  );
