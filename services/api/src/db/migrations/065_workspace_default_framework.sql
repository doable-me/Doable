-- Migration 065: Workspace-level default framework
-- Lets workspace admins pick a default framework_id used when a project
-- create call omits frameworkId AND prompt-text detection returns null.

ALTER TABLE workspace_ai_settings
    ADD COLUMN default_framework_id text NULL;

COMMENT ON COLUMN workspace_ai_settings.default_framework_id IS
    'Workspace-wide default framework_id used as fallback when project create omits frameworkId AND detect-framework returned null. NULL means no default — falls back to vite-react.';
