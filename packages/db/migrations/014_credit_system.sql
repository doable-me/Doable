-- 014_credit_system.sql
-- Enhanced credit system: balances per user+workspace, detailed usage logging

-- ─── Credit Balances ─────────────────────────────────────────
-- Tracks credit allocation per user within a workspace.
-- The existing `credits` table is workspace-level; this table adds
-- user-level granularity with daily/monthly reset tracking.
CREATE TABLE IF NOT EXISTS credit_balances (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    daily_credits       int NOT NULL DEFAULT 5,
    daily_credits_used  int NOT NULL DEFAULT 0,
    daily_reset_at      timestamptz NOT NULL DEFAULT (now() + interval '1 day'),
    monthly_credits     int NOT NULL DEFAULT 0,
    monthly_credits_used int NOT NULL DEFAULT 0,
    monthly_reset_at    timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month'),
    rollover_credits    int NOT NULL DEFAULT 0,
    plan_type           text NOT NULL DEFAULT 'free',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_balances_user_workspace
    ON credit_balances (user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_credit_balances_workspace
    ON credit_balances (workspace_id);

CREATE INDEX IF NOT EXISTS idx_credit_balances_daily_reset
    ON credit_balances (daily_reset_at);

-- ─── Credit Usage Log ────────────────────────────────────────
-- Detailed per-request logging of AI credit consumption with
-- token counts and model info for cost tracking.
CREATE TABLE IF NOT EXISTS credit_usage_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id          uuid REFERENCES projects(id) ON DELETE SET NULL,
    credits_consumed    int NOT NULL DEFAULT 1,
    action_type         text NOT NULL,  -- 'ai_chat', 'ai_agent', 'ai_fix', 'ai_suggestions'
    prompt_tokens       int,
    completion_tokens   int,
    model               text,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_log_user_workspace
    ON credit_usage_log (user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_credit_usage_log_workspace_created
    ON credit_usage_log (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_usage_log_user_created
    ON credit_usage_log (user_id, created_at DESC);

-- ─── Updated-at Trigger ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_credit_balances_updated_at ON credit_balances;
CREATE TRIGGER trg_credit_balances_updated_at
    BEFORE UPDATE ON credit_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
