-- 071_audit_sandbox_spawn.sql
-- Per SandboxAgnosticSandboxingPRD/10-config-management.md
-- One row per jailedSpawn call. Retention enforced via cron (DOABLE_SANDBOX_AUDIT_RETENTION_DAYS).

CREATE TABLE audit_sandbox_spawn (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id       uuid,
  user_id          uuid,
  session_id       text,
  profile_key      text NOT NULL,
  backend_id       text NOT NULL,
  declared_layers  jsonb NOT NULL,
  composers        text[] NOT NULL,
  command          text NOT NULL,
  argv             jsonb NOT NULL,
  exit_code        integer,
  signal           text,
  duration_ms      integer,
  oom_killed       boolean NOT NULL DEFAULT false,
  timed_out        boolean NOT NULL DEFAULT false,
  network_denied   text[],
  started_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_asp_workspace_started ON audit_sandbox_spawn(workspace_id, started_at DESC);
CREATE INDEX idx_asp_profile_started ON audit_sandbox_spawn(profile_key, started_at DESC);

-- 90-day retention is enforced by a cron job; no auto-cleanup trigger here.
COMMENT ON TABLE audit_sandbox_spawn IS 'One row per jailedSpawn call. PRD ch 10. Retention via DOABLE_SANDBOX_AUDIT_RETENTION_DAYS.';
