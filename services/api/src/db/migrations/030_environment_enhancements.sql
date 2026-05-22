-- ═══════════════════════════════════════════════════════════
-- 030: Environment Enhancements
-- Add knowledge files, integration references, and default
-- environment support to environment presets.
-- ═══════════════════════════════════════════════════════════

-- Default environment per workspace
ALTER TABLE workspace_environments
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;

-- Ensure only one default per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_env_default
  ON workspace_environments(workspace_id)
  WHERE is_default = true;

-- Knowledge files bundled in an environment
CREATE TABLE IF NOT EXISTS environment_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  filename VARCHAR(200) NOT NULL,
  content TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_env_knowledge_env ON environment_knowledge(environment_id);

-- Integration references bundled in an environment
-- References integration_id from the Activepieces registry (e.g. "github", "slack")
-- plus optional scope and display config
CREATE TABLE IF NOT EXISTS environment_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  integration_id VARCHAR(100) NOT NULL,
  display_name VARCHAR(200),
  required BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_env_integrations_env ON environment_integrations(environment_id);
