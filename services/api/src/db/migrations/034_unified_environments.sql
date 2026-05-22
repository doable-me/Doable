-- 034_unified_environments.sql
-- Unifies knowledge/context management so environments are the single source of truth.
--
-- Changes:
--   1. Add scope, project_id, user_id to environments table
--   2. Create environment_knowledge table (replaces scattered context_files tables)
--   3. Migrate existing data:
--      - workspace_context_files → auto-created workspace environments
--      - project_context_files → auto-created project environments
--      - user_context_files → auto-created user environments
--   4. Make environment_context_refs point to environment_knowledge
--
-- Old tables (project_context_files, workspace_context_files, user_context_files)
-- are kept for now as backup but no longer written to by the app.

BEGIN;

-- ─── 1. Extend environments table ─────────────────────────

ALTER TABLE environments
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) DEFAULT 'workspace'
    CHECK (scope IN ('workspace', 'project', 'user')),
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Existing environments are workspace-scoped
UPDATE environments SET scope = 'workspace' WHERE scope IS NULL;

CREATE INDEX IF NOT EXISTS idx_environments_scope ON environments(scope);
CREATE INDEX IF NOT EXISTS idx_environments_project ON environments(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_environments_user ON environments(user_id) WHERE user_id IS NOT NULL;

-- ─── 2. Create environment_knowledge table ─────────────────
-- Direct ownership: knowledge files live inside environments.
-- Replaces the ref-based approach (environment_context_refs → workspace_context_files).

CREATE TABLE IF NOT EXISTS environment_knowledge (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id  UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  filename        VARCHAR(255) NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(environment_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_env_knowledge_env ON environment_knowledge(environment_id);

CREATE TRIGGER trg_env_knowledge_updated_at
  BEFORE UPDATE ON environment_knowledge
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 3. Migrate workspace_context_files ────────────────────
-- For each workspace that has context files, create a workspace-scoped
-- environment (if one doesn't already exist) and copy files in.

-- Create "Workspace Knowledge" environments for workspaces that have context files
INSERT INTO environments (workspace_id, created_by, name, description, icon, color, scope)
SELECT DISTINCT
  wcf.workspace_id,
  (SELECT owner_id FROM workspaces WHERE id = wcf.workspace_id LIMIT 1),
  'Workspace Knowledge',
  'Auto-migrated workspace knowledge files',
  '🌐',
  'blue',
  'workspace'
FROM workspace_context_files wcf
WHERE NOT EXISTS (
  SELECT 1 FROM environments e
  WHERE e.workspace_id = wcf.workspace_id
    AND e.scope = 'workspace'
    AND e.name = 'Workspace Knowledge'
);

-- Copy workspace context files into environment_knowledge
INSERT INTO environment_knowledge (environment_id, filename, content, created_at, updated_at)
SELECT
  e.id,
  wcf.filename,
  wcf.content,
  wcf.created_at,
  wcf.updated_at
FROM workspace_context_files wcf
JOIN environments e ON e.workspace_id = wcf.workspace_id
  AND e.scope = 'workspace'
  AND e.name = 'Workspace Knowledge'
ON CONFLICT (environment_id, filename) DO NOTHING;

-- ─── 4. Migrate project_context_files ──────────────────────
-- For each project that has context files, create a project-scoped environment.

-- First, find the workspace for each project (use workspace owner as created_by)
INSERT INTO environments (workspace_id, created_by, name, description, icon, color, scope, project_id)
SELECT DISTINCT
  p.workspace_id,
  w.owner_id,
  'Project Knowledge',
  'Auto-migrated project knowledge files',
  '📁',
  'green',
  'project',
  pcf.project_id
FROM project_context_files pcf
JOIN projects p ON p.id = pcf.project_id
JOIN workspaces w ON w.id = p.workspace_id
WHERE NOT EXISTS (
  SELECT 1 FROM environments e
  WHERE e.project_id = pcf.project_id
    AND e.scope = 'project'
    AND e.name = 'Project Knowledge'
);

-- Copy project context files into environment_knowledge
INSERT INTO environment_knowledge (environment_id, filename, content, created_at, updated_at)
SELECT
  e.id,
  pcf.filename,
  pcf.content,
  pcf.created_at,
  pcf.updated_at
FROM project_context_files pcf
JOIN environments e ON e.project_id = pcf.project_id
  AND e.scope = 'project'
  AND e.name = 'Project Knowledge'
ON CONFLICT (environment_id, filename) DO NOTHING;

-- Also register these environments in project_environments (migration 033)
INSERT INTO project_environments (project_id, environment_id)
SELECT
  e.project_id,
  e.id
FROM environments e
WHERE e.scope = 'project'
  AND e.name = 'Project Knowledge'
  AND e.project_id IS NOT NULL
ON CONFLICT (project_id) DO NOTHING;

-- ─── 5. Migrate user_context_files ─────────────────────────

INSERT INTO environments (workspace_id, created_by, name, description, icon, color, scope, user_id)
SELECT DISTINCT
  ucf.workspace_id,
  ucf.user_id,
  'My Knowledge',
  'Auto-migrated personal knowledge files',
  '👤',
  'purple',
  'user',
  ucf.user_id
FROM user_context_files ucf
WHERE NOT EXISTS (
  SELECT 1 FROM environments e
  WHERE e.user_id = ucf.user_id
    AND e.workspace_id = ucf.workspace_id
    AND e.scope = 'user'
    AND e.name = 'My Knowledge'
);

INSERT INTO environment_knowledge (environment_id, filename, content, created_at, updated_at)
SELECT
  e.id,
  ucf.filename,
  ucf.content,
  ucf.created_at,
  ucf.updated_at
FROM user_context_files ucf
JOIN environments e ON e.user_id = ucf.user_id
  AND e.workspace_id = ucf.workspace_id
  AND e.scope = 'user'
  AND e.name = 'My Knowledge'
ON CONFLICT (environment_id, filename) DO NOTHING;

-- ─── 6. Migrate existing environment_context_refs ──────────
-- Copy workspace_context_files that were referenced by environments
-- into environment_knowledge for those environments.

INSERT INTO environment_knowledge (environment_id, filename, content, created_at, updated_at)
SELECT
  ecr.environment_id,
  wcf.filename,
  wcf.content,
  wcf.created_at,
  wcf.updated_at
FROM environment_context_refs ecr
JOIN workspace_context_files wcf ON wcf.id = ecr.context_file_id
ON CONFLICT (environment_id, filename) DO NOTHING;

COMMIT;
