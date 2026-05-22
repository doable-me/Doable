/**
 * Usage Service — Core: logging + cost calculation + user queries
 */

import { sql } from "../db/index.js";
import type { UsageInsertParams, UsageSummary, UsagePeriod, UsageBreakdownItem } from "./usage-types.js";

export class UsageServiceBase {
  /**
   * Insert a usage log entry. Called after each AI request.
   * MUST be non-blocking -- fire-and-forget, don't slow down the chat response.
   */
  async logUsage(params: UsageInsertParams): Promise<void> {
    try {
      let estimatedCost = params.estimatedCostUsd;
      if (estimatedCost === undefined && params.tokensAvailable !== false && params.model) {
        estimatedCost =
          (await this.calculateCost(
            params.model,
            params.promptTokens ?? 0,
            params.completionTokens ?? 0,
            params.cacheCreationTokens,
            params.cacheReadTokens,
          )) ?? undefined;
      }

      await sql`
        INSERT INTO ai_usage_log (
          user_id, workspace_id, project_id, session_id,
          provider, provider_label, model, mode,
          prompt_tokens, completion_tokens, thinking_tokens, cached_tokens,
          total_tokens, tool_call_count, cache_creation_tokens, cache_read_tokens,
          estimated_cost_usd, credits_consumed, duration_ms, ttft_ms,
          tokens_available, byok_provider_id, is_local, error
        ) VALUES (
          ${params.userId},
          ${params.workspaceId},
          ${params.projectId ?? null},
          ${params.sessionId ?? null},
          ${params.provider},
          ${params.providerLabel},
          ${params.model},
          ${params.mode ?? null},
          ${params.promptTokens ?? null},
          ${params.completionTokens ?? null},
          ${params.thinkingTokens ?? null},
          ${params.cachedTokens ?? null},
          ${params.totalTokens ?? null},
          ${params.toolCallCount ?? 0},
          ${params.cacheCreationTokens ?? null},
          ${params.cacheReadTokens ?? null},
          ${estimatedCost ?? null},
          ${params.creditsConsumed ?? 0},
          ${params.durationMs ?? null},
          ${params.ttftMs ?? null},
          ${params.tokensAvailable ?? true},
          ${params.byokProviderId ?? null},
          ${params.isLocal ?? false},
          ${params.error ?? null}
        )
      `;
    } catch (err) {
      console.error("[UsageService] Failed to log usage:", err);
    }
  }

  /**
   * Calculate estimated cost from model_pricing table.
   * Multi-step model name resolution.
   */
  async calculateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    cacheCreationTokens?: number,
    cacheReadTokens?: number,
  ): Promise<number | null> {
    try {
      // Step 1: Exact match
      let [pricing] = await sql`
        SELECT input_cost_per_1m, output_cost_per_1m,
               cache_creation_cost_per_1m, cache_read_cost_per_1m
        FROM model_pricing
        WHERE model_id = ${model} AND is_active = true
      `;

      // Step 2: Dots to dashes
      if (!pricing) {
        const dotNormalized = model.replace(/\./g, "-");
        if (dotNormalized !== model) {
          [pricing] = await sql`
            SELECT input_cost_per_1m, output_cost_per_1m,
                   cache_creation_cost_per_1m, cache_read_cost_per_1m
            FROM model_pricing
            WHERE model_id = ${dotNormalized} AND is_active = true
          `;
        }
      }

      // Step 3: Lowercase + strip provider prefix
      if (!pricing) {
        const normalized = model.toLowerCase().split("/").pop() ?? model.toLowerCase();
        [pricing] = await sql`
          SELECT input_cost_per_1m, output_cost_per_1m,
                 cache_creation_cost_per_1m, cache_read_cost_per_1m
          FROM model_pricing
          WHERE model_id = ${normalized} AND is_active = true
        `;
      }

      // Step 3b: Strip date suffix
      if (!pricing) {
        const stripped = model.replace(/-\d{4,8}(-\d{2}(-\d{2})?)?$/, "").toLowerCase();
        if (stripped !== model.toLowerCase()) {
          [pricing] = await sql`
            SELECT input_cost_per_1m, output_cost_per_1m,
                   cache_creation_cost_per_1m, cache_read_cost_per_1m
            FROM model_pricing
            WHERE model_id = ${stripped} AND is_active = true
          `;
        }
      }

      // Step 4: Family prefix match
      if (!pricing) {
        const family = model.toLowerCase().split("/").pop()?.replace(/-\d.*$/, "") ?? "";
        if (family.length >= 3) {
          [pricing] = await sql`
            SELECT input_cost_per_1m, output_cost_per_1m,
                   cache_creation_cost_per_1m, cache_read_cost_per_1m
            FROM model_pricing
            WHERE model_id LIKE ${family + "%"} AND is_active = true
            ORDER BY model_id ASC
            LIMIT 1
          `;
        }
      }

      if (!pricing) return null;

      const inputCost = (promptTokens / 1_000_000) * Number(pricing.input_cost_per_1m);
      const outputCost = (completionTokens / 1_000_000) * Number(pricing.output_cost_per_1m);

      let cacheCost = 0;
      if (cacheCreationTokens && pricing.cache_creation_cost_per_1m) {
        cacheCost += (cacheCreationTokens / 1_000_000) * Number(pricing.cache_creation_cost_per_1m);
      }
      if (cacheReadTokens && pricing.cache_read_cost_per_1m) {
        cacheCost += (cacheReadTokens / 1_000_000) * Number(pricing.cache_read_cost_per_1m);
      }

      return Math.round((inputCost + outputCost + cacheCost) * 1_000_000) / 1_000_000;
    } catch (err) {
      console.error("[UsageService] Failed to calculate cost:", err);
      return null;
    }
  }

  /**
   * Get user usage summary for dashboard.
   */
  async getUserSummary(
    userId: string,
    workspaceId: string,
    from?: Date,
    to?: Date,
  ): Promise<{
    today: UsageSummary;
    thisWeek: UsageSummary;
    thisMonth: UsageSummary;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const effectiveFrom = from ?? monthStart;
    const effectiveTo = to ?? now;

    const rows = await sql`
      SELECT
        created_at,
        COALESCE(prompt_tokens, 0)::int AS prompt_tokens,
        COALESCE(completion_tokens, 0)::int AS completion_tokens,
        COALESCE(thinking_tokens, 0)::int AS thinking_tokens,
        COALESCE(total_tokens, 0)::int AS total_tokens,
        COALESCE(estimated_cost_usd, 0)::numeric AS estimated_cost_usd,
        COALESCE(credits_consumed, 0)::int AS credits_consumed,
        COALESCE(duration_ms, 0)::int AS duration_ms,
        COALESCE(tool_call_count, 0)::int AS tool_call_count
      FROM ai_usage_log
      WHERE user_id = ${userId}
        AND workspace_id = ${workspaceId}
        AND created_at >= ${effectiveFrom}
        AND created_at <= ${effectiveTo}
      ORDER BY created_at DESC
    `;

    const emptySummary = (): UsageSummary => ({
      requestCount: 0, totalTokens: 0, promptTokens: 0,
      completionTokens: 0, thinkingTokens: 0, totalCostUsd: 0,
      totalCredits: 0, avgDurationMs: 0, toolCallCount: 0,
    });

    const today = emptySummary();
    const thisWeek = emptySummary();
    const thisMonth = emptySummary();

    for (const row of rows) {
      const ts = new Date(row.created_at);
      const buckets = [thisMonth];
      if (ts >= weekStart) buckets.push(thisWeek);
      if (ts >= todayStart) buckets.push(today);

      for (const b of buckets) {
        b.requestCount++;
        b.totalTokens += Number(row.total_tokens);
        b.promptTokens += Number(row.prompt_tokens);
        b.completionTokens += Number(row.completion_tokens);
        b.thinkingTokens += Number(row.thinking_tokens);
        b.totalCostUsd += Number(row.estimated_cost_usd);
        b.totalCredits += Number(row.credits_consumed);
        b.avgDurationMs += Number(row.duration_ms);
        b.toolCallCount += Number(row.tool_call_count);
      }
    }

    if (today.requestCount > 0) today.avgDurationMs = Math.round(today.avgDurationMs / today.requestCount);
    if (thisWeek.requestCount > 0) thisWeek.avgDurationMs = Math.round(thisWeek.avgDurationMs / thisWeek.requestCount);
    if (thisMonth.requestCount > 0) thisMonth.avgDurationMs = Math.round(thisMonth.avgDurationMs / thisMonth.requestCount);

    today.totalCostUsd = Math.round(today.totalCostUsd * 1_000_000) / 1_000_000;
    thisWeek.totalCostUsd = Math.round(thisWeek.totalCostUsd * 1_000_000) / 1_000_000;
    thisMonth.totalCostUsd = Math.round(thisMonth.totalCostUsd * 1_000_000) / 1_000_000;

    return { today, thisWeek, thisMonth };
  }

  /**
   * Get usage over time, grouped by day/week/month.
   */
  async getUserHistory(
    userId: string,
    workspaceId: string,
    from: Date,
    to: Date,
    groupBy: "day" | "week" | "month" = "day",
  ): Promise<UsagePeriod[]> {
    const truncFn = groupBy === "month" ? "month" : groupBy === "week" ? "week" : "day";

    const rows = await sql`
      SELECT
        date_trunc(${truncFn}, created_at)::date AS period,
        COUNT(*)::int AS request_count,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_cost_usd
      FROM ai_usage_log
      WHERE user_id = ${userId}
        AND workspace_id = ${workspaceId}
        AND created_at >= ${from}
        AND created_at <= ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((r) => ({
      period: String(r.period),
      requestCount: Number(r.request_count),
      totalTokens: Number(r.total_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
    }));
  }

  /**
   * Get usage breakdown by project, model, and mode.
   */
  async getUserBreakdown(
    userId: string,
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<{
    byProject: UsageBreakdownItem[];
    byModel: UsageBreakdownItem[];
    byMode: UsageBreakdownItem[];
  }> {
    const [byProject, byModel, byMode] = await Promise.all([
      sql`
        SELECT
          COALESCE(l.project_id::text, 'no-project') AS key,
          p.name AS label,
          COUNT(*)::int AS request_count,
          COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
          COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd
        FROM ai_usage_log l
        LEFT JOIN projects p ON p.id = l.project_id
        WHERE l.user_id = ${userId}
          AND l.workspace_id = ${workspaceId}
          AND l.created_at >= ${from}
          AND l.created_at <= ${to}
        GROUP BY l.project_id, p.name
        ORDER BY total_cost_usd DESC
        LIMIT 50
      `,
      sql`
        SELECT
          COALESCE(model, 'unknown') AS key,
          COUNT(*)::int AS request_count,
          COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
          COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_cost_usd
        FROM ai_usage_log
        WHERE user_id = ${userId}
          AND workspace_id = ${workspaceId}
          AND created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY model
        ORDER BY total_cost_usd DESC
        LIMIT 50
      `,
      sql`
        SELECT
          COALESCE(mode, 'default') AS key,
          COUNT(*)::int AS request_count,
          COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
          COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_cost_usd
        FROM ai_usage_log
        WHERE user_id = ${userId}
          AND workspace_id = ${workspaceId}
          AND created_at >= ${from}
          AND created_at <= ${to}
        GROUP BY mode
        ORDER BY total_cost_usd DESC
      `,
    ]);

    const mapItems = (rows: typeof byProject): UsageBreakdownItem[] =>
      rows.map((r) => ({
        key: String(r.key),
        label: r.label ? String(r.label) : undefined,
        requestCount: Number(r.request_count),
        totalTokens: Number(r.total_tokens),
        totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
      }));

    return {
      byProject: mapItems(byProject),
      byModel: mapItems(byModel),
      byMode: mapItems(byMode),
    };
  }
}
