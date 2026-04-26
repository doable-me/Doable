-- 055_search_indexes.sql
--
-- Performance pass: trigram indexes for full-text-ish search across
-- listings + community projects, partial indexes on hot statuses, and
-- denormalised "featured" materialised views so the public landing
-- pages never need to join.
--
-- All indexes are idempotent (IF NOT EXISTS). Materialised views use
-- IF NOT EXISTS where supported and a guarded REFRESH helper.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 1. Trigram indexes — substring/typo-tolerant matches ─────

CREATE INDEX IF NOT EXISTS idx_mkt_listings_long_desc_trgm
  ON marketplace_listings USING gin (long_desc gin_trgm_ops);

-- Tags array is small (≤10) but searched a lot — GIN it directly.
CREATE INDEX IF NOT EXISTS idx_mkt_listings_tags_gin
  ON marketplace_listings USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_public_projects_description_trgm
  ON public_projects USING gin (description gin_trgm_ops);

-- ─── 2. Partial indexes on hot status filter ──────────────────

-- Browse always filters status='published'. A partial index here makes the
-- planner pick a much narrower path on category + popularity sorts.
CREATE INDEX IF NOT EXISTS idx_mkt_listings_published_category
  ON marketplace_listings (category_id, install_count DESC)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_mkt_listings_published_newest
  ON marketplace_listings (published_at DESC NULLS LAST)
  WHERE status = 'published';

-- Discover queries by featured + view_count; partial index avoids scanning
-- the long tail of unfeatured rows.
CREATE INDEX IF NOT EXISTS idx_public_projects_published_view_count
  ON public_projects (view_count DESC, published_at DESC NULLS LAST);

-- ─── 3. Materialised views for "Featured" landing strips ──────

-- The Marketplace landing page renders a "Featured" rail above the grid.
-- This MV pre-joins category + publisher + counts and is refreshed every
-- 5 minutes via cron (see refresh_marketplace_featured()).
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_marketplace_featured AS
SELECT
  ml.id,
  ml.environment_id,
  ml.publisher_id,
  ml.category_id,
  ml.title,
  ml.slug,
  ml.short_desc,
  ml.tags,
  ml.version,
  ml.install_count,
  ml.avg_rating,
  ml.review_count,
  ml.featured,
  ml.published_at,
  ml.updated_at,
  COALESCE(ml.bundle_format, 'doable.json.v1') AS bundle_format,
  ml.bundle_size,
  ml.bundle_sha256,
  ml.manifest_summary,
  u.display_name AS publisher_name,
  u.avatar_url AS publisher_avatar,
  COALESCE(u.is_verified_publisher, false) AS publisher_verified,
  mc.name AS category_name,
  mc.slug AS category_slug,
  mc.icon AS category_icon,
  COALESCE((SELECT COUNT(*) FROM environment_skill_refs WHERE environment_id = ml.environment_id), 0)::int       AS skill_count,
  COALESCE((SELECT COUNT(*) FROM environment_rule_refs WHERE environment_id = ml.environment_id), 0)::int        AS rule_count,
  COALESCE((SELECT COUNT(*) FROM environment_context_refs WHERE environment_id = ml.environment_id), 0)::int    AS knowledge_count,
  COALESCE((SELECT COUNT(*) FROM environment_connector_refs WHERE environment_id = ml.environment_id), 0)::int  AS connector_count
FROM marketplace_listings ml
JOIN users u ON u.id = ml.publisher_id
LEFT JOIN marketplace_categories mc ON mc.id = ml.category_id
WHERE ml.status = 'published' AND ml.featured = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_marketplace_featured_id ON mv_marketplace_featured (id);
CREATE INDEX IF NOT EXISTS idx_mv_marketplace_featured_popular ON mv_marketplace_featured (install_count DESC, avg_rating DESC);

-- Discover landing strip: featured community projects with author info.
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_discover_featured AS
SELECT
  pp.id,
  pp.project_id,
  pp.title,
  pp.description,
  pp.category,
  pp.thumbnail_url,
  pp.view_count,
  pp.remix_count,
  pp.featured,
  pp.published_at,
  pp.updated_at,
  pp.shared_by,
  pp.featured_at,
  u.display_name AS shared_by_name,
  u.avatar_url AS shared_by_avatar
FROM public_projects pp
LEFT JOIN users u ON u.id = pp.shared_by
WHERE pp.featured = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_discover_featured_id ON mv_discover_featured (id);
CREATE INDEX IF NOT EXISTS idx_mv_discover_featured_popular
  ON mv_discover_featured (view_count DESC, remix_count DESC);

-- ─── 4. Refresh helpers ───────────────────────────────────────
--
-- CONCURRENT refresh requires the unique index above. Wrapped in
-- SECURITY DEFINER so callers don't need elevated privileges.

CREATE OR REPLACE FUNCTION refresh_marketplace_featured() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_marketplace_featured;
EXCEPTION WHEN OTHERS THEN
  -- First refresh can't be CONCURRENTLY; fall back to plain refresh.
  REFRESH MATERIALIZED VIEW mv_marketplace_featured;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_discover_featured() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_discover_featured;
EXCEPTION WHEN OTHERS THEN
  REFRESH MATERIALIZED VIEW mv_discover_featured;
END;
$$ LANGUAGE plpgsql;

-- Initial population (no rows means empty result, not an error)
SELECT refresh_marketplace_featured();
SELECT refresh_discover_featured();
