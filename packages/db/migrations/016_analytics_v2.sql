-- ============================================================
-- Analytics V2: Separate page_views table, visitor_id tracking,
-- updated daily stats, and custom events improvements.
-- ============================================================

-- ─── Page Views Table ───────────────────────────────────────
-- Dedicated table for page view tracking (fast inserts, optimized reads)
CREATE TABLE IF NOT EXISTS page_views (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT,
  country TEXT,
  duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_project_created
  ON page_views (project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_project_path
  ON page_views (project_id, path);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor
  ON page_views (visitor_id);
CREATE INDEX IF NOT EXISTS idx_page_views_project_visitor
  ON page_views (project_id, visitor_id);

-- ─── Analytics Events Table (v2) ────────────────────────────
-- Add visitor_id column to existing analytics_events if not present.
-- This migration is additive — it does NOT drop the old table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_events'
      AND column_name = 'visitor_id'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN visitor_id TEXT;
  END IF;
END
$$;

-- Add event_data JSONB column for custom event payloads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_events'
      AND column_name = 'event_data'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN event_data JSONB;
  END IF;
END
$$;

-- Index on visitor_id for analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor
  ON analytics_events (visitor_id);

-- ─── Analytics Daily Stats (v2) ─────────────────────────────
-- Add columns that may be missing from the original migration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_daily_stats'
      AND column_name = 'total_visitors'
  ) THEN
    ALTER TABLE analytics_daily_stats ADD COLUMN total_visitors INTEGER NOT NULL DEFAULT 0;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_daily_stats'
      AND column_name = 'unique_visitors'
  ) THEN
    ALTER TABLE analytics_daily_stats ADD COLUMN unique_visitors INTEGER NOT NULL DEFAULT 0;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_daily_stats'
      AND column_name = 'bounce_count'
  ) THEN
    ALTER TABLE analytics_daily_stats ADD COLUMN bounce_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_daily_stats'
      AND column_name = 'avg_duration_ms'
  ) THEN
    ALTER TABLE analytics_daily_stats ADD COLUMN avg_duration_ms INTEGER NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- Ensure created_at exists on analytics_daily_stats
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_daily_stats'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE analytics_daily_stats ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END
$$;
