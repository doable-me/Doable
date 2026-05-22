-- 082_workspace_sandbox_rules_enabled.sql
-- Add the missing `enabled` boolean column to workspace_sandbox_rules.
--
-- Two divergent 073 migrations exist in the repo (services/api and
-- packages/db). The packages/db version includes an `enabled` column +
-- partial index; the services/api version does NOT. Servers that ran the
-- services/api flow are missing the column, but
-- services/api/src/sandbox/workspace-rules.ts queries
-- `WHERE enabled = true` regardless. That query raises
--   ERROR: column "enabled" does not exist
-- which the orchestrator surfaces as "bash: sandbox spawn failed" and
-- aborts every AI bash tool invocation under hardening.
--
-- This migration adds the column idempotently with default `true`, plus
-- the matching partial index used by workspace-rules.ts.

ALTER TABLE workspace_sandbox_rules
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_wsr_workspace_enabled
  ON workspace_sandbox_rules(workspace_id)
  WHERE enabled = true;
