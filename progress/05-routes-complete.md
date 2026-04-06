# Phase 5: API Routes — Complete

**Date:** 2026-04-06
**PRDs:** PRD 23 (Universal LLM Provider Bridge) + PRD 20 (Usage Tracking)

## Files Created

### `services/api/src/routes/provider-catalog.ts`
- `GET /ai/provider-catalog` — Returns all 61 provider presets (public, no auth). ETag-based HTTP caching with 1hr max-age + stale-while-revalidate.
- `POST /ai/providers/test-connection` — Auth required. Tests a provider config before saving. Uses `ProviderDiscoveryService.validateProvider()`. Returns `{ ok, latencyMs, error?, models? }`.

### `services/api/src/routes/provider-bridge.ts`
- `POST /workspaces/:wid/ai-settings/providers/:id/discover-models` — Admin only. Fetches models from provider's API endpoint, updates `models_cache` JSONB column, upserts `ai_provider_models` rows.
- `GET /workspaces/:wid/ai-settings/providers/:id/models` — Member access. Returns cached models from `ai_provider_models` table with `cachedAt` timestamp.

### `services/api/src/routes/usage.ts`
- `GET /workspaces/:wid/usage/me` — User's usage summary (today/thisWeek/thisMonth). Query params: `from?`, `to?`.
- `GET /workspaces/:wid/usage/me/history` — Usage over time. Query params: `from?`, `to?`, `groupBy?` (day/week/month).
- `GET /workspaces/:wid/usage/me/breakdown` — By project, model, and mode.
- `GET /workspaces/:wid/usage` — Workspace-wide summary (admin only).
- `GET /workspaces/:wid/usage/members` — Per-member breakdown (admin only).
- `GET /workspaces/:wid/usage/providers` — Per-provider cost breakdown (admin only).

### `services/api/src/services/usage-service.ts`
- `logUsage()` — Fire-and-forget INSERT into `ai_usage_log`. Auto-calculates cost if not provided. try/catch wrapped to never break chat flow.
- `calculateCost()` — Multi-step model name resolution: exact match -> strip provider prefix -> strip date suffix -> family prefix LIKE match.
- `getUserSummary()` — Aggregates from `ai_usage_log` for today/week/month.
- `getUserHistory()` — `date_trunc()` grouping by day/week/month.
- `getUserBreakdown()` — GROUP BY project/model/mode with parallel queries.
- `getWorkspaceSummary()` — Workspace-wide aggregate.
- `getMemberBreakdown()` — Per-member JOIN with users table.
- `getProviderBreakdown()` — Per-provider with unique model count.
- `refreshDailyAggregates()` — INSERT ... ON CONFLICT DO UPDATE into `ai_usage_daily`.

## Files Modified

### `services/api/src/routes/ai-settings.ts`
- Enhanced `POST /:wid/ai-settings/providers/:id/validate` to use `ProviderDiscoveryService` instead of raw fetch. Now returns `{ valid, latencyMs, error?, healthStatus, models? }` and updates `health_status`, `health_latency_ms`, `last_health_check` columns.
- Uses `getProviderWithKeyAnyStatus()` so invalid providers can be re-validated.
- Added import for `providerDiscovery` and `ProviderConfig`.

### `packages/db/src/queries/ai-settings.ts`
- Added `getProviderWithKeyAnyStatus()` — same as `getProviderWithKey()` but without the `is_valid = true` filter, allowing validation of currently-invalid providers.

### `services/api/src/index.ts`
- Mounted `providerCatalogRoutes` at `/ai`
- Mounted `providerBridgeRoutes` at `/workspaces`
- Mounted `usageRoutes` at `/workspaces`

## Design Decisions

1. **No duplicate validate route** — Enhanced the existing `ai-settings.ts` validate route instead of creating a conflicting one in `provider-bridge.ts`. Hono matches first-registered route, so a duplicate would be unreachable.
2. **getProviderWithKeyAnyStatus** — Separate DB query without `is_valid = true` filter. Keeps backward compat for `getProviderWithKey` which other code depends on.
3. **Usage logging is fire-and-forget** — `logUsage()` wraps everything in try/catch and logs errors to console. Never throws, never blocks.
4. **Cost calculation 4-step resolution** — Handles model name variations (prefixed, date-suffixed, family names) without requiring exact matches in `model_pricing`.
5. **ETag based on provider count + first ID** — Lightweight, recomputed at startup. Changes when catalog is rebuilt.

## TypeScript Status
All new files compile cleanly. Only pre-existing `oauth2.ts` error remains (unrelated).
