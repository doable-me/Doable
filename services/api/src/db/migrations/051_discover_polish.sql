-- 051_discover_polish.sql
-- Discover/Community polish: trigram search, ownership tracking, partial indexes.
-- Idempotent - safe to re-run.

-- Ensure pg_trgm is available (also created in setup-server.sh / 022_mcp_connectors.sql).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Schema additions on public_projects ──────────────────────
-- Add ownership + lifecycle metadata so we can track who shared a project,
-- when it was featured, and surface "share state" cheaply on the dashboard.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_projects' AND column_name = 'shared_by'
  ) THEN
    ALTER TABLE public_projects ADD COLUMN shared_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_projects' AND column_name = 'featured_at'
  ) THEN
    ALTER TABLE public_projects ADD COLUMN featured_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_projects' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public_projects ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ─── Trigram search indexes ───────────────────────────────────
-- gin_trgm_ops makes ILIKE '%foo%' searches use an index instead of a seq scan.
CREATE INDEX IF NOT EXISTS idx_public_projects_title_trgm
  ON public_projects USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_public_projects_description_trgm
  ON public_projects USING gin (description gin_trgm_ops);

-- ─── Sort indexes ─────────────────────────────────────────────
-- Composite index for the popular/trending featured feed.
CREATE INDEX IF NOT EXISTS idx_public_projects_featured_view_count
  ON public_projects (view_count DESC, remix_count DESC)
  WHERE featured = true;

-- Index supporting "list mine" lookups by user.
CREATE INDEX IF NOT EXISTS idx_public_projects_shared_by
  ON public_projects (shared_by)
  WHERE shared_by IS NOT NULL;

-- ─── Backfill featured_at for already-featured rows ───────────
UPDATE public_projects
SET featured_at = published_at
WHERE featured = true AND featured_at IS NULL;
