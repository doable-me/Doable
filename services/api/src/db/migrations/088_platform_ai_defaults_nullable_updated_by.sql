-- Migration 088: make platform_ai_defaults.updated_by nullable
-- Allows the boot-time seedAiProviderFromEnv() to insert rows without a
-- real user UUID. The column previously required NOT NULL with a uuid type,
-- which caused "invalid input syntax for type uuid: 'system'" on fresh DBs.

ALTER TABLE platform_ai_defaults
  ALTER COLUMN updated_by DROP NOT NULL;
