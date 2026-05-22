-- 022_mcp_connectors.sql
-- MCP connector infrastructure for external tool servers.

-- Transport and auth enums
DO $$ BEGIN
  CREATE TYPE mcp_transport_type AS ENUM ('streamable_http', 'http_sse', 'stdio');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE mcp_connector_scope AS ENUM ('workspace', 'project', 'user');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE mcp_auth_type AS ENUM ('none', 'api_key', 'oauth2', 'bearer_token');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- MCP connectors table
CREATE TABLE IF NOT EXISTS mcp_connectors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope           mcp_connector_scope NOT NULL DEFAULT 'workspace',
  name            varchar(200) NOT NULL,
  description     text,
  transport_type  mcp_transport_type NOT NULL DEFAULT 'streamable_http',
  server_url      text,
  server_command  text,
  server_args     jsonb DEFAULT '[]',
  server_env_encrypted  bytea,
  auth_type       mcp_auth_type NOT NULL DEFAULT 'none',
  credentials_encrypted bytea,
  status          text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error', 'connecting')),
  capabilities_cache    jsonb,
  last_connected_at     timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_connectors_workspace ON mcp_connectors (workspace_id, scope, status);
CREATE INDEX idx_mcp_connectors_project ON mcp_connectors (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_mcp_connectors_user ON mcp_connectors (created_by, scope) WHERE scope = 'user';

CREATE TRIGGER trg_mcp_connectors_updated_at
    BEFORE UPDATE ON mcp_connectors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Tool overrides (enable/disable specific MCP tools per scope)
CREATE TABLE IF NOT EXISTS mcp_tool_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id    uuid NOT NULL REFERENCES mcp_connectors(id) ON DELETE CASCADE,
  tool_name       text NOT NULL,
  enabled         boolean NOT NULL DEFAULT true,
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_mcp_tool_overrides_unique ON mcp_tool_overrides (
  connector_id, tool_name, workspace_id,
  COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
