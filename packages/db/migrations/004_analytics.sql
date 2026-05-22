-- Analytics events (individual page views and interactions)
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'page_view',
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  duration INTEGER DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_project_timestamp ON analytics_events(project_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_project_path ON analytics_events(project_id, path);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(project_id, event_type);

-- Analytics settings per project
CREATE TABLE IF NOT EXISTS analytics_settings (
  project_id UUID PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Materialized daily aggregates for fast dashboard queries
CREATE TABLE IF NOT EXISTS analytics_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  date DATE NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  page_views INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  bounces INTEGER NOT NULL DEFAULT 0,
  total_duration INTEGER NOT NULL DEFAULT 0,
  UNIQUE(project_id, date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_daily_project_date ON analytics_daily_stats(project_id, date);
