-- 096_project_ai_settings_extras.sql
-- Project- and workspace-scoped "Doable AI" surface extras (PRD chatbot-infra ch08).
--
-- Adds:
--   1) project_ai_settings.thinking_visibility       — 'auto' | 'always-show' | 'hide'
--   2) project_ai_settings.system_prompt_override    — free-form, max 4 KB enforced in app
--   3) project_ai_settings.chat_model_override       — overrides workspace/personal default
--   4) project_ai_settings.embedding_model_override  — destructive: triggers UI re-confirm
--   5) workspace_ai_settings.default_thinking_visibility / default_system_prompt
--   6) user_ai_preferences.thinking_visibility / system_prompt_override
--
-- All ADD COLUMN statements use IF NOT EXISTS so re-running this migration
-- is safe. CHECK constraints are dropped+recreated only when missing.

BEGIN;

-- ─── 1. project_ai_settings extras ─────────────────────────────────────────

ALTER TABLE project_ai_settings
  ADD COLUMN IF NOT EXISTS thinking_visibility       text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS system_prompt_override    text,
  ADD COLUMN IF NOT EXISTS chat_model_override       text,
  ADD COLUMN IF NOT EXISTS embedding_model_override  text;

-- Add CHECK constraint for thinking_visibility values.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_ai_settings_thinking_visibility_chk'
  ) THEN
    ALTER TABLE project_ai_settings
      ADD CONSTRAINT project_ai_settings_thinking_visibility_chk
      CHECK (thinking_visibility IN ('auto', 'always-show', 'hide'));
  END IF;
END $$;

-- ─── 2. workspace_ai_settings extras ───────────────────────────────────────

ALTER TABLE workspace_ai_settings
  ADD COLUMN IF NOT EXISTS default_thinking_visibility text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS default_system_prompt        text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_ai_settings_default_thinking_visibility_chk'
  ) THEN
    ALTER TABLE workspace_ai_settings
      ADD CONSTRAINT workspace_ai_settings_default_thinking_visibility_chk
      CHECK (default_thinking_visibility IN ('auto', 'always-show', 'hide'));
  END IF;
END $$;

-- ─── 3. user_ai_preferences extras (personal overrides) ────────────────────

ALTER TABLE user_ai_preferences
  ADD COLUMN IF NOT EXISTS thinking_visibility    text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS system_prompt_override text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_ai_preferences_thinking_visibility_chk'
  ) THEN
    ALTER TABLE user_ai_preferences
      ADD CONSTRAINT user_ai_preferences_thinking_visibility_chk
      CHECK (thinking_visibility IN ('auto', 'always-show', 'hide'));
  END IF;
END $$;

-- ─── 4. Helpful index for ai-usage-by-mode queries ─────────────────────────

CREATE INDEX IF NOT EXISTS idx_usage_runtime_mode
  ON ai_usage_log(project_id, mode, created_at DESC)
  WHERE is_runtime = true AND project_id IS NOT NULL;

COMMIT;
