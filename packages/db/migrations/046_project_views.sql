-- Track recently viewed projects per user
CREATE TABLE IF NOT EXISTS project_views (
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_views_user_recent
  ON project_views (user_id, viewed_at DESC);
