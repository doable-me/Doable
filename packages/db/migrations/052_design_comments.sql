-- 052_design_comments.sql
-- Design Comments: Figma-style comments pinned to positions on the visual canvas

CREATE TABLE IF NOT EXISTS design_comments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name text,
    user_color  text,
    -- Position on the canvas (percentage-based for responsive)
    x_percent   real NOT NULL,
    y_percent   real NOT NULL,
    -- Optional: CSS selector of the element the comment is pinned to
    selector    text,
    -- The page/file the comment is on (e.g. "index.html")
    page_path   text NOT NULL DEFAULT 'index.html',
    -- Comment content
    content     text NOT NULL,
    -- Thread support: top-level comments have NULL parent_id
    parent_id   uuid REFERENCES design_comments(id) ON DELETE CASCADE,
    -- Status: open comments show on canvas, resolved ones are hidden
    resolved    boolean NOT NULL DEFAULT false,
    resolved_by uuid REFERENCES users(id),
    resolved_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_comments_project
    ON design_comments (project_id, resolved, created_at);

CREATE INDEX IF NOT EXISTS idx_design_comments_parent
    ON design_comments (parent_id) WHERE parent_id IS NOT NULL;
