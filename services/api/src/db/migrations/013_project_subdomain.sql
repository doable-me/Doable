-- Add subdomain column for published site URLs
-- Short, unique, user-customizable (e.g. "bean-brew-a7k2" → bean-brew-a7k2.doable.me)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subdomain text UNIQUE;

-- Index for fast lookup by subdomain (used by the static file server)
CREATE INDEX IF NOT EXISTS idx_projects_subdomain ON projects (subdomain) WHERE subdomain IS NOT NULL;
