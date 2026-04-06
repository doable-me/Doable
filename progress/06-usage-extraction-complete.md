# Step 6: Usage Extraction Integration — Complete

## Date: 2026-04-06

## What was created

### `services/api/src/ai/usage-collector.ts`
A lightweight, non-blocking usage event collector that:
- Listens to SDK `assistant.usage` events and extracts token counts (input, output, cache read, cache write)
- Counts tool calls from `tool.completed` / `tool.execution_complete` events
- Estimates cost using an in-memory cache of the `model_pricing` table (refreshed every 60s)
- Logs per-request usage to `ai_usage_log` via fire-and-forget SQL inserts
- Updates `ai_usage_daily` and `ai_usage_monthly` aggregate tables via upsert
- Accumulates usage across multi-turn agent sessions for the final SSE summary
- All DB writes are wrapped in try/catch — failures never break chat streaming
- Pure factory function (`createUsageCollector`), one instance per request, no singletons

Key design decisions:
- Uses raw SQL instead of importing `usage-service.ts` (keeps the collector self-contained)
- Handles SDK field name variations (camelCase and snake_case) for forward compatibility
- Model name prefix matching for versioned model IDs (e.g. `claude-sonnet-4-6-20260401` matches `claude-sonnet-4-6`)
- Only created when `workspaceId` is available (required FK for usage tables)

## Changes to `services/api/src/routes/chat.ts`

### 4 surgical modifications (total: ~15 lines added):

1. **Line 15** — Import:
   ```typescript
   import { createUsageCollector } from "../ai/usage-collector.js";
   ```

2. **Lines 749-758** — Collector instantiation (after workspace/provider resolution, before session creation):
   ```typescript
   const usageCollector = workspaceId ? createUsageCollector({
     userId, workspaceId, projectId,
     provider: resolvedProvider ? "byok" : "copilot",
     providerLabel: resolvedProvider?.type ?? "GitHub Copilot",
     byokProviderId: providerId,
     mode,
   }) : null;
   ```

3. **Lines 1244-1245** — Event hook (inside the main streaming event loop, after event extraction):
   ```typescript
   if (usageCollector) usageCollector.onUsageEvent(event);
   ```

4. **Lines 1678-1685** — Flush and emit usage SSE event (before `[DONE]`):
   ```typescript
   if (usageCollector) {
     try { await usageCollector.flush(); } catch { /* non-critical */ }
     const usage = usageCollector.getAccumulatedUsage();
     if (usage.tokensAvailable) {
       await stream.writeSSE({ data: JSON.stringify({ type: "usage", data: usage }) });
     }
   }
   ```

## Integration points

- **Event source**: Raw SDK `SessionEvent` objects in the main streaming `for await...of` loop
- **Event types captured**: `assistant.usage` (tokens/cost), `tool.completed`/`tool.execution_complete` (tool count)
- **DB tables written**: `ai_usage_log` (per-API-call), `ai_usage_daily` (daily aggregate), `ai_usage_monthly` (monthly aggregate)
- **SSE output**: New `type: "usage"` event emitted just before `[DONE]` when tokens are available
- **Pricing source**: `model_pricing` table (from migration 039), cached in-memory with 60s TTL

## What was NOT changed
- No changes to the streaming pipeline or `mapEventToSSE` function
- No changes to the event loop control flow (terminal events, timeouts, etc.)
- No changes to session creation/destruction
- No blocking operations added to the request path
- No changes to existing SSE event types
- The `assistant.usage` case in `mapEventToSSE` still returns `null` (events are captured by the collector before reaching the mapper)
