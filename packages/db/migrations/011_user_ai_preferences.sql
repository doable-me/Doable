-- Migration 011: Per-user AI preferences with admin enforcement
-- Adds per-user AI model/provider preferences and workspace-level enforcement controls.

-- ─── Per-user AI Preferences ──────────────────────────────────
-- One row per user per workspace: user-chosen model, provider, and Copilot account.
CREATE TABLE IF NOT EXISTS user_ai_preferences (
    workspace_id            uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    copilot_account_id      uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
    provider_id             uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
    model                   text,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

-- ─── Admin Enforcement Columns ────────────────────────────────
-- When enforce_ai is true, all users in the workspace must use the enforced config.
ALTER TABLE workspace_ai_settings
    ADD COLUMN IF NOT EXISTS enforce_ai                  boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS enforced_copilot_account_id uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS enforced_provider_id        uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS enforced_model              text;

-- ─── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_uap_workspace ON user_ai_preferences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_uap_user     ON user_ai_preferences(user_id);

-- ─── Updated-at Trigger ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_uap_updated ON user_ai_preferences;
CREATE TRIGGER trg_uap_updated
    BEFORE UPDATE ON user_ai_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
