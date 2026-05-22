-- 027_chat_persistence.sql
-- Persist version_sha and had_tool_calls on ai_messages so they survive page refresh.
-- Track active AI streams so reconnecting clients can detect in-progress work.

ALTER TABLE ai_messages
    ADD COLUMN IF NOT EXISTS version_sha     text,
    ADD COLUMN IF NOT EXISTS had_tool_calls  boolean NOT NULL DEFAULT false;

-- Track which projects currently have an active AI stream.
-- Rows are inserted when streaming starts and deleted when it ends.
-- Clients poll GET /projects/:id/chat/status to detect in-progress work.
CREATE TABLE IF NOT EXISTS ai_active_streams (
    project_id  text PRIMARY KEY,
    message_id  text NOT NULL,
    started_at  timestamptz NOT NULL DEFAULT now()
);
