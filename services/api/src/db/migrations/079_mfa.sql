-- 079_mfa.sql
-- Optional, per-user multi-factor authentication (TOTP + recovery codes).
--
-- Modular by design: this migration only adds storage. It does not flip
-- any policy switch. Users opt in from settings; nothing else changes
-- until a row exists in user_mfa_factors with verified_at IS NOT NULL.
--
-- TOTP secrets are stored as AES-256-GCM ciphertext wrapped with the
-- master KEK (DOABLE_KEK), produced by lib/envelope-crypto.encryptWithKek.
-- Wire format is the same blob as encryptForWorkspace minus the keyVersion
-- field — see lib/envelope-crypto.ts for the layout.
--
-- Recovery codes are stored as SHA-256 hex hashes; the plaintext is shown
-- to the user exactly once at enroll time (or after regenerate).

CREATE TABLE IF NOT EXISTS user_mfa_factors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            text NOT NULL DEFAULT 'totp' CHECK (type IN ('totp')),
  secret_ciphertext text NOT NULL,
  label           text NOT NULL DEFAULT 'Authenticator app',
  verified_at     timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- A user can have at most one verified TOTP factor (v1). Unverified rows
-- (mid-enrollment) can coexist with a verified one if the user is
-- re-enrolling, but only one verified factor is allowed at a time.
CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_factors_one_verified_per_user
  ON user_mfa_factors(user_id)
  WHERE verified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_mfa_factors_user_idx
  ON user_mfa_factors(user_id);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   text NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfa_recovery_codes_user_unused_idx
  ON mfa_recovery_codes(user_id)
  WHERE used_at IS NULL;

-- code_hash is globally unique to prevent any collision-based replay.
CREATE UNIQUE INDEX IF NOT EXISTS mfa_recovery_codes_hash_uniq
  ON mfa_recovery_codes(code_hash);
