-- 073: per-workspace sandbox rules (tool + network allow/deny patterns)
-- Per SandboxAgnosticSandboxingPRD/10-config-management.md

CREATE TABLE IF NOT EXISTS workspace_sandbox_rules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  rule_type     text NOT NULL CHECK (rule_type IN ('tool','network','read','bash')),
  pattern       text NOT NULL,
  action        text NOT NULL CHECK (action IN ('allow','deny')),
  priority      int  NOT NULL DEFAULT 100,
  enabled       boolean NOT NULL DEFAULT true,
  reason        text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wsr_workspace_enabled ON workspace_sandbox_rules(workspace_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_wsr_workspace_type ON workspace_sandbox_rules(workspace_id, rule_type);
COMMENT ON TABLE workspace_sandbox_rules IS 'Per-workspace tool/network rules. Supports * and ? wildcards. PRD ch 10.';
COMMENT ON COLUMN workspace_sandbox_rules.pattern IS 'e.g. "install:lodash" or "ipinfo.io" or "bash:rm" or "read:/etc/passwd"';
COMMENT ON COLUMN workspace_sandbox_rules.priority IS 'Lower number = higher precedence within same rule_type+action; 100 default.';

-- RLS: members read, admins mutate
ALTER TABLE workspace_sandbox_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY wsr_read ON workspace_sandbox_rules
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = current_setting('app.user_id', true)::uuid
    )
  );
CREATE POLICY wsr_admin_write ON workspace_sandbox_rules
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = current_setting('app.user_id', true)::uuid
        AND role IN ('owner','admin')
    )
  );
