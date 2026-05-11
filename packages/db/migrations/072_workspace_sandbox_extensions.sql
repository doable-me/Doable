-- 072_workspace_sandbox_extensions.sql
-- Per SandboxAgnosticSandboxingPRD/10-config-management.md
-- workspace_sandbox_settings table does not yet exist in earlier migrations; create it first,
-- then apply the PRD ch 10 backend + allowed_profile_keys extensions.

CREATE TABLE IF NOT EXISTS workspace_sandbox_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_sandbox_settings
  ADD COLUMN IF NOT EXISTS sandbox_backend text NULL,
  ADD COLUMN IF NOT EXISTS allowed_profile_keys text[] NOT NULL DEFAULT ARRAY['ai-bash','vite-preview','install','build']::text[];

COMMENT ON COLUMN workspace_sandbox_settings.sandbox_backend IS 'bubblewrap|systemd|psroot|sandbox-exec|none|NULL=auto. PRD ch 10.';
COMMENT ON COLUMN workspace_sandbox_settings.allowed_profile_keys IS 'Profiles allowed for this workspace. Calls with other profileKey rejected by orchestrator.';
