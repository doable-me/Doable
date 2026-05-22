-- Migration 038: Provider Bridge enhancements (PRD 23)
-- Enhances ai_providers with preset metadata, health tracking, and capability flags.
-- Adds per-provider model list with enable/disable control.

BEGIN;

-- ─── Enhance ai_providers ───────────────────────────────────
ALTER TABLE ai_providers
  ADD COLUMN IF NOT EXISTS preset_id         text,
  ADD COLUMN IF NOT EXISTS wire_api          text CHECK (wire_api IN ('completions', 'responses')),
  ADD COLUMN IF NOT EXISTS supports_tools    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS supports_vision   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_mcp      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_health_check timestamptz,
  ADD COLUMN IF NOT EXISTS health_status     text DEFAULT 'unknown'
    CHECK (health_status IN ('healthy', 'degraded', 'down', 'unknown')),
  ADD COLUMN IF NOT EXISTS health_latency_ms integer,
  ADD COLUMN IF NOT EXISTS display_order     integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS models_cache      jsonb,
  ADD COLUMN IF NOT EXISTS default_timeout_ms integer;

-- ─── Per-provider model list ────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_provider_models (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id     uuid NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_id        text NOT NULL,
  display_name    text,
  is_enabled      boolean NOT NULL DEFAULT true,
  context_window  integer,
  supports_tools  boolean DEFAULT true,
  supports_vision boolean DEFAULT false,
  display_order   integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, model_id)
);

-- ─── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_apm_provider ON ai_provider_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_apm_enabled ON ai_provider_models(provider_id, is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_ai_providers_preset ON ai_providers(preset_id) WHERE preset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_providers_health ON ai_providers(health_status);

COMMIT;
