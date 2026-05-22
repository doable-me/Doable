-- 073_workspace_sandbox_rules.sql
-- Workspace-configurable allow/deny rules for AI tool actions.
--
-- Deploy note: run via `pnpm db:migrate` (which connects as the `doable`
-- application user). If you have to apply this manually as the postgres
-- superuser, the ALTER ... OWNER TO doable lines at the bottom of this
-- file move ownership of the new objects so the API can read/write them
-- without a 42501 (insufficient_privilege) error.
--
-- Two layers:
--   workspace_sandbox_settings — per-workspace default action when no rule
--     matches ('allow' or 'deny'). Defaults to 'allow' so existing
--     workspaces keep current behavior. A workspace admin who wants
--     deny-by-default opts in by flipping it to 'deny' and adding allow
--     rules for trusted patterns.
--   workspace_sandbox_rules — ordered list of glob patterns with an action.
--     Lower priority number = higher precedence. First match wins.
--
-- Rule types supported in this scaffold:
--   'tool'    — matches against a tool key like 'install:<package>',
--               'bash:<command>'. Enforcement wired at install-package
--               in this migration; bash hook deferred.
--   'network' — matches against an outbound hostname. Enforcement is NOT
--               wired in this scaffold — that needs the dovault egress
--               jail (servertodo). Schema is ready for when it lands.
--
-- See `project_sandbox_allowlist_feature.md` in operator memory for the
-- planned doable-CLI integration.

DO $$ BEGIN
  CREATE TYPE sandbox_rule_action AS ENUM ('allow', 'deny');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE sandbox_rule_type AS ENUM ('tool', 'network');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Per-workspace defaults ────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_sandbox_settings (
  workspace_id           uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  tool_default_action    sandbox_rule_action NOT NULL DEFAULT 'allow',
  network_default_action sandbox_rule_action NOT NULL DEFAULT 'allow',
  updated_by             uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_wss_updated ON workspace_sandbox_settings;
CREATE TRIGGER trg_wss_updated
  BEFORE UPDATE ON workspace_sandbox_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Per-workspace rules ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_sandbox_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_type     sandbox_rule_type NOT NULL,
  pattern       text NOT NULL,
  action        sandbox_rule_action NOT NULL,
  priority      integer NOT NULL DEFAULT 100,
  description   text,
  created_by    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Same workspace cannot have duplicate (rule_type, pattern, action) entries.
  UNIQUE (workspace_id, rule_type, pattern, action)
);

CREATE INDEX IF NOT EXISTS idx_wsr_workspace_type_priority
  ON workspace_sandbox_rules (workspace_id, rule_type, priority);

DROP TRIGGER IF EXISTS trg_wsr_updated ON workspace_sandbox_rules;
CREATE TRIGGER trg_wsr_updated
  BEFORE UPDATE ON workspace_sandbox_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────
-- Visible to any workspace member; mutable only by owner/admin (matches
-- the same pattern as workspace_ai_settings / workspace_members from 071).
ALTER TABLE workspace_sandbox_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_sandbox_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wss_workspace_member ON workspace_sandbox_settings;
CREATE POLICY wss_workspace_member ON workspace_sandbox_settings
  USING (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_sandbox_settings.workspace_id
        AND wm.user_id = doable_current_user_id()
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_sandbox_settings.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  );

ALTER TABLE workspace_sandbox_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_sandbox_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wsr_workspace_member ON workspace_sandbox_rules;
CREATE POLICY wsr_workspace_member ON workspace_sandbox_rules
  USING (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_sandbox_rules.workspace_id
        AND wm.user_id = doable_current_user_id()
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = workspace_sandbox_rules.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ─── Ownership safety net ─────────────────────────────────────
-- When this migration is applied as the `doable` user (via
-- `pnpm db:migrate`), these lines are no-ops. When applied as the
-- postgres superuser they transfer ownership so the application user
-- can read/write the new objects without a 42501 error.
ALTER TABLE workspace_sandbox_settings OWNER TO doable;
ALTER TABLE workspace_sandbox_rules    OWNER TO doable;
ALTER TYPE  sandbox_rule_action        OWNER TO doable;
ALTER TYPE  sandbox_rule_type          OWNER TO doable;
