# PRD 23 + PRD 20 Implementation Status — Resume Guide

## Date: 2026-04-06
## Rollback Tag: v0.23.0-pre-provider-bridge

---

## DONE (fully implemented, audited, bugs fixed)

### PRD 23 — Universal LLM Provider Bridge
- [x] **Provider Catalog** — `packages/shared/src/ai/provider-catalog.ts` (61 providers, static TypeScript)
- [x] **Provider Types** — `packages/shared/src/ai/provider-types.ts` (ProviderPreset, ModelPreset, UsageMetrics)
- [x] **DB Migration 038** — `services/api/src/db/migrations/038_provider_enhancements.sql` (ai_providers enhancements + ai_provider_models table)
- [x] **DB Migration 039** — `services/api/src/db/migrations/039_usage_tracking.sql` (model_pricing, ai_usage_log, ai_usage_daily, ai_usage_monthly)
- [x] **DB Migration 040** — `services/api/src/db/migrations/040_fix_usage_null_upsert.sql` (fixes NULL project_id in UNIQUE constraints)
- [x] **wireApi exposure** — `copilot.ts` interface + `chat.ts` passthrough + `packages/db/src/types.ts` AiProviderRow
- [x] **Discovery Service** — `services/api/src/ai/provider-discovery.ts` (validate, discoverModels, ping with caching)
- [x] **API Routes** — `services/api/src/routes/provider-catalog.ts` (GET catalog + POST test-connection)
- [x] **API Routes** — `services/api/src/routes/provider-bridge.ts` (discover-models + cached models)
- [x] **Route mounting** — All routes mounted in `services/api/src/index.ts`
- [x] **Frontend Wizard** — `provider-wizard.tsx` (4-step: choose → configure → validate → models, with X close button)
- [x] **Provider Cards** — `provider-card.tsx` + `provider-health-badge.tsx`
- [x] **Provider Icons** — `provider-icons.tsx` (19 real SVG logos from SimpleIcons/svgl/lobehub, rest use text abbreviations)
- [x] **Hooks** — `use-provider-catalog.ts` + `use-test-connection.ts`
- [x] **Enhanced Model Selector** — `editor-model-selector.tsx` (provider grouping, health dots, capability badges)
- [x] **Connections Tab** — `connections-tab.tsx` now renders `CustomProvidersTab` with wizard (old 3-type form replaced)

### PRD 20 — Usage Tracking (BACKEND ONLY)
- [x] **Usage Collector** — `services/api/src/ai/usage-collector.ts` (captures SDK assistant.usage events, non-blocking)
- [x] **Usage Service** — `services/api/src/services/usage-service.ts` (logUsage, calculateCost, summaries, aggregation)
- [x] **Usage API Routes** — `services/api/src/routes/usage.ts` (6 endpoints: /usage/me, /me/history, /me/breakdown, workspace summary, members, providers)
- [x] **Chat integration** — `chat.ts` wired to create collector, feed events, flush, emit SSE usage event
- [x] **Per-message display** — `token-counter.tsx` (⚡ tokens · $cost · time, expandable)
- [x] **SSE capture** — `use-chat.ts` handles `type: "usage"` events, stores on ChatMessage
- [x] **Chat message rendering** — `chat-message.tsx` renders TokenCounter on AI responses
- [x] **Format utilities** — `format-usage.ts` (formatTokenCount, formatCost, formatDuration, formatCostWithLocal)

---

## NOT DONE — Needs building in next session

### 1. Usage Dashboard Pages (PRD 20 Sections 4-6)
The API routes exist (`/usage/me`, `/usage/me/history`, etc.) but NO frontend pages exist to display them.

**Need to build:**
- **My Usage Page** (`/settings/usage` or new tab in AI settings) — PRD 20 Section 4.1
  - Summary cards (today's tokens, this month's cost, credits remaining)
  - Usage chart (daily tokens over 7d/30d/90d)
  - Breakdown by provider, project, model, mode
  - Recent requests list
- **Workspace Admin Usage Page** — PRD 20 Section 5.1
  - Workspace-wide summary
  - Member leaderboard
  - Project breakdown
  - Provider distribution
  - Per-member credit caps (controls)
- **Platform Admin Usage Page** — PRD 20 Section 6.1
  - System-wide usage summary
  - Cost trend chart
  - Workspace/user ranking
  - Model pricing management UI

### 2. Provider Logo Images
Currently 19/61 providers have real SVG logos (from SimpleIcons/svgl). The rest use text abbreviations.
To get all real logos: download SVG/PNG from each provider's brand page → place in `public/provider-logos/{id}.svg` → switch `provider-icons.tsx` to use `<img>` for providers that have image files.

### 3. Migrations not yet run on server
Migrations 038, 039, 040 exist as files but have NOT been run on the database yet. They need to be run before any usage tracking works.

---

## Key files for the next session to read

### Backend (usage APIs already built, just need frontend consumers):
- `services/api/src/routes/usage.ts` — 6 endpoints with query params
- `services/api/src/services/usage-service.ts` — getUserSummary, getWorkspaceSummary, getUserHistory, getUserBreakdown, getMemberBreakdown, getProviderBreakdown
- `services/api/src/ai/usage-collector.ts` — how usage flows from SDK → DB
- `packages/shared/src/ai/provider-types.ts` — UsageMetrics interface

### Frontend patterns to follow:
- `apps/web/src/modules/ai-settings/components/ai-settings-page.tsx` — tab-based settings page pattern
- `apps/web/src/modules/ai-settings/hooks/use-ai-settings.ts` — hook pattern for API calls
- `apps/web/src/lib/api.ts` — apiFetch pattern
- `apps/web/src/modules/ai-settings/utils/format-usage.ts` — formatting helpers already built
- `apps/web/src/modules/editor/chat/token-counter.tsx` — per-message usage display (already works)

### API endpoints available:
```
GET  /workspaces/:wid/usage/me                — user summary (today/week/month)
GET  /workspaces/:wid/usage/me/history         — time series (groupBy=day|week|month)
GET  /workspaces/:wid/usage/me/breakdown       — by project/model/mode
GET  /workspaces/:wid/usage                    — workspace summary (admin)
GET  /workspaces/:wid/usage/members            — per-member breakdown (admin)
GET  /workspaces/:wid/usage/providers          — per-provider costs (admin)
```

All accept query params: `from`, `to` (ISO dates), `projectId`, `provider`, `model`, `mode`, `groupBy`

---

## Bugs that were fixed (for reference)
1. NULL project_id ON CONFLICT upsert — fixed with COALESCE in migration 040 + usage-collector + usage-service
2. Tool call count hardcoded to 0 — fixed in usage-collector.ts
3. Thinking tokens not extracted — fixed in usage-collector.ts
4. AiProviderRow missing columns — fixed in packages/db/src/types.ts
5. sessionId not passed to collector — fixed with setSessionId() method
6. Error path skipped flush — fixed in chat.ts catch block
7. Provider wizard had no close button — fixed with X button
8. CustomProvidersTab not rendered — fixed by wiring into connections-tab.tsx
9. onRefreshProviders not passed through — fixed in ai-settings-page.tsx → connections-tab.tsx
