-- Migration 041: Share link visit tracking
--
-- Tracks unique visitors and visit counts when users access shared projects.
-- This powers the "Shared with me" filter and lets project owners see
-- how many people viewed their shared link.

CREATE TABLE IF NOT EXISTS share_link_visits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    visitor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visit_count     INT NOT NULL DEFAULT 1,
    first_visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_visited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, visitor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_share_link_visits_visitor ON share_link_visits (visitor_user_id);
CREATE INDEX IF NOT EXISTS idx_share_link_visits_project ON share_link_visits (project_id);
CREATE INDEX IF NOT EXISTS idx_share_link_visits_last_visited ON share_link_visits (last_visited_at DESC);
