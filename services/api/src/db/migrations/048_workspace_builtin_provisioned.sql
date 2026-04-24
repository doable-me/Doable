-- 048_workspace_builtin_provisioned.sql
-- Tracks which builtin MCP Apps have been auto-provisioned per workspace.
-- We only auto-provision a builtin once. If the user later deletes the
-- connector, the row in this table remains, so a server restart will NOT
-- re-add it. To re-enable, the user adds it manually from the marketplace.

CREATE TABLE IF NOT EXISTS workspace_builtin_provisioned (
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  builtin_id      text NOT NULL,
  provisioned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, builtin_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_builtin_provisioned_builtin
  ON workspace_builtin_provisioned (builtin_id);
