-- Migration 039: Usage, Token & Cost Tracking (PRD 20)
-- Creates model pricing, per-request usage log, and daily/monthly aggregates
-- for the usage dashboard.

BEGIN;

-- ─── Model pricing table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS model_pricing (
  model_id                   text PRIMARY KEY,
  provider                   text NOT NULL,
  display_name               text,
  input_cost_per_1m          numeric(12,6) NOT NULL DEFAULT 0,
  output_cost_per_1m         numeric(12,6) NOT NULL DEFAULT 0,
  thinking_cost_per_1m       numeric(12,6),
  cache_creation_cost_per_1m numeric(12,6),
  cache_read_cost_per_1m     numeric(12,6),
  is_active                  boolean NOT NULL DEFAULT true,
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- ─── Seed initial pricing data ──────────────────────────────
INSERT INTO model_pricing (model_id, provider, display_name, input_cost_per_1m, output_cost_per_1m, thinking_cost_per_1m, cache_creation_cost_per_1m, cache_read_cost_per_1m) VALUES
  ('claude-opus-4-6',           'anthropic', 'Claude Opus 4.6',     5.00,  25.00, NULL, 6.25, 0.50),
  ('claude-sonnet-4-6',         'anthropic', 'Claude Sonnet 4.6',   3.00,  15.00, NULL, 3.75, 0.30),
  ('claude-haiku-4-5',          'anthropic', 'Claude Haiku 4.5',    1.00,   5.00, NULL, 1.25, 0.10),
  ('gpt-4.1',                   'openai',    'GPT-4.1',             2.00,   8.00, NULL, NULL, NULL),
  ('gpt-4.1-mini',              'openai',    'GPT-4.1 Mini',        0.40,   1.60, NULL, NULL, NULL),
  ('gpt-4o',                    'openai',    'GPT-4o',              2.50,  10.00, NULL, NULL, 1.25),
  ('o3',                        'openai',    'o3',                   2.00,   8.00, NULL, NULL, NULL),
  ('o4-mini',                   'openai',    'o4-mini',              1.10,   4.40, NULL, NULL, NULL),
  ('gemini-2.5-pro',            'google',    'Gemini 2.5 Pro',      1.25,  10.00, NULL, NULL, NULL),
  ('gemini-2.5-flash',          'google',    'Gemini 2.5 Flash',    0.15,   0.60, NULL, NULL, NULL),
  ('deepseek-chat',             'deepseek',  'DeepSeek V3',         0.28,   0.42, NULL, NULL, 0.028),
  ('deepseek-reasoner',         'deepseek',  'DeepSeek Reasoner',   0.55,   2.19, NULL, NULL, NULL),
  ('llama-3.3-70b-versatile',   'groq',      'Llama 3.3 70B',      0.59,   0.79, NULL, NULL, NULL),
  ('mistral-large-latest',      'mistral',   'Mistral Large',       2.00,   6.00, NULL, NULL, NULL),
  ('grok-4',                    'xai',       'Grok 4',              3.00,  15.00, NULL, NULL, NULL),
  ('command-r-plus',            'cohere',    'Command R+',           2.50,  10.00, NULL, NULL, NULL)
ON CONFLICT (model_id) DO NOTHING;

-- ─── Per-request usage log ──────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id          uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id            uuid REFERENCES projects(id) ON DELETE SET NULL,
  session_id            text,
  provider              text NOT NULL,
  provider_label        text,
  model                 text,
  mode                  text,
  prompt_tokens         integer,
  completion_tokens     integer,
  thinking_tokens       integer,
  cached_tokens         integer,
  total_tokens          integer,
  tool_call_count       integer DEFAULT 0,
  cache_creation_tokens integer,
  cache_read_tokens     integer,
  estimated_cost_usd    numeric(12,6),
  credits_consumed      integer DEFAULT 0,
  duration_ms           integer,
  ttft_ms               integer,
  tokens_available      boolean DEFAULT true,
  byok_provider_id      uuid REFERENCES ai_providers(id) ON DELETE SET NULL,
  is_local              boolean DEFAULT false,
  error                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Performance indexes for concurrent multi-user access
CREATE INDEX IF NOT EXISTS idx_usage_user_time      ON ai_usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_workspace_time ON ai_usage_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_project_time   ON ai_usage_log(project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_provider_time  ON ai_usage_log(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_byok_time      ON ai_usage_log(byok_provider_id, created_at DESC) WHERE byok_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_session        ON ai_usage_log(session_id, created_at DESC) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usage_created        ON ai_usage_log(created_at);

-- ─── Daily aggregates ───────────────────────────────────────
-- Uses a functional unique index with COALESCE on project_id so that NULL
-- project_id values are treated as equal (PostgreSQL treats NULLs as distinct
-- in plain UNIQUE constraints, which would cause unbounded row growth).
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date                      date NOT NULL,
  user_id                   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id              uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id                uuid REFERENCES projects(id) ON DELETE SET NULL,
  provider                  text NOT NULL,
  model                     text NOT NULL,
  request_count             integer NOT NULL DEFAULT 0,
  total_prompt_tokens       bigint NOT NULL DEFAULT 0,
  total_completion_tokens   bigint NOT NULL DEFAULT 0,
  total_thinking_tokens     bigint NOT NULL DEFAULT 0,
  total_tokens              bigint NOT NULL DEFAULT 0,
  total_cost_usd            numeric(12,6) NOT NULL DEFAULT 0,
  total_credits             integer NOT NULL DEFAULT 0,
  total_duration_ms         bigint NOT NULL DEFAULT 0,
  avg_tokens_per_request    integer NOT NULL DEFAULT 0,
  tool_call_count           integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_unique
  ON ai_usage_daily(date, user_id, workspace_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, model);

CREATE INDEX IF NOT EXISTS idx_daily_workspace ON ai_usage_daily(workspace_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_user      ON ai_usage_daily(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_date      ON ai_usage_daily(date);

-- ─── Monthly aggregates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_monthly (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month                     date NOT NULL,
  user_id                   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id              uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id                uuid REFERENCES projects(id) ON DELETE SET NULL,
  provider                  text NOT NULL,
  model                     text NOT NULL,
  request_count             integer NOT NULL DEFAULT 0,
  total_prompt_tokens       bigint NOT NULL DEFAULT 0,
  total_completion_tokens   bigint NOT NULL DEFAULT 0,
  total_thinking_tokens     bigint NOT NULL DEFAULT 0,
  total_tokens              bigint NOT NULL DEFAULT 0,
  total_cost_usd            numeric(12,6) NOT NULL DEFAULT 0,
  total_credits             integer NOT NULL DEFAULT 0,
  total_duration_ms         bigint NOT NULL DEFAULT 0,
  avg_tokens_per_request    integer NOT NULL DEFAULT 0,
  tool_call_count           integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_unique
  ON ai_usage_monthly(month, user_id, workspace_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, model);

CREATE INDEX IF NOT EXISTS idx_monthly_workspace ON ai_usage_monthly(workspace_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_monthly_user      ON ai_usage_monthly(user_id, month DESC);

COMMIT;
