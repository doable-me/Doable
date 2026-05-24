-- 095_chatbot_infra.sql
-- PRD ChatBotInfra (chapters 04, 05, 07): runtime AI data-plane schema.
--
-- This migration combines the four chapter-7 migrations into a single
-- numbered file. It is purely additive — no existing column is renamed or
-- dropped — so every previously-valid row remains valid (the new columns
-- default to safe values).
--
-- 1) ai_providers.role            — 'chat' | 'embedding' | 'both'
-- 2) ai_provider_models.is_embedding_model
-- 3) workspace_ai_settings.default_embedding_provider_id (+ model)
-- 4) project_ai_settings           — per-project enabled, budget, allowlist
-- 5) ai_usage_log.is_runtime / app_user_id / owner_workspace_id / owner_user_id
-- 6) runtime_credit_usage_30d view — fast per-owner credit roll-up
--
-- All statements are idempotent (IF NOT EXISTS / DROP IF EXISTS) so
-- re-running the migration is safe.

BEGIN;

-- ─── 1. Embedding-provider role on ai_providers ────────────────────────────

ALTER TABLE ai_providers
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'chat'
    CHECK (role IN ('chat', 'embedding', 'both'));

CREATE INDEX IF NOT EXISTS idx_aip_role
  ON ai_providers(workspace_id, role);

-- ─── 2. Embedding-model flag on ai_provider_models ─────────────────────────

ALTER TABLE ai_provider_models
  ADD COLUMN IF NOT EXISTS is_embedding_model boolean NOT NULL DEFAULT false;

-- ─── 3. Workspace-level default embedding provider ─────────────────────────

ALTER TABLE workspace_ai_settings
  ADD COLUMN IF NOT EXISTS default_embedding_provider_id uuid
    REFERENCES ai_providers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_embedding_model text;

-- Guard: the workspace default embedding provider must be workspace-scoped
-- and have role IN ('embedding', 'both'). Mirrors the personal-scope guard
-- shipped in 072_ai_personal_scope.sql.
CREATE OR REPLACE FUNCTION enforce_workspace_embedding_scope()
RETURNS trigger AS $$
DECLARE
  prov_scope text;
  prov_role  text;
BEGIN
  IF NEW.default_embedding_provider_id IS NOT NULL THEN
    SELECT scope::text, role
      INTO prov_scope, prov_role
      FROM ai_providers
     WHERE id = NEW.default_embedding_provider_id;
    IF prov_scope = 'user' THEN
      RAISE EXCEPTION
        'workspace_ai_settings.default_embedding_provider_id must reference a workspace-scoped provider';
    END IF;
    IF prov_role NOT IN ('embedding', 'both') THEN
      RAISE EXCEPTION
        'workspace_ai_settings.default_embedding_provider_id must reference a provider with role=embedding or role=both';
    END IF;
  END IF;
  RETURN NEW;
END$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_was_embedding_scope ON workspace_ai_settings;
CREATE TRIGGER trg_was_embedding_scope
  BEFORE INSERT OR UPDATE ON workspace_ai_settings
  FOR EACH ROW EXECUTE FUNCTION enforce_workspace_embedding_scope();

-- ─── 4. project_ai_settings — one row per project ──────────────────────────

CREATE TABLE IF NOT EXISTS project_ai_settings (
  project_id              uuid PRIMARY KEY
                            REFERENCES projects(id) ON DELETE CASCADE,
  workspace_id            uuid NOT NULL
                            REFERENCES workspaces(id) ON DELETE CASCADE,

  -- master switch (mirrors projects.app_db_enabled from 093)
  enabled                 boolean NOT NULL DEFAULT true,

  -- model selection
  default_model           text,
  model_allowlist         jsonb,    -- null = all, [] = none, [...] = subset

  -- token budget (rolling window). null = no cap.
  budget_tokens           bigint,
  budget_window_sec       integer,
  per_user_budget_tokens  bigint,

  -- per-call token caps
  max_input_tokens        integer,
  max_output_tokens       integer,
  max_turns_per_session   integer,

  -- optional pinned system prompt (server-injected, never echoed)
  system_prompt           text,

  -- embedding config (Phase 2 RAG)
  embedding_model         text,
  embedding_provider_id   uuid REFERENCES ai_providers(id) ON DELETE SET NULL,

  -- per-agent/bot tool grants (ch09)
  agent_configs           jsonb,

  -- audit
  updated_by              uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pas_workspace
  ON project_ai_settings(workspace_id);

DROP TRIGGER IF EXISTS trg_pas_updated ON project_ai_settings;
CREATE TRIGGER trg_pas_updated
  BEFORE UPDATE ON project_ai_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: same shape as ai_providers (072) — workspace members read, admins write.
ALTER TABLE project_ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_ai_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pas_visibility ON project_ai_settings;
CREATE POLICY pas_visibility ON project_ai_settings
  USING (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_ai_settings.workspace_id
        AND wm.user_id = doable_current_user_id()
    )
  )
  WITH CHECK (
    doable_current_user_id() IS NULL
    OR EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = project_ai_settings.workspace_id
        AND wm.user_id = doable_current_user_id()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ─── 5. Runtime-AI columns on ai_usage_log ─────────────────────────────────

ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS is_runtime         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS embed_dims         integer,
  ADD COLUMN IF NOT EXISTS app_user_id        text,
  ADD COLUMN IF NOT EXISTS owner_user_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usage_runtime_project
  ON ai_usage_log(project_id, created_at DESC)
  WHERE is_runtime = true AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_owner
  ON ai_usage_log(owner_workspace_id, owner_user_id, created_at DESC)
  WHERE is_runtime = true;

CREATE INDEX IF NOT EXISTS idx_usage_app_user
  ON ai_usage_log(project_id, app_user_id, created_at DESC)
  WHERE is_runtime = true AND app_user_id IS NOT NULL;

-- ─── 6. Rolling credit-consumption roll-up (read-only view) ────────────────

CREATE OR REPLACE VIEW runtime_credit_usage_30d AS
  SELECT
    owner_workspace_id                                AS workspace_id,
    owner_user_id                                     AS user_id,
    COALESCE(SUM(credits_consumed), 0)::bigint        AS credits_used_30d,
    COALESCE(SUM(total_tokens),     0)::bigint        AS tokens_used_30d,
    COALESCE(SUM(estimated_cost_usd), 0)::numeric(14,6) AS cost_usd_30d,
    COUNT(*)::int                                     AS request_count_30d
  FROM ai_usage_log
  WHERE is_runtime          = true
    AND owner_workspace_id IS NOT NULL
    AND created_at         >= now() - interval '30 days'
  GROUP BY owner_workspace_id, owner_user_id;

COMMIT;
