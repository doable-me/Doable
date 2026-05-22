-- Admin-configurable plan limits per tier.
-- Overrides the hardcoded PLAN_LIMITS constants when set.

CREATE TABLE IF NOT EXISTS platform_plan_limits (
    plan              text        NOT NULL PRIMARY KEY,
    max_projects      integer,
    max_members       integer,
    daily_credits     integer,
    monthly_credits   integer,
    max_file_size     bigint,         -- bytes
    custom_domains    boolean,
    analytics         boolean,
    priority_support  boolean,
    updated_by        uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Seed rows for each plan so admin only has to UPDATE, never INSERT.
INSERT INTO platform_plan_limits (plan) VALUES ('free'), ('pro'), ('business'), ('enterprise')
ON CONFLICT (plan) DO NOTHING;
