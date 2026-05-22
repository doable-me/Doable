-- 021_live_collaboration.sql
-- PRD 07b: Live Collaboration — Shared AI, Shared Visual Editing, Shared Code

-- ─── User Project Colors ────────────────────────────────────
-- Consistent color assignment per user per project
CREATE TABLE IF NOT EXISTS user_project_colors (
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    color      text NOT NULL,
    PRIMARY KEY (user_id, project_id)
);

-- ─── AI Messages — add collaboration columns ───────────────
-- Track which user sent each AI message, with display info
ALTER TABLE ai_messages
    ADD COLUMN IF NOT EXISTS sent_by_user_id uuid REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS display_name    text,
    ADD COLUMN IF NOT EXISTS user_color      text;

CREATE INDEX IF NOT EXISTS idx_ai_messages_sent_by
    ON ai_messages (sent_by_user_id) WHERE sent_by_user_id IS NOT NULL;

-- ─── AI Message Queue ──────────────────────────────────────
-- Only one AI request runs at a time per project; others are queued
CREATE TABLE IF NOT EXISTS ai_message_queue (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES users(id),
    display_name text,
    user_color   text,
    content      text NOT NULL,
    attachments  jsonb DEFAULT '[]',
    position     integer NOT NULL,
    status       text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued', 'processing', 'completed', 'cancelled')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    started_at   timestamptz,
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_message_queue_project
    ON ai_message_queue (project_id, status, position);

CREATE INDEX IF NOT EXISTS idx_ai_message_queue_user
    ON ai_message_queue (user_id);
