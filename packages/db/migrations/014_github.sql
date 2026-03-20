-- 014: GitHub Integration
-- Tables for GitHub connections (per-project repo links) and commit history.

-- ─── GitHub connections (per-project) ──────────────────────────
CREATE TABLE IF NOT EXISTS github_connections (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID        NOT NULL UNIQUE,
    repo_owner      TEXT        NOT NULL,
    repo_name       TEXT        NOT NULL,
    default_branch  TEXT        NOT NULL DEFAULT 'main',
    access_token    TEXT        NOT NULL,
    webhook_secret  TEXT,
    last_synced_at  TIMESTAMPTZ,
    sync_status     TEXT        NOT NULL DEFAULT 'synced',
    created_by      UUID        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_github_connections_project ON github_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_github_connections_repo ON github_connections(repo_owner, repo_name);

-- ─── GitHub commit history ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS github_commits (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id   UUID        NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
    sha             TEXT        NOT NULL,
    message         TEXT        NOT NULL,
    author          TEXT        NOT NULL,
    branch          TEXT        NOT NULL,
    direction       TEXT        NOT NULL CHECK (direction IN ('push', 'pull')),
    version_id      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_github_commits_connection ON github_commits(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_github_commits_sha ON github_commits(sha);

-- ─── GitHub user tokens (per-user, for OAuth-based access) ─────
-- Separate from github_connections: this stores the user-level GitHub
-- OAuth token so they can list repos, create new ones, etc.
CREATE TABLE IF NOT EXISTS github_user_tokens (
    user_id          UUID        PRIMARY KEY,
    github_username  TEXT        NOT NULL,
    github_id        TEXT,
    access_token     TEXT        NOT NULL,
    scopes           TEXT        NOT NULL DEFAULT 'repo',
    connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
