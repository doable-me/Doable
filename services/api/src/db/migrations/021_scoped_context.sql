-- 021_scoped_context.sql
-- Multi-scope context files + skills + rules system

-- Workspace-level context files
CREATE TABLE IF NOT EXISTS workspace_context_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, filename)
);

CREATE INDEX idx_workspace_context_workspace ON workspace_context_files (workspace_id);

CREATE TRIGGER trg_workspace_context_updated_at
    BEFORE UPDATE ON workspace_context_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- User-level context overrides (within a workspace)
CREATE TABLE IF NOT EXISTS user_context_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  filename text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, filename)
);

CREATE INDEX idx_user_context_user_workspace ON user_context_files (user_id, workspace_id);

CREATE TRIGGER trg_user_context_updated_at
    BEFORE UPDATE ON user_context_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Skills
CREATE TABLE IF NOT EXISTS context_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('workspace', 'project', 'user')),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  skill_name text NOT NULL,
  skill_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_skills_workspace ON context_skills (workspace_id, scope);
CREATE INDEX idx_skills_project ON context_skills (project_id) WHERE project_id IS NOT NULL;

CREATE TRIGGER trg_context_skills_updated_at
    BEFORE UPDATE ON context_skills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Rules
CREATE TABLE IF NOT EXISTS context_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('workspace', 'project', 'user')),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  file_patterns text[] DEFAULT '{}',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rules_workspace ON context_rules (workspace_id, scope);
CREATE INDEX idx_rules_project ON context_rules (project_id) WHERE project_id IS NOT NULL;

CREATE TRIGGER trg_context_rules_updated_at
    BEFORE UPDATE ON context_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
