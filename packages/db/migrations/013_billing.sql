-- 013: Billing — Stripe subscriptions, credit transactions, and Stripe customer tracking
-- Creates the tables required for real Stripe billing integration.

-- ─── Subscriptions table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    stripe_customer_id      text        NOT NULL,
    stripe_subscription_id  text,
    plan                    text        NOT NULL DEFAULT 'free',
    status                  text        NOT NULL DEFAULT 'active',
    current_period_start    timestamptz,
    current_period_end      timestamptz,
    cancel_at               timestamptz,
    canceled_at             timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
    ON subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
    ON subscriptions (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

-- ─── Credit transactions table ──────────────────────────────
-- Complements the existing credit_usage table with a ledger of
-- all credit changes (purchases, resets, top-ups, refunds).
CREATE TABLE IF NOT EXISTS credit_transactions (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        REFERENCES users(id) ON DELETE SET NULL,
    workspace_id    uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    amount          integer     NOT NULL,            -- positive = credit added, negative = credit consumed
    type            text        NOT NULL,            -- 'purchase', 'subscription_reset', 'top_up', 'refund', 'daily_reset', 'monthly_reset', 'usage'
    description     text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_workspace
    ON credit_transactions (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user
    ON credit_transactions (user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

-- ─── Add stripe_customer_id to users ────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_stripe_customer
    ON users (stripe_customer_id)
    WHERE stripe_customer_id IS NOT NULL;

-- ─── Auto-update updated_at on subscriptions ────────────────
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriptions_updated_at();
