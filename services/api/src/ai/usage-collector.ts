/**
 * Usage Collector — lightweight, non-blocking usage event handler
 *
 * Listens to SDK `assistant.usage` events and logs per-request usage
 * to the ai_usage_log table. Designed to be attached to a Copilot SDK
 * session without modifying the existing event processing pipeline.
 *
 * All DB writes are fire-and-forget. Failures never break the chat.
 */

import { sql } from "../db/index.js";

// ─── Types ─────────────────────────────────────────────────

export interface UsageCollectorContext {
  userId: string;
  workspaceId: string;
  projectId: string;
  sessionId?: string;
  provider: "copilot" | "byok" | "local";
  providerLabel: string;
  byokProviderId?: string;
  isLocal?: boolean;
  mode?: string;
}

interface AccumulatedUsage {
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  toolCallCount: number;
  estimatedCostUsd: number;
  durationMs: number;
  ttftMs: number | null;
  model: string;
  tokensAvailable: boolean;
}

// ─── Cost estimation from model_pricing table ──────────────

// In-memory pricing cache (refreshed at most once per minute)
let pricingCache: Map<string, {
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  thinking_cost_per_1m: number | null;
  cache_creation_cost_per_1m: number | null;
  cache_read_cost_per_1m: number | null;
}> | null = null;
let pricingCacheTime = 0;
const PRICING_CACHE_TTL_MS = 60_000;

async function getPricing(model: string): Promise<{
  input_cost_per_1m: number;
  output_cost_per_1m: number;
  thinking_cost_per_1m: number | null;
  cache_creation_cost_per_1m: number | null;
  cache_read_cost_per_1m: number | null;
} | null> {
  try {
    const now = Date.now();
    if (!pricingCache || now - pricingCacheTime > PRICING_CACHE_TTL_MS) {
      const rows = await sql`
        SELECT model_id, input_cost_per_1m, output_cost_per_1m,
               thinking_cost_per_1m, cache_creation_cost_per_1m, cache_read_cost_per_1m
        FROM model_pricing WHERE is_active = true
      `;
      pricingCache = new Map();
      for (const row of rows) {
        pricingCache.set(row.model_id, {
          input_cost_per_1m: Number(row.input_cost_per_1m),
          output_cost_per_1m: Number(row.output_cost_per_1m),
          thinking_cost_per_1m: row.thinking_cost_per_1m != null ? Number(row.thinking_cost_per_1m) : null,
          cache_creation_cost_per_1m: row.cache_creation_cost_per_1m != null ? Number(row.cache_creation_cost_per_1m) : null,
          cache_read_cost_per_1m: row.cache_read_cost_per_1m != null ? Number(row.cache_read_cost_per_1m) : null,
        });
      }
      pricingCacheTime = now;
    }

    // Try exact match first
    if (pricingCache.has(model)) return pricingCache.get(model)!;

    // Normalize: dots to dashes (SDK reports "claude-opus-4.6", pricing uses "claude-opus-4-6")
    const normalized = model.replace(/\./g, "-");
    if (normalized !== model && pricingCache.has(normalized)) return pricingCache.get(normalized)!;

    // Prefix match (e.g. "claude-sonnet-4-6-20260401" -> "claude-sonnet-4-6")
    for (const [key, value] of pricingCache) {
      if (model.startsWith(key) || normalized.startsWith(key)) return value;
    }
    return null;
  } catch {
    return null;
  }
}

function estimateCost(
  pricing: NonNullable<Awaited<ReturnType<typeof getPricing>>>,
  promptTokens: number,
  completionTokens: number,
  thinkingTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
): number {
  let cost = 0;
  cost += (promptTokens / 1_000_000) * pricing.input_cost_per_1m;
  cost += (completionTokens / 1_000_000) * pricing.output_cost_per_1m;
  if (pricing.thinking_cost_per_1m != null && thinkingTokens > 0) {
    cost += (thinkingTokens / 1_000_000) * pricing.thinking_cost_per_1m;
  }
  if (pricing.cache_creation_cost_per_1m != null && cacheCreationTokens > 0) {
    cost += (cacheCreationTokens / 1_000_000) * pricing.cache_creation_cost_per_1m;
  }
  if (pricing.cache_read_cost_per_1m != null && cacheReadTokens > 0) {
    cost += (cacheReadTokens / 1_000_000) * pricing.cache_read_cost_per_1m;
  }
  return cost;
}

// ─── Daily/Monthly aggregate upsert ────────────────────────

async function upsertDailyAggregate(
  ctx: UsageCollectorContext,
  model: string,
  promptTokens: number,
  completionTokens: number,
  thinkingTokens: number,
  totalTokens: number,
  costUsd: number,
  durationMs: number,
  toolCallCount: number,
): Promise<void> {
  // Use COALESCE on project_id to match the functional unique index (idx_daily_unique)
  // so that NULL project_id values are treated as equal and trigger the upsert.
  const projectId = ctx.projectId ?? null;
  await sql`
    INSERT INTO ai_usage_daily (
      date, user_id, workspace_id, project_id, provider, model,
      request_count, total_prompt_tokens, total_completion_tokens,
      total_thinking_tokens, total_tokens, total_cost_usd,
      total_duration_ms, avg_tokens_per_request, tool_call_count
    ) VALUES (
      CURRENT_DATE,
      ${ctx.userId}, ${ctx.workspaceId},
      ${projectId},
      ${ctx.provider}, ${model || "unknown"},
      1, ${promptTokens}, ${completionTokens},
      ${thinkingTokens}, ${totalTokens}, ${costUsd},
      ${durationMs}, ${totalTokens}, ${toolCallCount}
    )
    ON CONFLICT (date, user_id, workspace_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, model)
    DO UPDATE SET
      request_count = ai_usage_daily.request_count + 1,
      total_prompt_tokens = ai_usage_daily.total_prompt_tokens + EXCLUDED.total_prompt_tokens,
      total_completion_tokens = ai_usage_daily.total_completion_tokens + EXCLUDED.total_completion_tokens,
      total_thinking_tokens = ai_usage_daily.total_thinking_tokens + EXCLUDED.total_thinking_tokens,
      total_tokens = ai_usage_daily.total_tokens + EXCLUDED.total_tokens,
      total_cost_usd = ai_usage_daily.total_cost_usd + EXCLUDED.total_cost_usd,
      total_duration_ms = ai_usage_daily.total_duration_ms + EXCLUDED.total_duration_ms,
      avg_tokens_per_request = (ai_usage_daily.total_tokens + EXCLUDED.total_tokens)
        / (ai_usage_daily.request_count + 1),
      tool_call_count = ai_usage_daily.tool_call_count + EXCLUDED.tool_call_count
  `;
}

async function upsertMonthlyAggregate(
  ctx: UsageCollectorContext,
  model: string,
  promptTokens: number,
  completionTokens: number,
  thinkingTokens: number,
  totalTokens: number,
  costUsd: number,
  durationMs: number,
  toolCallCount: number,
): Promise<void> {
  // Use COALESCE on project_id to match the functional unique index (idx_monthly_unique)
  const projectId = ctx.projectId ?? null;
  await sql`
    INSERT INTO ai_usage_monthly (
      month, user_id, workspace_id, project_id, provider, model,
      request_count, total_prompt_tokens, total_completion_tokens,
      total_thinking_tokens, total_tokens, total_cost_usd,
      total_duration_ms, avg_tokens_per_request, tool_call_count
    ) VALUES (
      date_trunc('month', CURRENT_DATE)::date,
      ${ctx.userId}, ${ctx.workspaceId},
      ${projectId},
      ${ctx.provider}, ${model || "unknown"},
      1, ${promptTokens}, ${completionTokens},
      ${thinkingTokens}, ${totalTokens}, ${costUsd},
      ${durationMs}, ${totalTokens}, ${toolCallCount}
    )
    ON CONFLICT (month, user_id, workspace_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, model)
    DO UPDATE SET
      request_count = ai_usage_monthly.request_count + 1,
      total_prompt_tokens = ai_usage_monthly.total_prompt_tokens + EXCLUDED.total_prompt_tokens,
      total_completion_tokens = ai_usage_monthly.total_completion_tokens + EXCLUDED.total_completion_tokens,
      total_thinking_tokens = ai_usage_monthly.total_thinking_tokens + EXCLUDED.total_thinking_tokens,
      total_tokens = ai_usage_monthly.total_tokens + EXCLUDED.total_tokens,
      total_cost_usd = ai_usage_monthly.total_cost_usd + EXCLUDED.total_cost_usd,
      total_duration_ms = ai_usage_monthly.total_duration_ms + EXCLUDED.total_duration_ms,
      avg_tokens_per_request = (ai_usage_monthly.total_tokens + EXCLUDED.total_tokens)
        / (ai_usage_monthly.request_count + 1),
      tool_call_count = ai_usage_monthly.tool_call_count + EXCLUDED.tool_call_count
  `;
}

// ─── Factory ───────────────────────────────────────────────

/**
 * Creates event handlers that capture SDK usage events.
 * Designed to be attached to a Copilot SDK session without
 * modifying the existing event processing pipeline.
 *
 * Returns an object with:
 * - onUsageEvent(event) — handles raw SDK events (call for every event)
 * - getAccumulatedUsage() — returns accumulated usage for the SSE done event
 * - flush() — ensures all pending writes complete
 */
export function createUsageCollector(ctx: UsageCollectorContext) {
  const accumulatedUsage: AccumulatedUsage = {
    promptTokens: 0,
    completionTokens: 0,
    thinkingTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    toolCallCount: 0,
    estimatedCostUsd: 0,
    durationMs: 0,
    ttftMs: null,
    model: "",
    tokensAvailable: false,
  };

  const pendingWrites: Promise<void>[] = [];

  /**
   * Handle a raw SDK event. Only processes usage-related event types;
   * silently ignores everything else (zero overhead for non-usage events).
   */
  function onUsageEvent(event: Record<string, unknown>): void {
    const type = event.type as string;

    if (type === "assistant.usage") {
      handleAssistantUsage(event.data as Record<string, unknown> | undefined);
    } else if (type === "tool.completed" || type === "tool.execution_complete") {
      accumulatedUsage.toolCallCount++;
    }
  }

  function handleAssistantUsage(data: Record<string, unknown> | undefined): void {
    if (!data) return;

    // Extract token counts from SDK event (field names vary by SDK version)
    const inputTokens = toNum(data.inputTokens ?? data.input_tokens ?? data.promptTokens ?? data.prompt_tokens);
    const outputTokens = toNum(data.outputTokens ?? data.output_tokens ?? data.completionTokens ?? data.completion_tokens);
    const cacheReadTokens = toNum(data.cacheReadTokens ?? data.cache_read_tokens ?? data.cacheReadInputTokens);
    const cacheWriteTokens = toNum(data.cacheWriteTokens ?? data.cache_write_tokens ?? data.cacheCreationInputTokens);
    // Thinking tokens: Copilot SDK v0.1.x does not currently report these in
    // assistant.usage events. We check multiple possible field names so that if
    // a future SDK version adds support, we pick it up automatically.
    const thinkingTokens = toNum(data.thinkingTokens ?? data.thinking_tokens ?? data.reasoningTokens ?? data.reasoning_tokens ?? 0);
    const duration = toNum(data.duration ?? data.durationMs ?? data.duration_ms);
    const ttft = data.ttftMs ?? data.ttft_ms ?? data.timeToFirstToken;
    const model = (data.model ?? data.modelId ?? "") as string;

    // Accumulate
    accumulatedUsage.promptTokens += inputTokens;
    accumulatedUsage.completionTokens += outputTokens;
    accumulatedUsage.thinkingTokens += thinkingTokens;
    accumulatedUsage.cacheCreationTokens += cacheWriteTokens;
    accumulatedUsage.cacheReadTokens += cacheReadTokens;
    accumulatedUsage.totalTokens += inputTokens + outputTokens;
    accumulatedUsage.durationMs += duration;
    if (ttft != null && accumulatedUsage.ttftMs === null) {
      accumulatedUsage.ttftMs = toNum(ttft);
    }
    if (model) {
      accumulatedUsage.model = model;
    }
    if (inputTokens > 0 || outputTokens > 0) {
      accumulatedUsage.tokensAvailable = true;
    }

    // Fire-and-forget: log to DB + update aggregates
    const writePromise = (async () => {
      try {
        // Look up pricing for cost estimation
        const modelName = accumulatedUsage.model || "unknown";
        const pricing = await getPricing(modelName);
        const costUsd = pricing
          ? estimateCost(pricing, inputTokens, outputTokens, thinkingTokens, cacheWriteTokens, cacheReadTokens)
          : toNum(data.cost ?? data.estimatedCost ?? 0);

        accumulatedUsage.estimatedCostUsd += costUsd;

        // Insert per-request usage log
        await sql`
          INSERT INTO ai_usage_log (
            user_id, workspace_id, project_id, session_id,
            provider, provider_label, model, mode,
            prompt_tokens, completion_tokens, thinking_tokens,
            cached_tokens, total_tokens, tool_call_count,
            cache_creation_tokens, cache_read_tokens,
            estimated_cost_usd, duration_ms, ttft_ms,
            tokens_available, byok_provider_id, is_local
          ) VALUES (
            ${ctx.userId}, ${ctx.workspaceId}, ${ctx.projectId},
            ${ctx.sessionId ?? null},
            ${ctx.provider}, ${ctx.providerLabel},
            ${modelName}, ${ctx.mode ?? null},
            ${inputTokens}, ${outputTokens}, ${thinkingTokens},
            ${cacheReadTokens}, ${inputTokens + outputTokens},
            ${accumulatedUsage.toolCallCount},
            ${cacheWriteTokens}, ${cacheReadTokens},
            ${costUsd}, ${duration || null}, ${ttft != null ? toNum(ttft) : null},
            ${inputTokens > 0 || outputTokens > 0},
            ${ctx.byokProviderId ?? null}, ${ctx.isLocal ?? false}
          )
        `;

        // Update daily + monthly aggregates (fire-and-forget)
        await Promise.allSettled([
          upsertDailyAggregate(ctx, modelName, inputTokens, outputTokens, thinkingTokens, inputTokens + outputTokens, costUsd, duration, accumulatedUsage.toolCallCount),
          upsertMonthlyAggregate(ctx, modelName, inputTokens, outputTokens, thinkingTokens, inputTokens + outputTokens, costUsd, duration, accumulatedUsage.toolCallCount),
        ]);
      } catch (err) {
        // Usage logging must NEVER break chat — swallow errors
        console.warn("[UsageCollector] Failed to log usage:", err instanceof Error ? err.message : err);
      }
    })();

    pendingWrites.push(writePromise);
  }

  return {
    onUsageEvent,

    /**
     * Set the session ID after the collector is created.
     * Useful when the DB session isn't available at creation time.
     */
    setSessionId(id: string): void {
      ctx.sessionId = id;
    },

    /**
     * Get accumulated usage for the SSE done event payload.
     */
    getAccumulatedUsage(): AccumulatedUsage {
      return { ...accumulatedUsage };
    },

    /**
     * Wait for all pending DB writes to complete.
     * Call this before sending the final SSE done event.
     */
    async flush(): Promise<void> {
      await Promise.allSettled(pendingWrites);
      pendingWrites.length = 0;
    },
  };
}

// ─── Helpers ───────────────────────────────────────────────

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}
