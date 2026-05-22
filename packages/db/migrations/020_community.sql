-- 020_community.sql
-- Community features: public projects and project remixes

-- ─── Public Projects ─────────────────────────────────────────
-- Stores metadata about projects that have been published to the community.

CREATE TABLE IF NOT EXISTS public_projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  thumbnail_url TEXT,
  remix_count   INT DEFAULT 0,
  view_count    INT DEFAULT 0,
  featured      BOOLEAN DEFAULT false,
  published_at  TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_public_projects_project UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_public_projects_category ON public_projects(category);
CREATE INDEX IF NOT EXISTS idx_public_projects_featured ON public_projects(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_public_projects_published_at ON public_projects(published_at DESC);

-- ─── Project Remixes ─────────────────────────────────────────
-- Tracks when a user forks/remixes a public project.

CREATE TABLE IF NOT EXISTS project_remixes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  forked_project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  forked_by           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_remixes_source ON project_remixes(source_project_id);
CREATE INDEX IF NOT EXISTS idx_project_remixes_forked_by ON project_remixes(forked_by);
