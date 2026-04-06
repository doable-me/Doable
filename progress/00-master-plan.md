# PRD 23 + PRD 20 Implementation — Master Plan

## Status: ALL PHASES COMPLETE
## Started: 2026-04-06
## Rollback Tag: v0.23.0-pre-provider-bridge

---

## Phase 1: Provider Catalog ✅ COMPLETE
- [x] `packages/shared/src/ai/provider-types.ts` — ProviderPreset, ModelPreset, UsageMetrics interfaces
- [x] `packages/shared/src/ai/provider-catalog.ts` — 61 provider presets with lookup maps
- [x] `packages/shared/src/ai/index.ts` — Barrel exports
- [x] `packages/shared/src/index.ts` — Re-export from shared package

## Phase 2: Database Migrations ✅ COMPLETE
- [x] `services/api/src/db/migrations/038_provider_enhancements.sql` — 11 new columns on ai_providers + ai_provider_models table
- [x] `services/api/src/db/migrations/039_usage_tracking.sql` — model_pricing (seeded 16 models), ai_usage_log, ai_usage_daily, ai_usage_monthly

## Phase 3: wireApi Exposure ✅ COMPLETE
- [x] `services/api/src/ai/providers/copilot.ts` — wireApi added to ByokProviderConfig
- [x] `services/api/src/routes/chat.ts` — wireApi passed through from DB in 2 locations
- [x] `packages/db/src/types.ts` — wire_api added to AiProviderRow

## Phase 4: Discovery Service ✅ COMPLETE
- [x] `services/api/src/ai/provider-discovery.ts` — validateProvider (3s), discoverModels (5s, cached), ping (500ms)

## Phase 5: API Routes ✅ COMPLETE
- [x] `services/api/src/routes/provider-catalog.ts` — GET /ai/provider-catalog, POST /ai/providers/test-connection
- [x] `services/api/src/routes/provider-bridge.ts` — discover-models, cached models endpoints
- [x] `services/api/src/routes/usage.ts` — 6 usage dashboard routes (user + admin)
- [x] `services/api/src/services/usage-service.ts` — logUsage, calculateCost, summaries, aggregation
- [x] `services/api/src/routes/ai-settings.ts` — Enhanced validate with ProviderDiscoveryService
- [x] `services/api/src/index.ts` — All new routes mounted

## Phase 6: Usage Extraction ✅ COMPLETE
- [x] `services/api/src/ai/usage-collector.ts` — Non-blocking event collector
- [x] `services/api/src/routes/chat.ts` — 15 lines added (import + create + hook + emit + flush)
- [x] No changes to streaming logic or chat hot path

## Phase 7: Frontend ✅ COMPLETE
- [x] `apps/web/src/modules/ai-settings/components/provider-wizard.tsx` — 4-step wizard dialog
- [x] `apps/web/src/modules/ai-settings/components/provider-card.tsx` — Provider grid cards
- [x] `apps/web/src/modules/ai-settings/components/provider-health-badge.tsx` — Health status dots
- [x] `apps/web/src/modules/ai-settings/hooks/use-provider-catalog.ts` — Catalog fetch + grouping
- [x] `apps/web/src/modules/ai-settings/hooks/use-test-connection.ts` — Test connection hook
- [x] `apps/web/src/modules/ai-settings/utils/format-usage.ts` — Token/cost/duration formatters
- [x] `apps/web/src/modules/editor/chat/token-counter.tsx` — Per-message usage display
- [x] `apps/web/src/modules/ai-settings/components/editor-model-selector.tsx` — Enhanced with provider grouping + health + badges
- [x] `apps/web/src/modules/ai-settings/components/custom-providers-tab.tsx` — Integrated wizard + health badges
- [x] `apps/web/src/modules/editor/hooks/use-chat.ts` — SSE usage event capture
- [x] `apps/web/src/modules/editor/chat/chat-message.tsx` — TokenCounter rendered on AI responses

---

## Files Summary

### New Files (17)
1. packages/shared/src/ai/provider-types.ts
2. packages/shared/src/ai/provider-catalog.ts
3. packages/shared/src/ai/index.ts
4. services/api/src/db/migrations/038_provider_enhancements.sql
5. services/api/src/db/migrations/039_usage_tracking.sql
6. services/api/src/ai/provider-discovery.ts
7. services/api/src/ai/usage-collector.ts
8. services/api/src/routes/provider-catalog.ts
9. services/api/src/routes/provider-bridge.ts
10. services/api/src/routes/usage.ts
11. services/api/src/services/usage-service.ts
12. apps/web/src/modules/ai-settings/components/provider-wizard.tsx
13. apps/web/src/modules/ai-settings/components/provider-card.tsx
14. apps/web/src/modules/ai-settings/components/provider-health-badge.tsx
15. apps/web/src/modules/ai-settings/hooks/use-provider-catalog.ts
16. apps/web/src/modules/ai-settings/hooks/use-test-connection.ts
17. apps/web/src/modules/ai-settings/utils/format-usage.ts
18. apps/web/src/modules/editor/chat/token-counter.tsx

### Modified Files (15)
1. packages/shared/src/index.ts — re-export ai module
2. packages/db/src/types.ts — wire_api field
3. packages/db/src/queries/ai-settings.ts — enhanced columns + getProviderWithKeyAnyStatus
4. services/api/src/ai/providers/copilot.ts — wireApi in interface
5. services/api/src/routes/chat.ts — wireApi passthrough + usage collector integration
6. services/api/src/routes/ai-settings.ts — enhanced validate with discovery service
7. services/api/src/index.ts — mount new routes
8. apps/web/src/lib/api.ts — enhanced ApiAiProvider interface
9. apps/web/src/modules/ai-settings/components/custom-providers-tab.tsx — wizard integration
10. apps/web/src/modules/ai-settings/components/editor-model-selector.tsx — provider grouping
11. apps/web/src/modules/editor/hooks/use-editor-store.ts — usage field on ChatMessage
12. apps/web/src/modules/editor/hooks/use-chat.ts — SSE usage event handler
13. apps/web/src/modules/editor/chat/chat-message.tsx — token counter display
14. apps/web/src/app/editor/[projectId]/page.tsx — provider models fetch
15. packages/shared/tsconfig.tsbuildinfo — rebuild

## Deployment Steps
1. Run migrations 038 + 039 on PostgreSQL
2. Deploy API (tsx watch auto-reloads)
3. Deploy web (Next.js rebuild)
4. No environment variable changes needed
5. No new dependencies
