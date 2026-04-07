/**
 * Usage Service — Token & Cost Tracking (PRD 20)
 *
 * Handles logging AI usage, calculating costs, and querying aggregates
 * for user/workspace dashboards.
 *
 * Key design decisions:
 * - logUsage() is fire-and-forget (never blocks chat response)
 * - Cost calculation uses multi-step model name resolution
 * - Daily aggregation uses INSERT ... ON CONFLICT DO UPDATE (upsert)
 */

import { sql } from "../db/index.js";

// ─── Types ─────────────────────────────────────────────

export interface UsageInsertParams {
  userId: string;
  workspaceId: string;
  projectId?: string;
  sessionId?: string;
  provider: "copilot" | "byok" | "local";
  providerLabel: string;
  model: string;
  mode?: string;
  promptTokens?: number;
  completionTokens?: number;
  thinkingTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  toolCallCount?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  estimatedCostUsd?: number;
  creditsConsumed?: number;
  durationMs?: number;
  ttftMs?: number;
  tokensAvailable?: boolean;
  byokProviderId?: string;
  isLocal?: boolean;
  error?: string;
}

export interface UsageSummary {
  requestCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  totalCostUsd: number;
  totalCredits: number;
  avgDurationMs: number;
  toolCallCount: number;
}

export interface UsagePeriod {
  period: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface UsageBreakdownItem {
  key: string;
  label?: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

// ─── Service ─────────────────────────────────────────────

export class UsageService {
  /**
   * Insert a usage log entry. Called after each AI request.
   * MUST be non-blocking -- fire-and-forget, don't slow down the chat response.
   */
  async logUsage(params: UsageInsertParams): Promise<void> {
    try {
      // Calculate cost if not provided but tokens are available
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
      // Usage logging failures should NEVER break the chat flow
      console.error("[UsageService] Failed to log usage:", err);
    }
  }

  /**
   * Calculate estimated cost from model_pricing table.
   * Multi-step model name resolution:
   * 1. Exact match on model_pricing.model_id
   * 2. Lowercase + strip provider prefix (e.g., "openrouter/anthropic/claude-3" -> "claude-3")
   * 3. Strip date suffix (e.g., "-20250514")
   * 4. Family prefix match (LIKE 'model%')
   * 5. Return null if no match (caller uses fallback)
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

      // Step 2: Dots to dashes (SDK reports "claude-opus-4.6", pricing uses "claude-opus-4-6")
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

      // Step 3: Strip date suffix (e.g., "-20250514", "-2025-05-14")
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

      // Step 4: Family prefix match (LIKE 'model%')
      if (!pricing) {
        // Take the first segment before any version/date suffix
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

      // Step 5: No match
      if (!pricing) return null;

      // Calculate cost in USD
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
   * Returns today, this week, and this month summaries.
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

    // Query ai_usage_log for the time range
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
      requestCount: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      thinkingTokens: 0,
      totalCostUsd: 0,
      totalCredits: 0,
      avgDurationMs: 0,
      toolCallCount: 0,
    });

    const today = emptySummary();
    const thisWeek = emptySummary();
    const thisMonth = emptySummary();

    for (const row of rows) {
      const ts = new Date(row.created_at);
      const bucket = ts >= todayStart ? today : ts >= weekStart ? thisWeek : thisMonth;
      // Also accumulate into broader buckets
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

    // Convert accumulated duration to average
    if (today.requestCount > 0) today.avgDurationMs = Math.round(today.avgDurationMs / today.requestCount);
    if (thisWeek.requestCount > 0) thisWeek.avgDurationMs = Math.round(thisWeek.avgDurationMs / thisWeek.requestCount);
    if (thisMonth.requestCount > 0) thisMonth.avgDurationMs = Math.round(thisMonth.avgDurationMs / thisMonth.requestCount);

    // Round cost to 6 decimal places
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

  /**
   * Get workspace usage summary for admin dashboard.
   */
  async getWorkspaceSummary(
    workspaceId: string,
    from?: Date,
    to?: Date,
  ): Promise<UsageSummary> {
    const now = new Date();
    const effectiveFrom = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const effectiveTo = to ?? now;

    const rows = await sql`
      SELECT
        COUNT(*)::int AS request_count,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
        COALESCE(SUM(thinking_tokens), 0)::bigint AS thinking_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COALESCE(SUM(credits_consumed), 0)::int AS total_credits,
        COALESCE(AVG(duration_ms), 0)::int AS avg_duration_ms,
        COALESCE(SUM(tool_call_count), 0)::int AS tool_call_count
      FROM ai_usage_log
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${effectiveFrom}
        AND created_at <= ${effectiveTo}
    `;

    const row = rows[0];
    if (!row) {
      return {
        requestCount: 0, totalTokens: 0, promptTokens: 0,
        completionTokens: 0, thinkingTokens: 0, totalCostUsd: 0,
        totalCredits: 0, avgDurationMs: 0, toolCallCount: 0,
      };
    }

    return {
      requestCount: Number(row.request_count),
      totalTokens: Number(row.total_tokens),
      promptTokens: Number(row.prompt_tokens),
      completionTokens: Number(row.completion_tokens),
      thinkingTokens: Number(row.thinking_tokens),
      totalCostUsd: Math.round(Number(row.total_cost_usd) * 1_000_000) / 1_000_000,
      totalCredits: Number(row.total_credits),
      avgDurationMs: Number(row.avg_duration_ms),
      toolCallCount: Number(row.tool_call_count),
    };
  }

  /**
   * Get per-member usage breakdown for admin dashboard.
   */
  async getMemberBreakdown(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      userId: string;
      email: string;
      displayName: string | null;
      requestCount: number;
      totalTokens: number;
      totalCostUsd: number;
    }>
  > {
    const rows = await sql`
      SELECT
        l.user_id,
        u.email,
        u.display_name,
        COUNT(*)::int AS request_count,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd
      FROM ai_usage_log l
      INNER JOIN users u ON u.id = l.user_id
      WHERE l.workspace_id = ${workspaceId}
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY l.user_id, u.email, u.display_name
      ORDER BY total_cost_usd DESC
    `;

    return rows.map((r) => ({
      userId: String(r.user_id),
      email: String(r.email),
      displayName: r.display_name ? String(r.display_name) : null,
      requestCount: Number(r.request_count),
      totalTokens: Number(r.total_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
    }));
  }

  /**
   * Get per-provider cost breakdown for admin dashboard.
   */
  async getProviderBreakdown(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      provider: string;
      providerLabel: string | null;
      requestCount: number;
      totalTokens: number;
      totalCostUsd: number;
      uniqueModels: number;
    }>
  > {
    const rows = await sql`
      SELECT
        provider,
        provider_label,
        COUNT(*)::int AS request_count,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COUNT(DISTINCT model)::int AS unique_models
      FROM ai_usage_log
      WHERE workspace_id = ${workspaceId}
        AND created_at >= ${from}
        AND created_at <= ${to}
      GROUP BY provider, provider_label
      ORDER BY total_cost_usd DESC
    `;

    return rows.map((r) => ({
      provider: String(r.provider),
      providerLabel: r.provider_label ? String(r.provider_label) : null,
      requestCount: Number(r.request_count),
      totalTokens: Number(r.total_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
      uniqueModels: Number(r.unique_models),
    }));
  }

  /**
   * Get hourly activity for a time range (for heatmap / hourly chart).
   */
  async getUserHourlyActivity(
    userId: string,
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<Array<{ hour: number; requestCount: number; totalTokens: number; totalCostUsd: number }>> {
    const rows = await sql`
      SELECT
        EXTRACT(HOUR FROM created_at)::int AS hour,
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

    // Fill in all 24 hours, zero-filling missing ones
    const hourMap = new Map(rows.map((r) => [Number(r.hour), r]));
    return Array.from({ length: 24 }, (_, h) => {
      const r = hourMap.get(h);
      return {
        hour: h,
        requestCount: r ? Number(r.request_count) : 0,
        totalTokens: r ? Number(r.total_tokens) : 0,
        totalCostUsd: r ? Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000 : 0,
      };
    });
  }

  /**
   * Get token split (prompt vs completion vs thinking) for a time range.
   */
  async getUserTokenSplit(
    userId: string,
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<{ promptTokens: number; completionTokens: number; thinkingTokens: number; cachedTokens: number }> {
    const [row] = await sql`
      SELECT
        COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
        COALESCE(SUM(thinking_tokens), 0)::bigint AS thinking_tokens,
        COALESCE(SUM(cached_tokens), 0)::bigint AS cached_tokens
      FROM ai_usage_log
      WHERE user_id = ${userId}
        AND workspace_id = ${workspaceId}
        AND created_at >= ${from}
        AND created_at <= ${to}
    `;
    return {
      promptTokens: Number(row?.prompt_tokens ?? 0),
      completionTokens: Number(row?.completion_tokens ?? 0),
      thinkingTokens: Number(row?.thinking_tokens ?? 0),
      cachedTokens: Number(row?.cached_tokens ?? 0),
    };
  }

  /**
   * Get credits consumed for the user in a workspace (today and this month).
   */
  async getUserCredits(
    userId: string,
    workspaceId: string,
  ): Promise<{ todayCredits: number; monthCredits: number; dailyLimit: number; monthlyLimit: number; planType: string }> {
    // Get balance info
    const [balance] = await sql`
      SELECT daily_credits, daily_credits_used, monthly_credits, monthly_credits_used, plan_type
      FROM credit_balances
      WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
    `;

    if (!balance) {
      return { todayCredits: 0, monthCredits: 0, dailyLimit: 5, monthlyLimit: 0, planType: "free" };
    }

    return {
      todayCredits: Number(balance.daily_credits_used),
      monthCredits: Number(balance.monthly_credits_used),
      dailyLimit: Number(balance.daily_credits),
      monthlyLimit: Number(balance.monthly_credits),
      planType: String(balance.plan_type),
    };
  }

  /**
   * Refresh daily aggregates for a given date.
   * Uses INSERT ... ON CONFLICT DO UPDATE (upsert pattern).
   * Should be called periodically (e.g., end of day or on-demand).
   */
  async refreshDailyAggregates(date: Date, workspaceId: string): Promise<void> {
    try {
      const dateStr = date.toISOString().split("T")[0]!;

      // Aggregate from ai_usage_log into ai_usage_daily
      // Use COALESCE on project_id to match the functional unique index (idx_daily_unique)
      // so that NULL project_id values are treated as equal and trigger the upsert.
      await sql`
        INSERT INTO ai_usage_daily (
          date, user_id, workspace_id, project_id, provider, model,
          request_count, total_prompt_tokens, total_completion_tokens,
          total_thinking_tokens, total_tokens, total_cost_usd,
          total_credits, total_duration_ms, avg_tokens_per_request, tool_call_count
        )
        SELECT
          ${dateStr}::date,
          user_id,
          workspace_id,
          project_id,
          provider,
          COALESCE(model, 'unknown'),
          COUNT(*)::int,
          COALESCE(SUM(prompt_tokens), 0)::bigint,
          COALESCE(SUM(completion_tokens), 0)::bigint,
          COALESCE(SUM(thinking_tokens), 0)::bigint,
          COALESCE(SUM(total_tokens), 0)::bigint,
          COALESCE(SUM(estimated_cost_usd), 0)::numeric,
          COALESCE(SUM(credits_consumed), 0)::int,
          COALESCE(SUM(duration_ms), 0)::bigint,
          CASE WHEN COUNT(*) > 0
            THEN (COALESCE(SUM(total_tokens), 0) / COUNT(*))::int
            ELSE 0 END,
          COALESCE(SUM(tool_call_count), 0)::int
        FROM ai_usage_log
        WHERE workspace_id = ${workspaceId}
          AND created_at >= ${dateStr}::date
          AND created_at < (${dateStr}::date + interval '1 day')
        GROUP BY user_id, workspace_id, project_id, provider, model
        ON CONFLICT (date, user_id, workspace_id, COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, model)
        DO UPDATE SET
          request_count = EXCLUDED.request_count,
          total_prompt_tokens = EXCLUDED.total_prompt_tokens,
          total_completion_tokens = EXCLUDED.total_completion_tokens,
          total_thinking_tokens = EXCLUDED.total_thinking_tokens,
          total_tokens = EXCLUDED.total_tokens,
          total_cost_usd = EXCLUDED.total_cost_usd,
          total_credits = EXCLUDED.total_credits,
          total_duration_ms = EXCLUDED.total_duration_ms,
          avg_tokens_per_request = EXCLUDED.avg_tokens_per_request,
          tool_call_count = EXCLUDED.tool_call_count
      `;
    } catch (err) {
      console.error("[UsageService] Failed to refresh daily aggregates:", err);
    }
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const usageService = new UsageService();
