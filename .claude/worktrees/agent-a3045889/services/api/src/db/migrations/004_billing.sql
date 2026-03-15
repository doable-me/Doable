-- 004_billing.sql
-- Billing: subscriptions and credit usage tracking

-- ─── Subscription Status ───────────────────────────────────
CREATE TYPE subscription_status AS ENUM (
  'active', 'canceled', 'past_due', 'trialing', 'paused', 'incomplete'
);

-- ─── Subscriptions ─────────────────────────────────────────
CREATE TABLE subscriptions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    stripe_customer_id  text NOT NULL,
    stripe_subscription_id text UNIQUE,
    plan                workspace_plan NOT NULL DEFAULT 'free',
    status              subscription_status NOT NULL DEFAULT 'active',
    current_period_start timestamptz,
    current_period_end  timestamptz,
    cancel_at           timestamptz,
    canceled_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscriptions_workspace ON subscriptions (workspace_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions (status);

-- ─── Credit Usage ──────────────────────────────────────────
CREATE TABLE credit_usage (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      uuid REFERENCES projects(id) ON DELETE SET NULL,
    credits_used    int NOT NULL DEFAULT 1,
    action          text NOT NULL,  -- 'ai_chat', 'ai_agent', 'deployment', 'top_up'
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_usage_workspace ON credit_usage (workspace_id);
CREATE INDEX idx_credit_usage_user ON credit_usage (user_id);
CREATE INDEX idx_credit_usage_created ON credit_usage (workspace_id, created_at DESC);

-- ─── Updated-at Trigger ────────────────────────────────────
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
