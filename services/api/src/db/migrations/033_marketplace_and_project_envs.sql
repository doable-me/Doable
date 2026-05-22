-- 033_marketplace_and_project_envs.sql
-- Adds: marketplace listings/installs/reviews, per-project environments,
--        environment export bundles, install counts caching.
--
-- Design principles:
--   • Environments exist as ref-based composition (031). This migration adds
--     the discovery / sharing / per-project layers on top.
--   • Marketplace rows are lightweight: a listing is a pointer to an environment
--     that has is_template = true.  Installing clones the refs into the target
--     workspace — no runtime dependency on the listing.
--   • Per-project environments override workspace defaults using a priority chain:
--     project env > workspace default env > virtual default (all items).

-- ─── 1. Marketplace Categories ────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(80) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  description TEXT DEFAULT '',
  icon        VARCHAR(10) DEFAULT '📦',
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed a handful of useful categories
INSERT INTO marketplace_categories (slug, name, description, icon, sort_order)
VALUES
  ('frontend',   'Frontend',        'React, Vue, Svelte and other frontend frameworks', '🎨', 1),
  ('backend',    'Backend',         'Node.js, Python, Go backend patterns',             '⚙️', 2),
  ('fullstack',  'Full-Stack',      'End-to-end application environments',              '🏗️', 3),
  ('database',   'Database',        'PostgreSQL, MongoDB, Supabase, Prisma',            '🗃️', 4),
  ('testing',    'Testing',         'Unit tests, E2E, coverage, CI',                    '🧪', 5),
  ('devops',     'DevOps',          'Docker, Kubernetes, CI/CD, hosting',               '🚀', 6),
  ('design',     'Design',          'Tailwind, CSS-in-JS, UI component libraries',      '✨', 7),
  ('ai-ml',      'AI / ML',         'Copilot patterns, LLM integration, embeddings',    '🤖', 8),
  ('mobile',     'Mobile',          'React Native, Flutter, PWA',                       '📱', 9),
  ('security',   'Security',        'Auth, OWASP, encryption patterns',                 '🔒', 10),
  ('payments',   'Payments',        'Stripe, billing, subscription management',         '💳', 11),
  ('starter',    'Starter Kits',    'Boilerplates and quickstart environments',         '🎯', 12)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. Marketplace Listings ──────────────────────────────
-- A listing is a published snapshot of a template environment.

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id  UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  publisher_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES marketplace_categories(id) ON DELETE SET NULL,
  -- Metadata (can differ from the source environment for marketing)
  title           VARCHAR(200) NOT NULL,
  slug            VARCHAR(200) NOT NULL UNIQUE,
  short_desc      VARCHAR(300) DEFAULT '',
  long_desc       TEXT DEFAULT '',
  tags            TEXT[] DEFAULT '{}',
  -- Versioning
  version         VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  changelog       TEXT DEFAULT '',
  -- Stats (denormalised for perf — updated by triggers / cron)
  install_count   INT NOT NULL DEFAULT 0,
  avg_rating      NUMERIC(3,2) DEFAULT 0,
  review_count    INT NOT NULL DEFAULT 0,
  -- Visibility
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending','published','unlisted','rejected')),
  featured        BOOLEAN DEFAULT false,
  -- Timestamps
  published_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mktplace_listings_category ON marketplace_listings(category_id) WHERE status = 'published';
CREATE INDEX idx_mktplace_listings_status   ON marketplace_listings(status, featured DESC, install_count DESC);
CREATE INDEX idx_mktplace_listings_publisher ON marketplace_listings(publisher_id);
CREATE INDEX idx_mktplace_listings_tags     ON marketplace_listings USING gin(tags);

CREATE TRIGGER trg_mktplace_listings_updated_at
  BEFORE UPDATE ON marketplace_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 3. Marketplace Installs ──────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_installs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  environment_id  UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  version         VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Track whether the user's clone has diverged from the listing
  is_modified     BOOLEAN DEFAULT false,
  UNIQUE(listing_id, workspace_id)
);

CREATE INDEX idx_mktplace_installs_listing   ON marketplace_installs(listing_id);
CREATE INDEX idx_mktplace_installs_user      ON marketplace_installs(user_id);
CREATE INDEX idx_mktplace_installs_workspace ON marketplace_installs(workspace_id);

-- ─── 4. Marketplace Reviews ──────────────────────────────

CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       VARCHAR(200) DEFAULT '',
  body        TEXT DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, user_id)
);

CREATE INDEX idx_mktplace_reviews_listing ON marketplace_reviews(listing_id);

CREATE TRIGGER trg_mktplace_reviews_updated_at
  BEFORE UPDATE ON marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 5. Auto-update listing stats on review insert/delete ─

CREATE OR REPLACE FUNCTION fn_update_listing_review_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE marketplace_listings SET
      avg_rating   = COALESCE(sub.avg, 0),
      review_count = COALESCE(sub.cnt, 0)
    FROM (
      SELECT listing_id, AVG(rating)::NUMERIC(3,2) AS avg, COUNT(*) AS cnt
      FROM marketplace_reviews
      WHERE listing_id = NEW.listing_id
      GROUP BY listing_id
    ) sub
    WHERE marketplace_listings.id = NEW.listing_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE marketplace_listings SET
      avg_rating   = COALESCE(sub.avg, 0),
      review_count = COALESCE(sub.cnt, 0)
    FROM (
      SELECT listing_id, AVG(rating)::NUMERIC(3,2) AS avg, COUNT(*) AS cnt
      FROM marketplace_reviews
      WHERE listing_id = OLD.listing_id
      GROUP BY listing_id
    ) sub
    WHERE marketplace_listings.id = OLD.listing_id;
    -- Handle case where no reviews remain
    IF NOT FOUND THEN
      UPDATE marketplace_listings
      SET avg_rating = 0, review_count = 0
      WHERE id = OLD.listing_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_marketplace_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON marketplace_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_update_listing_review_stats();

-- ─── 6. Per-Project Environments ──────────────────────────
-- project_environments lets a project override its workspace default.
-- Chain: project env > workspace env > virtual default.

CREATE TABLE IF NOT EXISTS project_environments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id  UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id) -- one environment per project
);

CREATE INDEX idx_project_envs_env ON project_environments(environment_id);

-- ─── 7. Export bundles (optional caching of JSON blobs) ───
-- Stores serialised environment bundles for fast export/download.

CREATE TABLE IF NOT EXISTS environment_export_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id  UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  version         VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  bundle_json     JSONB NOT NULL,
  checksum        VARCHAR(64) NOT NULL, -- sha256 of bundle
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(environment_id, version)
);

-- ─── 8. Add `source_listing_id` to environments ──────────
-- Track which marketplace listing an environment was installed from.

ALTER TABLE environments
  ADD COLUMN IF NOT EXISTS source_listing_id UUID REFERENCES marketplace_listings(id) ON DELETE SET NULL;
