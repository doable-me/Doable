-- Migration 042: Active AI source + per-source model columns
--
-- Previously the "is Copilot or Custom Provider active?" decision was inferred
-- from "which of provider_id / copilot_account_id is non-null." That meant
-- saving a different tab destroyed the other tab's selection — you couldn't
-- have both a Copilot account AND a custom provider configured at the same
-- time, switching tabs lost your model, etc.
--
-- This migration:
--   1. Adds an explicit `*_source` column to track which side is currently
--      active for workspace defaults, suggestions, and per-user overrides.
--      Both copilot_account_id and provider_id can now be set simultaneously;
--      the resolver picks one based on `*_source`.
--   2. Adds per-source model columns so each tab remembers its own model
--      selection independently.
--   3. Adds suggestion override fields to user_ai_preferences so the user-
--      override UI can persist a separate suggestion model (previously a
--      no-op).
--   4. Backfills the new columns from the existing data (inferring source the
--      same way the old code did, then copying the legacy `model` field into
--      whichever side is active).
--
-- The legacy `default_model`, `suggestion_model`, and `user_ai_preferences.model`
-- columns are kept around for now so any consumer not yet updated keeps
-- working. A later cleanup migration can drop them once nothing reads them.

-- ─── workspace_ai_settings ──────────────────────────────────
ALTER TABLE workspace_ai_settings
  ADD COLUMN IF NOT EXISTS default_source              text NOT NULL DEFAULT 'copilot'
    CHECK (default_source IN ('copilot','custom')),
  ADD COLUMN IF NOT EXISTS suggestion_source           text NOT NULL DEFAULT 'copilot'
    CHECK (suggestion_source IN ('copilot','custom')),
  ADD COLUMN IF NOT EXISTS default_copilot_model       text,
  ADD COLUMN IF NOT EXISTS default_provider_model      text,
  ADD COLUMN IF NOT EXISTS suggestion_copilot_model    text,
  ADD COLUMN IF NOT EXISTS suggestion_provider_model   text;

-- Backfill default_source + per-source model from legacy columns.
-- Existing rows: source = 'custom' iff provider_id is set, else 'copilot'.
-- The legacy `default_model` text gets copied into whichever per-source slot
-- matches the inferred source.
UPDATE workspace_ai_settings SET
  default_source            = CASE WHEN default_provider_id IS NOT NULL THEN 'custom' ELSE 'copilot' END,
  default_copilot_model     = CASE WHEN default_provider_id IS NULL     THEN default_model END,
  default_provider_model    = CASE WHEN default_provider_id IS NOT NULL THEN default_model END,
  suggestion_source         = CASE WHEN suggestion_provider_id IS NOT NULL THEN 'custom' ELSE 'copilot' END,
  suggestion_copilot_model  = CASE WHEN suggestion_provider_id IS NULL     THEN suggestion_model END,
  suggestion_provider_model = CASE WHEN suggestion_provider_id IS NOT NULL THEN suggestion_model END
WHERE default_copilot_model IS NULL
  AND default_provider_model IS NULL
  AND suggestion_copilot_model IS NULL
  AND suggestion_provider_model IS NULL;

-- ─── user_ai_preferences ────────────────────────────────────
-- Adds a per-user `source` flag, per-source models, and suggestion-override
-- fields (so the user override UI for suggestions actually persists).
ALTER TABLE user_ai_preferences
  ADD COLUMN IF NOT EXISTS source                      text NOT NULL DEFAULT 'copilot'
    CHECK (source IN ('copilot','custom')),
  ADD COLUMN IF NOT EXISTS copilot_model               text,
  ADD COLUMN IF NOT EXISTS provider_model              text,
  ADD COLUMN IF NOT EXISTS suggestion_source           text NOT NULL DEFAULT 'copilot'
    CHECK (suggestion_source IN ('copilot','custom')),
  ADD COLUMN IF NOT EXISTS suggestion_copilot_account_id  uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggestion_provider_id         uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggestion_copilot_model       text,
  ADD COLUMN IF NOT EXISTS suggestion_provider_model      text;

UPDATE user_ai_preferences SET
  source         = CASE WHEN provider_id IS NOT NULL THEN 'custom' ELSE 'copilot' END,
  copilot_model  = CASE WHEN provider_id IS NULL     THEN model END,
  provider_model = CASE WHEN provider_id IS NOT NULL THEN model END
WHERE copilot_model IS NULL
  AND provider_model IS NULL;
