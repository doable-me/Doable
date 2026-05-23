-- 094_doable_data_mcp.sql
-- Auto-register a per-project built-in MCP server for the Data API control plane.
-- Backfills all existing projects. New projects are registered at creation time
-- via ensureDataConnectorForProject() (services/api/src/mcp/builtin/data/register.ts).
-- Idempotent: safe to re-run.

INSERT INTO mcp_connectors (
  workspace_id, project_id, created_by, scope,
  name, description,
  transport_type, server_command, server_args,
  auth_type, status, capabilities_cache
)
SELECT
  p.workspace_id,
  p.id,
  w.owner_id,   -- projects have no owner column; ownership is the workspace owner
  'project',
  'Doable Per-App Database',
  'Built-in: per-project PGlite. Use data.query for runtime DML, data.migrate for schema.',
  'stdio',
  'builtin:data',
  '[]'::jsonb,
  'none',
  'active',
  jsonb_build_object('tools', jsonb_build_object('listChanged', false))
FROM projects p
JOIN workspaces w ON w.id = p.workspace_id
WHERE NOT EXISTS (
  SELECT 1 FROM mcp_connectors c
  WHERE c.project_id = p.id AND c.server_command = 'builtin:data'
);

-- Enable all data.* tools by default (override pattern from migration 022).
INSERT INTO mcp_tool_overrides (connector_id, tool_name, enabled, workspace_id, project_id)
SELECT c.id, t.tool_name, true, c.workspace_id, c.project_id
FROM mcp_connectors c
CROSS JOIN (VALUES
  ('data.query'), ('data.exec'), ('data.migrate'), ('data.schema'), ('data.inspect')
) AS t(tool_name)
WHERE c.server_command = 'builtin:data'
ON CONFLICT DO NOTHING;
