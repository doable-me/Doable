-- 081_platform_settings.sql
--
-- Platform-wide singleton settings keyed by name. Used for infrastructure
-- toggles that aren't per-user/per-workspace feature flags — e.g. the DNS
-- mode (per-publish CNAME vs trust a wildcard CNAME already in Cloudflare).
--
-- The API treats a missing table as "no settings configured" (defaults
-- apply), so it is safe to deploy code that depends on this table before
-- the migration has been applied.

CREATE TABLE IF NOT EXISTS platform_settings (
    key         text         PRIMARY KEY,
    value       text         NOT NULL,
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    updated_by  uuid         REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE platform_settings IS
  'Platform-wide singleton config (DNS mode, etc). Admin-managed only.';
