-- 050_public_projects.sql
-- Bare-bones stub of the public_projects table. Created here only so the
-- later "polish" migrations (051_discover_polish, 055_search_indexes) can
-- ALTER it without erroring on a fresh install.
--
-- Constraints, FKs, and the full set of indexes are layered on later by
-- 075_catchup_repo_drift.sql. This deliberately avoids declaring PRIMARY
-- KEY / UNIQUE / FK so 075's pg_dump-extracted ALTER TABLE statements
-- don't trip on duplicate-constraint errors.

CREATE TABLE IF NOT EXISTS public_projects (
  id            uuid        DEFAULT gen_random_uuid() NOT NULL,
  project_id    uuid        NOT NULL,
  title         text        NOT NULL,
  description   text,
  category      text,
  thumbnail_url text,
  remix_count   integer     DEFAULT 0,
  view_count    integer     DEFAULT 0,
  featured      boolean     DEFAULT false,
  published_at  timestamptz DEFAULT now()
);
