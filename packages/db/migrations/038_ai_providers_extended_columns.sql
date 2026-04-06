-- Migration 038: Add missing columns to ai_providers table
-- These columns are referenced by ai-settings queries but were never migrated

ALTER TABLE ai_providers
  ADD COLUMN IF NOT EXISTS wire_api TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preset_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supports_tools BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_vision BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_mcp BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS health_latency_ms INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS models_cache JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_timeout_ms INTEGER DEFAULT NULL;
