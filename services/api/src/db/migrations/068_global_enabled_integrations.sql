-- 068_global_enabled_integrations.sql
-- Platform-wide integration enablement (managed by system admins from /admin).
-- When a platform admin enables an integration globally, it becomes available
-- in ALL workspaces (existing and future) without per-workspace setup.

CREATE TABLE IF NOT EXISTS platform_enabled_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id  varchar(100) NOT NULL UNIQUE,
  enabled         boolean NOT NULL DEFAULT true,
  configured      boolean NOT NULL DEFAULT false,
  enabled_by      uuid REFERENCES users(id),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pei_enabled ON platform_enabled_integrations (enabled);

-- Allow oauth_apps workspace_id to be NULL for global apps
ALTER TABLE oauth_apps ALTER COLUMN workspace_id DROP NOT NULL;

-- Auto-update updated_at
CREATE TRIGGER trg_pei_updated_at
  BEFORE UPDATE ON platform_enabled_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
