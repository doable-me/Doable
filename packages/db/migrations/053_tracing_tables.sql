-- 053_tracing_tables.sql
-- Cross-cutting tracing infrastructure: traces, spans, trace_logs.
-- Bridges existing chat_traces via otel_trace_id.
-- Storage: existing Postgres instance. No new infrastructure.

-- ─── traces: one row per trace_id ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS traces (
  trace_id        text PRIMARY KEY,                          -- W3C 32-hex
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  duration_ms     integer,
  workspace_id    uuid,
  user_id         uuid,
  project_id      uuid,
  root_span_name  text,
  status          text NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running','ok','error','timeout')),
  error_count     integer NOT NULL DEFAULT 0,
  span_count      integer NOT NULL DEFAULT 0,
  services        text[] NOT NULL DEFAULT ARRAY[]::text[]
);

CREATE INDEX IF NOT EXISTS idx_traces_started_desc       ON traces (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_traces_user_started       ON traces (user_id, started_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_traces_workspace_started  ON traces (workspace_id, started_at DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_traces_project_started    ON traces (project_id, started_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_traces_errors             ON traces (started_at DESC) WHERE status = 'error';

-- ─── spans: granular timeline ─────────────────────────────────────────
-- Note: not partitioned in v1 for simplicity; switch to PARTITION BY RANGE
-- when pg_relation_size('spans') > 1 GB. Daily DELETE handles retention.
CREATE TABLE IF NOT EXISTS spans (
  span_id         text NOT NULL,
  trace_id        text NOT NULL,
  parent_span_id  text,
  name            text NOT NULL,
  service         text NOT NULL,
  kind            text CHECK (kind IN ('server','client','internal','producer','consumer')),
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  duration_ms     integer,
  status_code     text NOT NULL DEFAULT 'UNSET'
                    CHECK (status_code IN ('UNSET','OK','ERROR')),
  status_message  text,
  attributes      jsonb,
  events          jsonb,
  exception       jsonb,
  PRIMARY KEY (span_id, started_at)
);

CREATE INDEX IF NOT EXISTS idx_spans_trace            ON spans (trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_service_started  ON spans (service, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_spans_name             ON spans (name);
CREATE INDEX IF NOT EXISTS idx_spans_attrs_gin        ON spans USING gin (attributes jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_spans_errors           ON spans (started_at DESC) WHERE status_code = 'ERROR';

-- ─── trace_logs: structured logs correlated by trace_id ───────────────
CREATE TABLE IF NOT EXISTS trace_logs (
  id              bigserial NOT NULL,
  ts              timestamptz NOT NULL,
  trace_id        text,
  span_id         text,
  service         text NOT NULL,
  level           text NOT NULL,
  message         text NOT NULL,
  attributes      jsonb,
  PRIMARY KEY (id, ts)
);

CREATE INDEX IF NOT EXISTS idx_trace_logs_trace      ON trace_logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trace_logs_ts_desc    ON trace_logs (ts DESC);
CREATE INDEX IF NOT EXISTS idx_trace_logs_level_ts   ON trace_logs (level, ts DESC) WHERE level IN ('error','fatal','warn');

-- ─── tracing_overrides: per-user / per-tenant / per-route kill-switch ─
CREATE TABLE IF NOT EXISTS tracing_overrides (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN ('user','workspace','route')),
  scope_value  text NOT NULL,
  level        text NOT NULL CHECK (level IN ('off','errors-only','sampled','full','debug')),
  reason       text NOT NULL,
  granted_by   uuid,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz
);

-- Note: the predicate intentionally omits `expires_at > now()` because
-- `now()` is STABLE (not IMMUTABLE) and Postgres rejects it in partial
-- index predicates. Callers should add `AND expires_at > now()` to the
-- WHERE clause at query time; the index still narrows to non-revoked rows.
CREATE INDEX IF NOT EXISTS idx_tracing_overrides_active
  ON tracing_overrides (scope, scope_value)
  WHERE revoked_at IS NULL;

-- ─── tracing_audit_log: every level change recorded ───────────────────
CREATE TABLE IF NOT EXISTS tracing_audit_log (
  id          bigserial PRIMARY KEY,
  ts          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid,
  actor_email text,
  action      text NOT NULL,
  old_value   jsonb,
  new_value   jsonb,
  reason      text NOT NULL,
  client_ip   inet,
  trace_id    text
);

-- ─── trace_view_audit: who viewed which trace (privacy) ───────────────
CREATE TABLE IF NOT EXISTS trace_view_audit (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  viewer_id    uuid NOT NULL,
  viewer_email text,
  viewer_role  text NOT NULL,
  trace_id     text,
  span_id      text,
  workspace_id uuid,
  reason       text,
  client_ip    inet,
  user_agent   text
);

CREATE INDEX IF NOT EXISTS idx_trace_view_audit_viewer ON trace_view_audit (viewer_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_trace_view_audit_workspace ON trace_view_audit (workspace_id, ts DESC) WHERE workspace_id IS NOT NULL;

-- ─── Bridge: link existing chat_traces to OTel trace_id ───────────────
ALTER TABLE chat_traces
  ADD COLUMN IF NOT EXISTS otel_trace_id text,
  ADD COLUMN IF NOT EXISTS otel_root_span_id text;

CREATE INDEX IF NOT EXISTS idx_chat_traces_otel
  ON chat_traces (otel_trace_id)
  WHERE otel_trace_id IS NOT NULL;
