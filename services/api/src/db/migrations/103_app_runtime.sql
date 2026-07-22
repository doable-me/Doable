-- App runtime platform tables (FULLSTACK_RUNTIME §8)
-- Idempotent; safe on re-run.

CREATE TABLE IF NOT EXISTS app_runtime_schedules (
  id            text NOT NULL,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id   text NOT NULL,
  cron          text NOT NULL,
  timezone      text NOT NULL DEFAULT 'UTC',
  enabled       boolean NOT NULL DEFAULT true,
  next_run_at   timestamptz,
  lease_owner   text,
  lease_until   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS app_runtime_webhooks (
  id            text NOT NULL,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          text NOT NULL,
  workflow_id   text NOT NULL,
  secret_ref    text,
  enabled       boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS app_runtime_cdc_bindings (
  id            text NOT NULL,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  table_name    text NOT NULL,
  ops           text[] NOT NULL DEFAULT ARRAY['insert','update','delete'],
  topic         text,
  workflow_id   text,
  enabled       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (project_id, id)
);

CREATE TABLE IF NOT EXISTS app_runtime_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_id       text NOT NULL,
  trigger_type      text NOT NULL,
  trigger_payload   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status            text NOT NULL DEFAULT 'queued',
  error             text,
  started_at        timestamptz,
  finished_at       timestamptz,
  attempt           integer NOT NULL DEFAULT 1,
  call_depth        integer NOT NULL DEFAULT 0,
  parent_run_id     uuid,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_runtime_runs_project_status_idx
  ON app_runtime_runs (project_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS app_runtime_run_logs (
  id        bigserial PRIMARY KEY,
  run_id    uuid NOT NULL REFERENCES app_runtime_runs(id) ON DELETE CASCADE,
  ts        timestamptz NOT NULL DEFAULT now(),
  level     text NOT NULL DEFAULT 'info',
  message   text NOT NULL,
  data      jsonb
);

CREATE INDEX IF NOT EXISTS app_runtime_run_logs_run_idx
  ON app_runtime_run_logs (run_id, ts);

CREATE TABLE IF NOT EXISTS app_runtime_secrets_refs (
  project_id            uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name                  text NOT NULL,
  vault_connection_id   uuid,
  env_var_id            uuid,
  PRIMARY KEY (project_id, name)
);
