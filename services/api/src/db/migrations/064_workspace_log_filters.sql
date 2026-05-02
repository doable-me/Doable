-- 064_workspace_log_filters.sql
-- PRD 04 §4.2: workspace-admin custom log filters layered on top of the
-- always-on baseline (env-values, shapes, entropy, paths, urls,
-- usernames). Two filter types are configurable via the `config` JSONB:
--   { "filter_id": "deny-pattern", "config": {"pattern": "...", "token": "..."} }
--   { "filter_id": "drop-pattern", "config": {"pattern": "..."} }

CREATE TABLE IF NOT EXISTS workspace_log_filters (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  id           SERIAL,
  filter_id    TEXT NOT NULL CHECK (filter_id IN ('deny-pattern','drop-pattern')),
  config       JSONB NOT NULL,
  enabled      BOOL NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS workspace_log_filters_ws_idx
  ON workspace_log_filters (workspace_id);
