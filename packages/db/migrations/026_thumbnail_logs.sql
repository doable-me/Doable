-- 026: Thumbnail generation logs
-- Tracks every thumbnail capture attempt for debugging and admin visibility.

CREATE TABLE IF NOT EXISTS thumbnail_logs (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_name    text,
    status          text        NOT NULL DEFAULT 'pending',  -- 'pending', 'success', 'failed', 'skipped'
    preview_url     text,
    error_message   text,
    duration_ms     int,
    triggered_by    text        NOT NULL DEFAULT 'auto',     -- 'auto' (after AI chat), 'admin', 'regenerate'
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thumbnail_logs_project ON thumbnail_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_thumbnail_logs_created ON thumbnail_logs(created_at DESC);
