-- 097_abuse_analytics.sql
-- PRD ChatBotInfra ch08 Phase 3 — abuse analytics.
--
-- Adds is_flagged_abuse to ai_usage_log so the runtime proxy can mark
-- requests whose token cost is significantly above the project's rolling
-- mean. Flagged rows surface in the admin abuse-flags endpoint for Vigil.
--
-- Purely additive — no existing columns are renamed or dropped.

BEGIN;

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS is_flagged_abuse boolean NOT NULL DEFAULT false;

-- Index for fast admin queries: all flagged rows across the platform,
-- ordered newest-first.
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_flagged
  ON ai_usage_log (is_flagged_abuse, created_at DESC)
  WHERE is_flagged_abuse = true;

COMMIT;
