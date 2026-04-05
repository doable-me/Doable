-- 036_env_vars.sql
-- Environment variables system: encrypted at rest, scoped (workspace/project),
-- with deployment target support (development/preview/production/all).
-- Inheritance: workspace vars are inherited by all projects; project vars override.

BEGIN;

CREATE TABLE IF NOT EXISTS env_vars (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL CHECK (scope IN ('workspace', 'project')),
  key           TEXT NOT NULL,
  value_encrypted BYTEA NOT NULL,  -- pgp_sym_encrypt'd value
  is_secret     BOOLEAN NOT NULL DEFAULT true,
  target        TEXT NOT NULL DEFAULT 'all' CHECK (target IN ('development', 'preview', 'production', 'all')),
  description   TEXT DEFAULT '',
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique key per scope+target (no duplicate keys within the same scope and project)
CREATE UNIQUE INDEX IF NOT EXISTS idx_env_vars_unique_key
  ON env_vars (workspace_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'), key, target);

-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_env_vars_workspace ON env_vars (workspace_id, scope);
CREATE INDEX IF NOT EXISTS idx_env_vars_project ON env_vars (project_id) WHERE project_id IS NOT NULL;

COMMIT;
