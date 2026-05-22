-- ─── Admin Audit Log ───────────────────────────────────────────────
-- Records every privileged action performed by a platform admin against
-- enterprise audit surfaces (prompt/conversation viewer, user lookups,
-- exports). Complements `trace_view_audit` (trace UI) and
-- `tracing_audit_log` (sampling-level changes) — those are domain-specific.
--
-- Intentionally append-only. No UPDATE/DELETE policy — operators rotate by
-- partitioning or archiving the table, never by mutating rows.

CREATE TABLE IF NOT EXISTS admin_audit_log (
    id            bigserial PRIMARY KEY,
    ts            timestamptz NOT NULL DEFAULT now(),

    actor_id      uuid NOT NULL,
    actor_email   text,
    actor_role    text,                                    -- 'platform_admin'

    action        text NOT NULL,                           -- 'audit.conversations.search', 'audit.conversation.view', ...
    resource_type text,                                    -- 'session' | 'message' | 'user' | 'workspace' | 'project'
    resource_id   text,                                    -- free-form; usually a UUID

    -- Often-queried denormalized columns for fast filtering
    target_user_id      uuid,
    target_workspace_id uuid,
    target_project_id   uuid,

    -- Optional structured details (filters used, result counts, etc.)
    details       jsonb,

    -- Request context
    client_ip     inet,
    user_agent    text
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_ts          ON admin_audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor_ts    ON admin_audit_log (actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_action_ts   ON admin_audit_log (action, ts DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_user ON admin_audit_log (target_user_id, ts DESC)
  WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_ws   ON admin_audit_log (target_workspace_id, ts DESC)
  WHERE target_workspace_id IS NOT NULL;

-- ─── Search support for prompt audit ───────────────────────────────
-- `ai_messages` already stores the full prompt + completion text, but
-- existing indexes are session-scoped only. The admin conversation
-- audit needs global time-ordered listing and substring search across
-- all tenants.
CREATE INDEX IF NOT EXISTS idx_ai_messages_created_global
  ON ai_messages (created_at DESC);

-- pg_trgm extension is enabled in 001_initial_schema. Add a GIN trigram
-- index for fast ILIKE substring search over message content.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_ai_messages_content_trgm
      ON ai_messages USING gin (content gin_trgm_ops);
  END IF;
END $$;
