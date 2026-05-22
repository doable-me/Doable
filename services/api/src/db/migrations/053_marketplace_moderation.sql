-- 053_marketplace_moderation.sql
--
-- Adds the moderation surface for the marketplace: a queue, decisions log,
-- user-facing reports, and a verified-publisher flag. All tables are
-- additive and gated by IF NOT EXISTS so re-runs are safe.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── 1. Verified publishers ───────────────────────────────────
-- A boolean on `users` is sufficient at this scale; if we ever need
-- per-publisher settings we'll move to a publisher_profile table.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_verified_publisher'
  ) THEN
    ALTER TABLE users ADD COLUMN is_verified_publisher BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'verified_publisher_at'
  ) THEN
    ALTER TABLE users ADD COLUMN verified_publisher_at TIMESTAMPTZ;
  END IF;
END $$;

-- ─── 2. Moderation queue items ────────────────────────────────
-- One row per (listing, version) combination that requires review.
-- The queue is keyed by listing+version so re-publishing a new version
-- creates a fresh review item without losing the old decision history.
CREATE TABLE IF NOT EXISTS marketplace_moderation_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  version         VARCHAR(40) NOT NULL,
  reason          TEXT NOT NULL,
  manifest_summary JSONB,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  submitted_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_note TEXT,
  UNIQUE(listing_id, version)
);

CREATE INDEX IF NOT EXISTS idx_mkt_moderation_status_submitted
  ON marketplace_moderation_queue (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_moderation_listing
  ON marketplace_moderation_queue (listing_id);

-- ─── 3. User-filed reports ────────────────────────────────────
-- A separate stream for community-reported issues (spam, malware, etc).
-- Reports point at a listing (not a version) so they survive re-publishes.
CREATE TABLE IF NOT EXISTS marketplace_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  reporter_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          VARCHAR(40) NOT NULL
                    CHECK (reason IN ('spam', 'malware', 'broken', 'inappropriate', 'copyright', 'other')),
  detail          TEXT,
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  -- Prevent a single user spamming reports against one listing
  UNIQUE(listing_id, reporter_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_mkt_reports_status_created
  ON marketplace_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mkt_reports_listing
  ON marketplace_reports (listing_id);

-- ─── 4. Take-down trail ───────────────────────────────────────
-- Append-only audit log of admin actions. Useful for compliance and
-- for showing publishers a reason if their listing is unpublished.
CREATE TABLE IF NOT EXISTS marketplace_admin_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  admin_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action          VARCHAR(40) NOT NULL
                    CHECK (action IN ('approve', 'reject', 'unpublish', 'restore', 'verify_publisher', 'unverify_publisher')),
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mkt_admin_actions_listing
  ON marketplace_admin_actions (listing_id, created_at DESC);
