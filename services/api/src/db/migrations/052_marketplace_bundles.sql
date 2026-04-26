-- 052_marketplace_bundles.sql
-- Phase 2: Marketplace bundle storage + format awareness.
--
-- Adds:
--   • bundle_format on listings (doable.json.v1 | standards.zip.v1)
--   • bundle_size, bundle_sha256, manifest blob columns for fast detail rendering
--   • Permissive trigram index on title/short_desc for marketplace search
--   • Partial published-only index for /marketplace/listings hot-path
--   • Optional: marketplace_bundle_artifacts table for storing zip blobs / signed URLs
--
-- This is purely additive — no data backfill needed; existing listings keep
-- bundle_format = 'doable.json.v1' which the codec layer treats as default.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Listing-level bundle metadata ────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketplace_listings' AND column_name = 'bundle_format'
  ) THEN
    ALTER TABLE marketplace_listings
      ADD COLUMN bundle_format VARCHAR(40) NOT NULL DEFAULT 'doable.json.v1'
        CHECK (bundle_format IN ('doable.json.v1', 'standards.zip.v1'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketplace_listings' AND column_name = 'bundle_size'
  ) THEN
    ALTER TABLE marketplace_listings ADD COLUMN bundle_size INT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketplace_listings' AND column_name = 'bundle_sha256'
  ) THEN
    ALTER TABLE marketplace_listings ADD COLUMN bundle_sha256 VARCHAR(64);
  END IF;

  -- Cached manifest excerpt for fast detail-page rendering. Full bundle lives
  -- in environment_export_cache (added in 033) or marketplace_bundle_artifacts.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketplace_listings' AND column_name = 'manifest_summary'
  ) THEN
    ALTER TABLE marketplace_listings ADD COLUMN manifest_summary JSONB;
  END IF;

  -- Tracks why a listing is awaiting moderation (filled in Phase 3).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'marketplace_listings' AND column_name = 'requires_review_reason'
  ) THEN
    ALTER TABLE marketplace_listings ADD COLUMN requires_review_reason TEXT;
  END IF;
END $$;

-- ── 2. Bundle artifact blobs (zip files) ────────────────────────
-- Separate table so JSON listings don't carry zip bytes around.

CREATE TABLE IF NOT EXISTS marketplace_bundle_artifacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  version         VARCHAR(40) NOT NULL,
  format          VARCHAR(40) NOT NULL CHECK (format IN ('doable.json.v1', 'standards.zip.v1')),
  -- Inline storage. For very large bundles consider lo_* APIs or external blob URLs.
  contents        BYTEA NOT NULL,
  byte_size       INT NOT NULL,
  sha256          VARCHAR(64) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(listing_id, version, format)
);

CREATE INDEX IF NOT EXISTS idx_mkt_bundle_artifacts_listing
  ON marketplace_bundle_artifacts(listing_id);

-- ── 3. Search & sort indexes for the marketplace browse page ────
-- pg_trgm gives us fuzzy substring matching without lighting CPU on fire.

CREATE INDEX IF NOT EXISTS idx_mkt_listings_title_trgm
  ON marketplace_listings USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_mkt_listings_short_desc_trgm
  ON marketplace_listings USING gin (short_desc gin_trgm_ops);

-- Hot-path: published listings ordered by popularity. Partial index keeps it
-- tiny (drafts/rejected don't take up B-tree pages).
CREATE INDEX IF NOT EXISTS idx_mkt_listings_published_popular
  ON marketplace_listings (install_count DESC, avg_rating DESC, published_at DESC)
  WHERE status = 'published';

-- ── 4. Updated-at trigger for the new artifact table ────────────
DO $$ BEGIN
  -- update_updated_at function was created in 033 / earlier migrations.
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_mkt_bundle_artifacts_updated_at'
  ) THEN
    -- Artifacts are immutable per (listing, version, format) so no updated_at
    -- column is needed. Trigger intentionally omitted.
    NULL;
  END IF;
END $$;
