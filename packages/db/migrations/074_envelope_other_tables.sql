-- 074_envelope_other_tables.sql
-- Extends envelope-encryption rollout (migrations 069 + 070) to two more
-- tables that hold secrets at rest: oauth_apps.client_secret_encrypted and
-- env_vars.value_encrypted.
--
-- Same discriminator pattern as 070_credentials_format.sql: existing rows
-- default to 'pgp_sym' so reads keep working; new writes set the column
-- explicitly when DOABLE_ENVELOPE_ENCRYPTION=1.
--
-- NOTE: oauth_apps rows with is_global=true have no workspace_id, so envelope
-- encryption (which requires a workspace_id to derive a DEK) is not applicable
-- — those continue to use the legacy pgp_sym path indefinitely.

ALTER TABLE oauth_apps ADD COLUMN IF NOT EXISTS credentials_format text NOT NULL DEFAULT 'pgp_sym';
ALTER TABLE env_vars   ADD COLUMN IF NOT EXISTS credentials_format text NOT NULL DEFAULT 'pgp_sym';

COMMENT ON COLUMN oauth_apps.credentials_format IS 'pgp_sym | envelope_v1';
COMMENT ON COLUMN env_vars.credentials_format   IS 'pgp_sym | envelope_v1';
