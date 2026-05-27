-- Migration 047: Create project_files table for template scaffolding and community remix
-- Stores file content for scaffolded/remixed projects

CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);

GRANT ALL PRIVILEGES ON project_files TO doable;
