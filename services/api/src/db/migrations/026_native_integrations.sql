-- 026_native_integrations.sql
-- Native integrations engine: connections, OAuth apps, key-value store, and usage tracking.
-- Supports 630+ Activepieces-based integrations with encrypted credential storage
-- using the same pgp_sym_encrypt/pgp_sym_decrypt pattern as AI providers and GitHub tokens.

-- ─── Integration Connections ────────────────────────────────
-- User/workspace connections to third-party integrations.
-- Credentials are encrypted at rest via pgp_sym_encrypt with ENCRYPTION_KEY.
CREATE TABLE IF NOT EXISTS integration_connections (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  integration_id        varchar(100) NOT NULL,
  scope                 varchar(20) NOT NULL DEFAULT 'user'
                        CHECK (scope IN ('workspace', 'project', 'user')),
  project_id            uuid REFERENCES projects(id) ON DELETE CASCADE,
  auth_type             varchar(20) NOT NULL
                        CHECK (auth_type IN ('oauth2', 'secret_text', 'custom_auth', 'basic_auth', 'none')),
  credentials_encrypted bytea NOT NULL,
  display_name          varchar(200),
  status                varchar(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'error', 'expired', 'revoked')),
  error_message         text,
  metadata              jsonb DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ic_lookup ON integration_connections (workspace_id, user_id, integration_id);
CREATE INDEX IF NOT EXISTS idx_ic_scope ON integration_connections (workspace_id, scope, status);

-- ─── OAuth Apps ─────────────────────────────────────────────
-- Admin-managed OAuth app configurations (client ID + encrypted secret).
-- Global apps (is_global = true) have NULL workspace_id and apply platform-wide.
CREATE TABLE IF NOT EXISTS oauth_apps (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  integration_id          varchar(100) NOT NULL,
  client_id               varchar(500) NOT NULL,
  client_secret_encrypted bytea NOT NULL,
  extra_config            jsonb DEFAULT '{}',
  is_global               boolean DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ─── Integration Store ──────────────────────────────────────
-- Key-value store used by piece actions and triggers to persist state
-- (e.g., OAuth tokens, pagination cursors, dedup keys).
CREATE TABLE IF NOT EXISTS integration_store (
  scope_key     varchar(500) PRIMARY KEY,
  value         jsonb NOT NULL,
  workspace_id  uuid NOT NULL,
  user_id       uuid NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_is_workspace ON integration_store (workspace_id);

-- ─── Integration Usage Log ──────────────────────────────────
-- Tracks every integration action execution for analytics and debugging.
CREATE TABLE IF NOT EXISTS integration_usage_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  user_id         uuid NOT NULL,
  integration_id  varchar(100) NOT NULL,
  action_name     varchar(200) NOT NULL,
  success         boolean NOT NULL,
  duration_ms     integer,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iul_lookup ON integration_usage_log (workspace_id, integration_id, created_at DESC);

-- ─── Updated-at Triggers ────────────────────────────────────
-- Ensure the trigger function exists (defined in 001 but guard for safety)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ic_updated ON integration_connections;
CREATE TRIGGER trg_ic_updated
    BEFORE UPDATE ON integration_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_oauth_apps_updated ON oauth_apps;
CREATE TRIGGER trg_oauth_apps_updated
    BEFORE UPDATE ON oauth_apps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_is_updated ON integration_store;
CREATE TRIGGER trg_is_updated
    BEFORE UPDATE ON integration_store
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
