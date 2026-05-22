-- 070_credentials_format.sql
-- Adds a discriminator column to integration_connections so we can mix
-- legacy pgp_sym_encrypt blobs and the new envelope-encrypted blobs
-- (per-workspace DEK wrapped by KEK) in the same credentials_encrypted column.
--
-- Existing rows default to 'pgp_sym' (the legacy format) so backwards-compat
-- is preserved without a data migration. New writes from credential-vault.ts
-- set the column explicitly based on the DOABLE_ENVELOPE_ENCRYPTION feature
-- flag. An operator-triggered helper (credentialVault.rewrapAllToEnvelope)
-- re-encrypts pgp_sym rows to envelope_v1 in place.

ALTER TABLE integration_connections
  ADD COLUMN credentials_format text NOT NULL DEFAULT 'pgp_sym';

COMMENT ON COLUMN integration_connections.credentials_format IS
  'pgp_sym | envelope_v1 — selects decryption path. Defaults to pgp_sym for backwards-compat.';
