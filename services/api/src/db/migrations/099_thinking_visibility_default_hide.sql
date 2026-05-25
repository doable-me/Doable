-- 099_thinking_visibility_default_hide.sql
-- Approved product change: the OOB DEFAULT for AI thinking visibility moves
-- from 'auto' to 'hide' so generated chatbot apps never leak the model's raw
-- <think>…</think> reasoning to end users out of the box.
--
-- Migration 096 created these columns with `DEFAULT 'auto'`. This migration
-- only changes the COLUMN DEFAULT used for FRESH inserts that don't supply a
-- value. It intentionally does NOT update existing rows — explicit stored
-- values (including explicit 'auto') are preserved. The CHECK constraints from
-- 096 are unchanged: all three of 'auto' | 'always-show' | 'hide' remain valid.
--
-- Idempotent: ALTER COLUMN ... SET DEFAULT is safe to re-run.

BEGIN;

ALTER TABLE project_ai_settings
  ALTER COLUMN thinking_visibility SET DEFAULT 'hide';

ALTER TABLE workspace_ai_settings
  ALTER COLUMN default_thinking_visibility SET DEFAULT 'hide';

ALTER TABLE user_ai_preferences
  ALTER COLUMN thinking_visibility SET DEFAULT 'hide';

COMMIT;
