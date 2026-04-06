# Phase 7B: Enhanced Model Selector + Per-Message Usage Display

**Status:** Complete  
**Date:** 2026-04-06  
**PRDs:** 23 (Universal LLM Provider Bridge) + 20 (Usage Tracking)

## What was implemented

### 1. Enhanced Model Selector (`editor-model-selector.tsx`)

- **Provider grouping**: Custom models are now grouped by provider name with headers
- **Health status dots**: Green/yellow/red/gray dot next to each provider name based on `health_status`
- **"Local" badge**: Providers detected as local show a "Local" badge with wifi icon
- **Capability badges**: Per-model vision (eye) and tool calling (wrench) icons
- **Latency hint**: Last health check latency shown next to provider header
- **Backward compatible**: All existing props/behavior preserved; `ModelOption` interface extended with optional fields
- **Scrollable dropdown**: Max height with overflow scroll for large model lists

### 2. Per-Message Usage Display (`token-counter.tsx`)

- Created `apps/web/src/modules/editor/chat/token-counter.tsx`
- Collapsed view: lightning bolt icon + total tokens + cost + duration
- Expanded view (on click): prompt/completion breakdown, model name, tool call count
- Handles estimated tokens (when provider doesn't report usage)
- Handles local providers (shows "$0.00 (local)")
- Muted styling, non-intrusive below AI responses

### 3. SSE Usage Event Capture (`use-chat.ts`)

- Added handler for `type: "usage"` SSE events in the streaming loop
- Supports both camelCase and snake_case field names from the API
- Stores usage data in `ChatMessage.usage` field on the editor store

### 4. Usage Display Formatting Helpers (`format-usage.ts`)

- Created `apps/web/src/modules/ai-settings/utils/format-usage.ts`
- `formatTokenCount()` - handles comma separators and M suffix
- `formatCost()` - handles sub-cent precision
- `formatDuration()` - handles ms, seconds, and minutes
- `formatCostWithLocal()` - local provider cost display
- All functions handle null/undefined/NaN edge cases

### 5. Supporting Infrastructure Changes

- **DB query** (`packages/db/src/queries/ai-settings.ts`): `listProviders` now returns enhanced columns (health_status, health_latency_ms, supports_tools, supports_vision, models_cache, preset_id, display_order)
- **API types** (`apps/web/src/lib/api.ts`): `ApiAiProvider` interface extended with new optional fields
- **Editor store** (`use-editor-store.ts`): `ChatMessage` interface extended with `usage` field
- **Editor page** (`page.tsx`): Model fetching now also loads custom provider models with health/capability metadata

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/modules/ai-settings/components/editor-model-selector.tsx` | Rewritten with provider grouping, health dots, capability badges |
| `apps/web/src/modules/editor/chat/token-counter.tsx` | **New** - Per-message usage display component |
| `apps/web/src/modules/ai-settings/utils/format-usage.ts` | **New** - Formatting helper functions |
| `apps/web/src/modules/editor/hooks/use-editor-store.ts` | Added `usage` field to ChatMessage |
| `apps/web/src/modules/editor/hooks/use-chat.ts` | Added `usage` SSE event handler |
| `apps/web/src/modules/editor/chat/chat-message.tsx` | Renders TokenCounter below AI responses |
| `apps/web/src/lib/api.ts` | Extended ApiAiProvider with health/capability fields |
| `packages/db/src/queries/ai-settings.ts` | listProviders returns enhanced columns |
| `apps/web/src/app/editor/[projectId]/page.tsx` | Fetches custom provider models for selector |

## Dependencies

- Requires migration 038 to be applied (adds health_status, models_cache, etc. columns)
- API must emit `type: "usage"` SSE events for token counter to display data
- Provider health checks must run for health dots to show meaningful colors

## Testing notes

- Model selector should still work with no custom providers (copilot-only mode)
- Token counter renders nothing when no usage data is present (graceful degradation)
- All formatting functions handle edge cases (null, 0, NaN, negative numbers)
