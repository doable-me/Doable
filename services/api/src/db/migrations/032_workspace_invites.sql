-- Migration 032: Workspace invites
-- Adds the workspace_invites table for email and shareable-link invitations,
-- and the invited_by column to workspace_members.

CREATE TABLE workspace_invites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         workspace_role NOT NULL DEFAULT 'member',
  token        TEXT NOT NULL UNIQUE,
  invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspace_invites_ws_email ON workspace_invites(workspace_id, email);
CREATE INDEX idx_workspace_invites_token ON workspace_invites(token);

-- Track who invited each workspace member
ALTER TABLE workspace_members
  ADD COLUMN invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
