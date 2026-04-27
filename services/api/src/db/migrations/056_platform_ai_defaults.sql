-- Platform-level AI defaults per plan tier.
-- Admin sets which provider/copilot-account new workspaces inherit automatically.

CREATE TABLE IF NOT EXISTS platform_ai_defaults (
    plan            text        NOT NULL PRIMARY KEY,
    source          text        NOT NULL DEFAULT 'copilot'
                                CHECK (source IN ('copilot', 'custom')),
    copilot_account_id uuid     REFERENCES github_copilot_accounts(id) ON DELETE SET NULL,
    copilot_model   text,
    provider_id     uuid        REFERENCES ai_providers(id) ON DELETE SET NULL,
    provider_model  text,
    updated_by      uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed rows for each plan so admin only has to UPDATE, never INSERT.
INSERT INTO platform_ai_defaults (plan) VALUES ('free'), ('pro'), ('business'), ('enterprise')
ON CONFLICT (plan) DO NOTHING;
