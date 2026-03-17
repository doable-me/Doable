-- Migration 010: Add suggestion model configuration
-- Allows separate model/provider/account config for AI suggestions vs main chat.

ALTER TABLE workspace_ai_settings
    ADD COLUMN suggestion_copilot_account_id uuid REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
    ADD COLUMN suggestion_provider_id uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
    ADD COLUMN suggestion_model text;
