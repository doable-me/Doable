-- 083_ai_sessions_workspace_id.sql
-- Add workspace_id to ai_sessions so chat history can be RLS-scoped on
-- workspace membership and the column is available for analytics/admin
-- traces. Backfill existing rows from the parent project's workspace_id.
--
-- Context: R11 root-cause analysis identified that ai_sessions inserts in
-- services/api/src/routes/chat/session-manager.ts persisted (project_id,
-- user_id, mode, copilot_session_id) but never wrote workspace_id, making
-- it impossible to tighten RLS on this table by workspace without breaking
-- existing rows. This migration is a no-op for behavior (no policy yet
-- uses the new column) but unblocks the chat-side code change.

BEGIN;

ALTER TABLE ai_sessions
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;

-- Backfill: ai_sessions.project_id was loosened to text in migration 008
-- (008_chat_suggestions.sql line 31). Cast to uuid for the JOIN and skip
-- rows whose project_id is not a valid uuid (these can only be legacy /
-- frontend-generated ids that never had a workspace row anyway).
UPDATE ai_sessions s
SET workspace_id = p.workspace_id
FROM projects p
WHERE s.workspace_id IS NULL
  AND s.project_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND p.id = s.project_id::uuid;

CREATE INDEX IF NOT EXISTS idx_ai_sessions_workspace
  ON ai_sessions (workspace_id)
  WHERE workspace_id IS NOT NULL;

COMMIT;
