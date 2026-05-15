-- 086_platform_integration_credentials.sql
-- Platform-level credential storage for non-OAuth integration auth types
-- (secret_text, basic_auth, custom_auth). OAuth credentials use oauth_apps;
-- this table handles everything else at the platform (global) scope.
--
-- Credentials are stored encrypted with pgp_sym_encrypt using the master
-- ENCRYPTION_KEY (same pattern as integration_connections and oauth_apps).
-- Envelope encryption (envelope_v1) is NOT used here because platform-scope
-- credentials have no workspace_id from which to derive a DEK — that is a
-- future enhancement. See TODO in credential-vault.ts.
--
-- RLS: this table is service-role-only. Row-level security is enabled but
-- the only permissive policy is for connections where doable_current_user_id()
-- returns NULL (i.e., the service role / direct SQL queries that bypass the
-- per-request user context). All app-level access goes through the API layer
-- which enforces platformAdminMiddleware before touching these rows.

CREATE TABLE IF NOT EXISTS platform_integration_credentials (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id        text        NOT NULL UNIQUE,
  auth_type             text        NOT NULL CHECK (auth_type IN ('secret_text', 'basic_auth', 'custom_auth')),
  credentials_encrypted bytea       NOT NULL,
  credentials_format    text        NOT NULL DEFAULT 'pgp_sym' CHECK (credentials_format IN ('pgp_sym', 'envelope_v1')),
  display_hint          text,
  created_by            uuid        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_int_cred_integration
  ON platform_integration_credentials (integration_id);

-- Enable RLS. The table is only accessible when doable_current_user_id() IS NULL
-- (service role path). All end-user access is blocked regardless of their role.
ALTER TABLE platform_integration_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_int_cred_service_only ON platform_integration_credentials;

CREATE POLICY platform_int_cred_service_only ON platform_integration_credentials
  USING (doable_current_user_id() IS NULL);
