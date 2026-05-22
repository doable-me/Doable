-- Envelope encryption: each workspace owns its DEK; DEKs are wrapped by the KEK in process env.
--
-- Migrates credential storage away from a single global ENCRYPTION_KEY (used by
-- pgp_sym_encrypt across integration_connections.credentials_encrypted,
-- oauth_apps.client_secret_encrypted, github tokens, env_vars) toward
-- per-workspace Data Encryption Keys (DEKs) wrapped by a Key Encryption Key
-- (KEK) loaded from the API process env (DOABLE_KEK).
--
-- Wave 1 ships the table + helper module. Wave 2 will migrate call sites in
-- credential-vault.ts to read/write through encryptForWorkspace /
-- decryptForWorkspace; existing rows continue to decrypt with the legacy
-- ENCRYPTION_KEY until rotated.

CREATE TABLE workspace_keys (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key_version  int         NOT NULL,
  wrapped_dek  bytea       NOT NULL,
  wrapped_iv   bytea       NOT NULL,
  wrapped_tag  bytea       NOT NULL,
  kek_version  int         NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  rotated_at   timestamptz,
  active       boolean     NOT NULL DEFAULT true,
  UNIQUE (workspace_id, key_version)
);

CREATE INDEX idx_workspace_keys_active
  ON workspace_keys(workspace_id)
  WHERE active = true;

DO $grant$ BEGIN
  EXECUTE 'GRANT ALL ON workspace_keys TO doable';
EXCEPTION WHEN OTHERS THEN
  -- doable role may not exist in dev environments
  NULL;
END
$grant$;
