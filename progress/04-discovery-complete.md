# Phase 4 — Provider Discovery Service: Complete

**Date:** 2026-04-06
**File:** `services/api/src/ai/provider-discovery.ts`
**PRD:** 23 (Universal LLM Provider Bridge)

## What was built

A modular, zero-dependency service for validating provider connections, discovering models, and health checking. Exported as a singleton `providerDiscovery`.

### Public API

| Method | Timeout | Purpose |
|---|---|---|
| `validateProvider(config)` | 3s | Auth + connectivity check, returns latency + error classification + optional model list |
| `discoverModels(config, providerId?, presetId?)` | 5s | Fetch model list from provider, cached 5min per provider, falls back to catalog defaults |
| `ping(baseUrl)` | 500ms | Quick HEAD request, returns boolean (true if server responds with < 500) |
| `clearCache(providerId?)` | — | Evict cache for one or all providers |
| `getCacheStats()` | — | Returns cache size and provider IDs (also cleans expired entries) |

### Error classification

- `invalid_api_key` — HTTP 401/403
- `unreachable` — ECONNREFUSED, ENOTFOUND, ENETUNREACH
- `timeout` — AbortError (exceeded hard timeout)
- `rate_limited` — HTTP 429
- `unknown` — anything else

### Auth header mapping

- **openai** type: `Authorization: Bearer {apiKey || bearerToken}`
- **anthropic** type: `x-api-key: {apiKey}` + `anthropic-version: 2023-06-01`
- **azure** type: `api-key: {apiKey}` + `?api-version=` query param

### Cache strategy

- In-memory `Map<providerId, { models, expiresAt }>`
- 5-minute TTL per provider
- ~2KB per entry x max ~20 providers = ~40KB. Negligible.
- Lazy eviction on `getCacheStats()` + TTL check on `discoverModels()`
- Thread-safe (single Node.js event loop)

### Model response parsing

Handles multiple response formats:
- OpenAI/Anthropic: `{ data: [{ id, ... }] }`
- Ollama `/api/tags`: `{ models: [{ name, ... }] }`
- Plain array format
- Falls back to catalog `PROVIDER_BY_ID` defaults when live fetch fails

## Dependencies

- **Zero new npm packages** — uses native `fetch` + `AbortController`
- Imports `PROVIDER_BY_ID` from `@doable/shared/ai/provider-catalog.js`
- Imports types from `@doable/shared/ai/provider-types.js`

## Type-check status

Passes `tsc --noEmit` with no new errors (one pre-existing error in `oauth2.ts`).
