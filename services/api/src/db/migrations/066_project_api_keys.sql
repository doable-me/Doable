-- 066_project_api_keys.sql
-- Secure integration proxy: project API keys for deployed apps.
-- These allow published apps to call the connector-proxy without
-- an ephemeral JWT (which requires the editor to be open).

CREATE TABLE IF NOT EXISTS project_api_keys (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key_hash      text NOT NULL,
  key_prefix    text NOT NULL,    -- first 8 chars for display/identification
  tier          text NOT NULL DEFAULT 'client' CHECK (tier IN ('client', 'server')),
  label         text,             -- user-provided label (e.g. "Production")
  created_by    uuid NOT NULL REFERENCES users(id),
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_api_keys_hash
  ON project_api_keys (key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_api_keys_project
  ON project_api_keys (project_id) WHERE revoked_at IS NULL;
