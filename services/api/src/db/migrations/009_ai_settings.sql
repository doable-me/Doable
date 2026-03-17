-- Migration 009: AI Settings
-- Adds tables for GitHub Copilot accounts, custom AI providers, and workspace-level AI defaults.

-- ─── pgcrypto (needed for pgp_sym_encrypt/decrypt) ──────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Enum ────────────────────────────────────────────────────
CREATE TYPE ai_provider_type AS ENUM ('openai', 'azure', 'anthropic');

-- ─── GitHub Copilot Accounts ─────────────────────────────────
-- Stores GitHub OAuth tokens for Copilot subscription auth,
-- independent of the gh CLI account.
CREATE TABLE github_copilot_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    label           text NOT NULL,
    github_login    text NOT NULL,
    github_id       text,
    encrypted_token text NOT NULL,
    is_valid        boolean NOT NULL DEFAULT true,
    added_by        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, github_login)
);

-- ─── Custom AI Providers (BYOK) ─────────────────────────────
-- Stores API keys for OpenAI, Anthropic, Azure, etc.
CREATE TABLE ai_providers (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id           uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    label                  text NOT NULL,
    provider_type          ai_provider_type NOT NULL,
    base_url               text NOT NULL,
    encrypted_api_key      text,
    encrypted_bearer_token text,
    azure_api_version      text,
    is_valid               boolean NOT NULL DEFAULT true,
    added_by               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ─── Workspace AI Settings ──────────────────────────────────
-- One row per workspace: default model, provider, and Copilot account.
CREATE TABLE workspace_ai_settings (
    workspace_id                uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    default_copilot_account_id  uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
    default_provider_id         uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
    default_model               text,
    updated_by                  uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX idx_gca_workspace ON github_copilot_accounts(workspace_id);
CREATE INDEX idx_aip_workspace ON ai_providers(workspace_id);

-- ─── Updated-at Triggers ────────────────────────────────────
CREATE TRIGGER trg_gca_updated
    BEFORE UPDATE ON github_copilot_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_aip_updated
    BEFORE UPDATE ON ai_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_was_updated
    BEFORE UPDATE ON workspace_ai_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
