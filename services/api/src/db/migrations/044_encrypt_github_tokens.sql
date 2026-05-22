-- 044_encrypt_github_tokens.sql
-- Encrypt GitHub access tokens and webhook secrets at rest using pgp_sym_encrypt.
-- Mirrors the encryption pattern used by integration_connections and env_vars.
--
-- Strategy:
--   1. Add new *_encrypted columns
--   2. Migrate existing plaintext data into encrypted columns
--   3. Drop the old plaintext columns
--   4. Rename encrypted columns to the original names
--
-- Requires: pgcrypto extension (already installed) and ENCRYPTION_KEY env var.

-- Use a DO block so we can read the encryption key from a session variable.
-- The migration runner should SET doable.encryption_key before running this,
-- OR we fall back to the default dev key (which MUST be replaced in production).

DO $$
DECLARE
  enc_key TEXT;
BEGIN
  -- Try to read from current_setting; fall back to dev key
  BEGIN
    enc_key := current_setting('doable.encryption_key', true);
  EXCEPTION WHEN OTHERS THEN
    enc_key := NULL;
  END;

  IF enc_key IS NULL OR enc_key = '' THEN
    enc_key := 'doable-dev-encryption-key';
    RAISE NOTICE 'Using default encryption key — set doable.encryption_key for production';
  END IF;

  -- ─── github_connections: encrypt access_token ──────────────
  -- Only if the table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'github_connections') THEN
    -- Add encrypted column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'github_connections' AND column_name = 'access_token_encrypted'
    ) THEN
      ALTER TABLE github_connections ADD COLUMN access_token_encrypted TEXT;
    END IF;

    -- Migrate existing plaintext tokens (only if plaintext column exists)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'github_connections' AND column_name = 'access_token'
    ) THEN
      UPDATE github_connections
      SET access_token_encrypted = pgp_sym_encrypt(access_token, enc_key)
      WHERE access_token IS NOT NULL
        AND access_token_encrypted IS NULL;
    END IF;

    -- ─── github_connections: encrypt webhook_secret ────────────
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'github_connections' AND column_name = 'webhook_secret_encrypted'
    ) THEN
      ALTER TABLE github_connections ADD COLUMN webhook_secret_encrypted TEXT;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'github_connections' AND column_name = 'webhook_secret'
    ) THEN
      UPDATE github_connections
      SET webhook_secret_encrypted = pgp_sym_encrypt(webhook_secret, enc_key)
      WHERE webhook_secret IS NOT NULL
        AND webhook_secret_encrypted IS NULL;
    END IF;
  END IF;

  -- ─── github_user_tokens: encrypt access_token ─────────────
  -- Only if the table exists (it may not be present in all migration paths)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'github_user_tokens'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'github_user_tokens' AND column_name = 'access_token_encrypted'
    ) THEN
      ALTER TABLE github_user_tokens ADD COLUMN access_token_encrypted TEXT;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'github_user_tokens' AND column_name = 'access_token'
    ) THEN
      UPDATE github_user_tokens
      SET access_token_encrypted = pgp_sym_encrypt(access_token, enc_key)
      WHERE access_token IS NOT NULL
        AND access_token_encrypted IS NULL;
    END IF;
  END IF;

END $$;

-- ─── Drop plaintext columns ───────────────────────────────────
-- The encrypted columns keep their _encrypted suffix — query code
-- references them by that name and decrypts via pgp_sym_decrypt().

-- github_connections: drop plaintext access_token and webhook_secret
ALTER TABLE github_connections DROP COLUMN IF EXISTS access_token;
ALTER TABLE github_connections DROP COLUMN IF EXISTS webhook_secret;

-- github_user_tokens: drop plaintext access_token (if table exists)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'github_user_tokens') THEN
    ALTER TABLE github_user_tokens DROP COLUMN IF EXISTS access_token;
  END IF;
END $$;
