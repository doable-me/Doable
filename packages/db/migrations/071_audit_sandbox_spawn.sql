-- 071_audit_sandbox_spawn.sql
-- Per SandboxAgnosticSandboxingPRD/10-config-management.md
-- One row per jailedSpawn call. Retention enforced via cron (DOABLE_SANDBOX_AUDIT_RETENTION_DAYS).
--
-- Columns deliberately include BOTH writer-side names (profile_id, args)
-- used by services/api/src/sandbox/audit.ts AND view-side names
-- (profile_key, argv, declared_layers, network_denied, timed_out, signal)
-- referenced by packages/db/migrations/075_vigil_sandbox_views.sql and
-- doable-cli/src/admin/db.rs. profile_key is a generated alias of
-- profile_id so existing Vigil views keep working without a code change.

CREATE TABLE IF NOT EXISTS audit_sandbox_spawn (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id       uuid,
  user_id          uuid,
  session_id       text,
  hardening        text,
  profile_id       text NOT NULL,
  profile_key      text GENERATED ALWAYS AS (profile_id) STORED,
  backend_id       text NOT NULL,
  declared_layers  jsonb NOT NULL DEFAULT '[]'::jsonb,
  composers        text[] NOT NULL DEFAULT ARRAY[]::text[],
  command          text NOT NULL,
  args             jsonb NOT NULL DEFAULT '[]'::jsonb,
  argv             jsonb GENERATED ALWAYS AS (args) STORED,
  exit_code        integer,
  signal           text,
  duration_ms      integer,
  oom_killed       boolean NOT NULL DEFAULT false,
  timed_out        boolean NOT NULL DEFAULT false,
  network_denied   text[] NOT NULL DEFAULT ARRAY[]::text[],
  started_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asp_workspace_started ON audit_sandbox_spawn(workspace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_asp_profile_started  ON audit_sandbox_spawn(profile_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_asp_project_started  ON audit_sandbox_spawn(project_id, started_at DESC);

COMMENT ON TABLE audit_sandbox_spawn IS 'One row per jailedSpawn call. PRD ch 10. Retention via DOABLE_SANDBOX_AUDIT_RETENTION_DAYS.';
COMMENT ON COLUMN audit_sandbox_spawn.profile_key IS 'Generated alias of profile_id for Vigil view compatibility.';
COMMENT ON COLUMN audit_sandbox_spawn.argv IS 'Generated alias of args for Vigil view + admin-CLI compatibility.';
