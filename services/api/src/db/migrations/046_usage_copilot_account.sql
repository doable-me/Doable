-- Migration 046: Track Copilot Account in Usage Logs
-- Adds copilot_account_id to ai_usage_log so admins can see which GitHub
-- Copilot accounts were used by whom, which models per user, and top users.

BEGIN;

-- ─── Add copilot_account_id to ai_usage_log ─────────────────
ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS copilot_account_id uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL;

-- Index for querying usage by copilot account
CREATE INDEX IF NOT EXISTS idx_usage_copilot_account_time 
  ON ai_usage_log(copilot_account_id, created_at DESC) 
  WHERE copilot_account_id IS NOT NULL;

COMMIT;
