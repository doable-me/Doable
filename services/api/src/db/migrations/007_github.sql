-- 007_github.sql
-- Doable: GitHub integration tables

CREATE TYPE github_sync_status AS ENUM ('synced', 'ahead', 'behind', 'diverged', 'disconnected');

-- ─── GitHub Connections ────────────────────────────────────
CREATE TABLE github_connections (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      uuid NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    repo_owner      text NOT NULL,
    repo_name       text NOT NULL,
    default_branch  text NOT NULL DEFAULT 'main',
    access_token    text NOT NULL,
    webhook_secret  text,
    last_synced_at  timestamptz,
    sync_status     github_sync_status NOT NULL DEFAULT 'disconnected',
    created_by      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_connections_project ON github_connections (project_id);
CREATE INDEX idx_github_connections_repo ON github_connections (repo_owner, repo_name);

-- ─── GitHub Commits ────────────────────────────────────────
CREATE TABLE github_commits (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id   uuid NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
    sha             text NOT NULL,
    message         text NOT NULL,
    author          text NOT NULL,
    branch          text NOT NULL DEFAULT 'main',
    direction       text NOT NULL CHECK (direction IN ('push', 'pull')),
    version_id      uuid REFERENCES project_versions(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_commits_connection ON github_commits (connection_id);
CREATE INDEX idx_github_commits_sha ON github_commits (sha);

-- ─── Trigger ───────────────────────────────────────────────
CREATE TRIGGER trg_github_connections_updated_at
    BEFORE UPDATE ON github_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
