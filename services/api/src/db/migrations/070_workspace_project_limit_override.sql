-- Per-workspace project limit override.
-- When set (NOT NULL), overrides the plan-level maxProjects for this workspace.
-- When NULL, falls back to the plan default.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS max_projects_override integer;
