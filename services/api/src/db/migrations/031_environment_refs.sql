-- Migration 031: Replace environment snapshot tables with reference tables
-- Environments should reference existing workspace items, not duplicate them.
-- Keeps environment_instructions (no standalone equivalent).

-- Drop snapshot/duplicate tables
DROP TABLE IF EXISTS environment_knowledge;
DROP TABLE IF EXISTS environment_integrations;
DROP TABLE IF EXISTS environment_connectors;
DROP TABLE IF EXISTS environment_skills;
DROP TABLE IF EXISTS environment_rules;

-- References to workspace context_skills
CREATE TABLE environment_skill_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES context_skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(environment_id, skill_id)
);
CREATE INDEX idx_env_skill_refs_env ON environment_skill_refs(environment_id);

-- References to workspace context_rules
CREATE TABLE environment_rule_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES context_rules(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(environment_id, rule_id)
);
CREATE INDEX idx_env_rule_refs_env ON environment_rule_refs(environment_id);

-- References to workspace_context_files (knowledge)
CREATE TABLE environment_context_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  context_file_id UUID NOT NULL REFERENCES workspace_context_files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(environment_id, context_file_id)
);
CREATE INDEX idx_env_context_refs_env ON environment_context_refs(environment_id);

-- References to mcp_connectors (connectors / integrations)
CREATE TABLE environment_connector_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  connector_id UUID NOT NULL REFERENCES mcp_connectors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(environment_id, connector_id)
);
CREATE INDEX idx_env_connector_refs_env ON environment_connector_refs(environment_id);
