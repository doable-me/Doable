-- 037_copilot_session_id.sql
-- Store the Copilot SDK session ID so we can resume sessions after API restart.
-- The SDK persists conversation state to ~/.copilot/session-state/{sessionId},
-- so resumeSession(sessionId) restores full context without re-sending history.

BEGIN;

ALTER TABLE ai_sessions
  ADD COLUMN IF NOT EXISTS copilot_session_id TEXT;

-- Index for quick lookup when resuming
CREATE INDEX IF NOT EXISTS idx_ai_sessions_copilot_sid
  ON ai_sessions (copilot_session_id) WHERE copilot_session_id IS NOT NULL;

COMMIT;
