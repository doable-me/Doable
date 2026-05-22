-- 067_workspace_enabled_integrations.sql
-- Track which integrations are enabled per workspace.
-- Only enabled integrations are shown to regular users in the catalog.
-- Admins can enable/disable integrations and configure credentials.

CREATE TABLE IF NOT EXISTS workspace_enabled_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id  varchar(100) NOT NULL,
  enabled         boolean NOT NULL DEFAULT true,
  configured      boolean NOT NULL DEFAULT false,  -- true if OAuth credentials are set
  enabled_by      uuid REFERENCES users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, integration_id)
);

CREATE INDEX IF NOT EXISTS idx_wei_workspace ON workspace_enabled_integrations (workspace_id, enabled);

-- Auto-update updated_at
CREATE TRIGGER trg_wei_updated_at
  BEFORE UPDATE ON workspace_enabled_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
