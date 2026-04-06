# Phase 2: Database Migrations — Complete

## Files Created

### `services/api/src/db/migrations/038_provider_enhancements.sql`
**PRD 23 — Provider Bridge**

- Enhanced `ai_providers` table with 11 new columns:
  - `preset_id` — links to provider preset definitions
  - `wire_api` — constrained to `completions` or `responses`
  - `supports_tools`, `supports_vision`, `supports_mcp` — capability flags
  - `last_health_check`, `health_status`, `health_latency_ms` — health tracking
  - `display_order` — UI ordering
  - `models_cache` — JSONB cache of available models
  - `default_timeout_ms` — per-provider timeout
- Created `ai_provider_models` table for per-provider model list with enable/disable
- Added 4 indexes: provider lookup, enabled-model partial index, preset lookup, health status

### `services/api/src/db/migrations/039_usage_tracking.sql`
**PRD 20 — Usage, Token & Cost Tracking**

- Created `model_pricing` table with per-model cost rates (input, output, thinking, cache creation, cache read)
- Seeded 16 models across 8 providers (Anthropic, OpenAI, Google, DeepSeek, Groq, Mistral, xAI, Cohere)
- Created `ai_usage_log` table for per-request usage logging (25 columns including token breakdowns, cost, latency, BYOK tracking)
- Created `ai_usage_daily` aggregate table for fast dashboard rendering
- Created `ai_usage_monthly` aggregate table for billing/reporting
- Added 12 indexes total, with partial indexes on nullable columns for optimal query performance
- Documented NULL handling in UNIQUE constraints (PostgreSQL treats NULLs as distinct)

## Notes
- All DDL wrapped in `BEGIN/COMMIT` transactions
- All statements use `IF NOT EXISTS` for idempotent re-runs
- Seed data uses `ON CONFLICT DO NOTHING` to avoid duplicate errors
- Follows existing migration conventions from 009 and 037
