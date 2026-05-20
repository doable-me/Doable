-- 090_workspace_sandbox_settings_default_actions.sql
-- Add the missing `tool_default_action` / `network_default_action` /
-- `updated_by` columns to workspace_sandbox_settings.
--
-- Root cause (same shape as 082):
--   packages/db/migrations/072_workspace_sandbox_extensions.sql created
--   workspace_sandbox_settings FIRST with only:
--     (workspace_id, created_at, updated_at, sandbox_backend, allowed_profile_keys)
--   Then services/api/src/db/migrations/073_workspace_sandbox_rules.sql ran
--   `CREATE TABLE IF NOT EXISTS workspace_sandbox_settings (...)` with the
--   wider column set (tool_default_action, network_default_action, updated_by)
--   — but because the table already existed, IF NOT EXISTS silently no-ops
--   and those columns are NEVER added.
--
-- services/api/src/sandbox/workspace-rules.ts then does:
--   SELECT sandbox_backend, allowed_profile_keys,
--          tool_default_action, network_default_action
--     FROM workspace_sandbox_settings
-- which raises:
--   ERROR: column "tool_default_action" does not exist
-- The error escapes loadWorkspaceSandboxState (the catch only swallows
-- 42P01 undefined_table, not 42703 undefined_column), bubbles up through
-- the sandbox orchestrator, and surfaces in the AI chat as:
--   bash: sandbox spawn failed — column "tool_default_action" does not exist
-- aborting every AI bash tool invocation.
--
-- This migration adds the three missing columns idempotently with the same
-- defaults the original 073 CREATE TABLE specified.

DO $$ BEGIN
  CREATE TYPE sandbox_rule_action AS ENUM ('allow', 'deny');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE workspace_sandbox_settings
  ADD COLUMN IF NOT EXISTS tool_default_action    sandbox_rule_action NOT NULL DEFAULT 'allow',
  ADD COLUMN IF NOT EXISTS network_default_action sandbox_rule_action NOT NULL DEFAULT 'allow',
  ADD COLUMN IF NOT EXISTS updated_by             uuid REFERENCES users(id) ON DELETE SET NULL;
