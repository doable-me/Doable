-- 054_project_connector_settings.sql
-- Per-project connector/MCP rate limit configuration.
-- Stored as JSONB for flexibility (can add more connector settings later).
--
-- Schema: { "rateLimitPerMinute": number | null }
--   - number: custom rate limit for this project
--   - null or absent: use system defaults (600 for JWT, 1200 for API key)
--   - 0: disable rate limiting entirely for this project

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS connector_settings jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN projects.connector_settings IS
  'Per-project connector/MCP settings. Keys: rateLimitPerMinute (number|null|0)';
