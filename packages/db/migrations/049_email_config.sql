-- Migration 049: Email provider configuration (encrypted at rest)
-- Stores the admin-configured email provider settings in the database.
-- All sensitive credentials (API keys, passwords, OAuth tokens) are
-- encrypted using pgp_sym_encrypt with the ENCRYPTION_KEY.
-- Only one active config row exists at a time (singleton pattern).

CREATE TABLE IF NOT EXISTS email_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Provider type: 'smtp', 'resend', 'google'
  provider TEXT NOT NULL CHECK (provider IN ('smtp', 'resend', 'google')),

  -- Human-readable label (e.g. "Gmail via OAuth", "Resend Production")
  label TEXT NOT NULL DEFAULT '',

  -- From address
  from_address TEXT NOT NULL DEFAULT 'Doable <noreply@doable.me>',

  -- All sensitive config is JSON-encrypted as one blob.
  -- SMTP: { host, port, user, pass, service }
  -- Resend: { apiKey }
  -- Google: { clientId, clientSecret, refreshToken, emailUser }
  credentials_encrypted BYTEA NOT NULL,

  -- Whether this config is currently active
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Status after last verification
  verified BOOLEAN NOT NULL DEFAULT false,
  last_verified_at TIMESTAMPTZ,
  last_error TEXT,

  -- Who configured this
  configured_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one active config at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_config_active
  ON email_config (is_active) WHERE is_active = true;

GRANT ALL PRIVILEGES ON email_config TO doable;
