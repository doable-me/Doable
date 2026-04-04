-- ═══════════════════════════════════════════════════════════
-- 029: Environment Presets
-- Bundle skills, instructions, MCPs, and integrations into
-- reusable environment presets assignable to workspaces.
-- ═══════════════════════════════════════════════════════════

-- Main environments table
CREATE TABLE IF NOT EXISTS environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  icon VARCHAR(50) DEFAULT '🔧',
  color VARCHAR(20) DEFAULT 'blue',
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Skills bundled in an environment
CREATE TABLE IF NOT EXISTS environment_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  skill_name VARCHAR(200) NOT NULL,
  skill_content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Rules bundled in an environment
CREATE TABLE IF NOT EXISTS environment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  rule_name VARCHAR(200) NOT NULL,
  file_patterns TEXT[] DEFAULT '{}',
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Custom instruction files bundled in an environment
CREATE TABLE IF NOT EXISTS environment_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  filename VARCHAR(200) NOT NULL,
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- MCP connector configs bundled in an environment
CREATE TABLE IF NOT EXISTS environment_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  transport_type VARCHAR(50) NOT NULL DEFAULT 'streamable_http',
  server_url TEXT,
  server_command TEXT,
  server_args JSONB DEFAULT '[]',
  auth_type VARCHAR(50) DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Many-to-many: workspaces ↔ environments
CREATE TABLE IF NOT EXISTS workspace_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  applied_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, environment_id)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_environments_workspace ON environments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_environments_created_by ON environments(created_by);
CREATE INDEX IF NOT EXISTS idx_environments_template ON environments(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_env_skills_env ON environment_skills(environment_id);
CREATE INDEX IF NOT EXISTS idx_env_rules_env ON environment_rules(environment_id);
CREATE INDEX IF NOT EXISTS idx_env_instructions_env ON environment_instructions(environment_id);
CREATE INDEX IF NOT EXISTS idx_env_connectors_env ON environment_connectors(environment_id);
CREATE INDEX IF NOT EXISTS idx_ws_environments_ws ON workspace_environments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ws_environments_env ON workspace_environments(environment_id);
