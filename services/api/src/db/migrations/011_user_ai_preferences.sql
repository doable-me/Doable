-- Migration 011: User AI preferences + admin enforcement
-- Adds per-user AI preferences and admin enforcement columns to workspace settings.

-- ─── Enforcement columns on workspace_ai_settings ─────────
ALTER TABLE workspace_ai_settings
    ADD COLUMN IF NOT EXISTS enforce_ai boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS enforced_copilot_account_id uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS enforced_provider_id uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS enforced_model text;

-- ─── Per-user AI preferences ──────────────────────────────
CREATE TABLE IF NOT EXISTS user_ai_preferences (
    workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    copilot_account_id  uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
    provider_id         uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
    model               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_uap_user ON user_ai_preferences(user_id);

DROP TRIGGER IF EXISTS trg_uap_updated ON user_ai_preferences;
CREATE TRIGGER trg_uap_updated
    BEFORE UPDATE ON user_ai_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
