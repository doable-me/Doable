-- 035_rename_project_environments.sql
-- Renames auto-migrated "Project Knowledge" environments to include the actual project name
-- so environments are easily identifiable.

BEGIN;

-- Rename project-scoped environments from generic "Project Knowledge" to project name
UPDATE environments e
SET name = p.name
FROM projects p
WHERE e.project_id = p.id
  AND e.scope = 'project'
  AND e.name = 'Project Knowledge';

COMMIT;
