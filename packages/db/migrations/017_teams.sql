-- 017_teams.sql
-- Team collaboration: workspace invites and project collaborators.
-- workspace_members already exists from 001_initial_schema.sql.
-- This migration adds the invited_by column, workspace_invites, and project_collaborators.

-- ─── Extend workspace_members ─────────────────────────────────
ALTER TABLE workspace_members
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES users(id);

-- ─── Workspace Invites ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_invites (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  uuid        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email         text        NOT NULL,
    role          text        NOT NULL DEFAULT 'member'
                              CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    token         text        NOT NULL UNIQUE,
    invited_by    uuid        NOT NULL REFERENCES users(id),
    expires_at    timestamptz NOT NULL,
    accepted_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON workspace_invites (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON workspace_invites (token);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON workspace_invites (email);

-- ─── Project Collaborators ────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_collaborators (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        text NOT NULL DEFAULT 'editor'
                CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    added_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_collaborators_project ON project_collaborators (project_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_user ON project_collaborators (user_id);
