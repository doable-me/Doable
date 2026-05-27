-- Custom domains for published projects (Pro+ feature)
-- Integrates with Cloudflare for SaaS (Custom Hostnames API) for SSL and routing.

DO $$ BEGIN
  CREATE TYPE custom_domain_status AS ENUM (
    'pending',        -- domain added, waiting for DNS verification
    'verifying',      -- DNS records detected, verification in progress
    'ssl_pending',    -- domain verified, SSL certificate being provisioned
    'active',         -- fully active, SSL valid, serving traffic
    'failed',         -- verification or SSL provisioning failed
    'removing'        -- removal in progress
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS custom_domains (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain                text NOT NULL,
  status                custom_domain_status NOT NULL DEFAULT 'pending',
  cloudflare_hostname_id text,           -- Cloudflare Custom Hostname ID (returned by their API)
  ssl_status            text,            -- 'pending' | 'active' | 'failed' etc from Cloudflare
  verification_txt_name text,            -- TXT record name for ownership verification
  verification_txt_value text,           -- TXT record value
  cname_target          text NOT NULL DEFAULT 'custom.doable.me',  -- the CNAME target we tell users
  verification_errors   text,            -- last error message from Cloudflare
  last_checked_at       timestamptz,     -- last time we polled Cloudflare for status
  created_by            uuid NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Each domain is globally unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains (domain);

-- Fast lookup by project
CREATE INDEX IF NOT EXISTS idx_custom_domains_project ON custom_domains (project_id);

-- Find domains needing verification polling
CREATE INDEX IF NOT EXISTS idx_custom_domains_pending ON custom_domains (status) WHERE status IN ('pending', 'verifying', 'ssl_pending');

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_custom_domains_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custom_domains_updated ON custom_domains;
CREATE TRIGGER trg_custom_domains_updated
  BEFORE UPDATE ON custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_custom_domains_timestamp();
