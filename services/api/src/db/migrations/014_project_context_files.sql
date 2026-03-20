-- 014_project_context_files.sql
-- .doable/ context files stored in the database for each project.
-- These files shape the AI's behavior per project (identity, knowledge,
-- instructions, soul, memory, user preferences, plan).

CREATE TABLE IF NOT EXISTS project_context_files (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename    text NOT NULL,
    content     text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, filename)
);

CREATE INDEX idx_project_context_files_project ON project_context_files (project_id);

-- Auto-update updated_at on changes
CREATE TRIGGER trg_project_context_files_updated_at
    BEFORE UPDATE ON project_context_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
