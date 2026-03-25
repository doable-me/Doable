-- 024_git_versioning.sql
-- Git-based version control infrastructure

-- Bookmarks for git-based versions (replaces project_versions.bookmarked for git projects)
CREATE TABLE IF NOT EXISTS version_bookmarks (
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    commit_sha  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_version_bookmarks_project ON version_bookmarks(project_id);

-- Track which projects have been migrated to git-based version control
ALTER TABLE projects ADD COLUMN IF NOT EXISTS git_initialized boolean NOT NULL DEFAULT false;

-- Add commit_sha reference to existing project_versions for hybrid lookups
ALTER TABLE project_versions ADD COLUMN IF NOT EXISTS commit_sha text;
CREATE INDEX IF NOT EXISTS idx_project_versions_sha ON project_versions(commit_sha) WHERE commit_sha IS NOT NULL;
