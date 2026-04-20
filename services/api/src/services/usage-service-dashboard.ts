/**
 * Usage Service — Dashboard/admin queries + singleton
 */

import { sql } from "../db/index.js";
import type { UsageSummary } from "./usage-types.js";
import { UsageServiceBase } from "./usage-service-core.js";

export class UsageService extends UsageServiceBase {
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
      userId: string; email: string; displayName: string | null;
      requestCount: number; totalTokens: number; totalCostUsd: number;
    }>
  > {
    const rows = await sql`
      SELECT
        l.user_id, u.email, u.display_name,
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
      provider: string; providerLabel: string | null;
      requestCount: number; totalTokens: number;
      totalCostUsd: number; uniqueModels: number;
    }>
  > {
    const rows = await sql`
      SELECT
        provider, provider_label,
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
   * Get hourly activity for a time range.
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
   * Get token split for a time range.
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
   * Get credits consumed for the user in a workspace.
   */
  async getUserCredits(
    userId: string,
    workspaceId: string,
  ): Promise<{ todayCredits: number; monthCredits: number; dailyLimit: number; monthlyLimit: number; planType: string }> {
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
   */
  async refreshDailyAggregates(date: Date, workspaceId: string): Promise<void> {
    try {
      const dateStr = date.toISOString().split("T")[0]!;

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

  /**
   * Get per-member model usage breakdown (admin dashboard).
   * Shows which models each user has used with token counts.
   */
  async getMemberModelBreakdown(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      userId: string;
      email: string;
      displayName: string | null;
      model: string;
      requestCount: number;
      totalTokens: number;
      totalCostUsd: number;
    }>
  > {
    const rows = await sql`
      SELECT
        l.user_id, u.email, u.display_name, l.model,
        COUNT(*)::int AS request_count,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd
      FROM ai_usage_log l
      INNER JOIN users u ON u.id = l.user_id
      WHERE l.workspace_id = ${workspaceId}
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
        AND l.model IS NOT NULL
      GROUP BY l.user_id, u.email, u.display_name, l.model
      ORDER BY total_tokens DESC
    `;

    return rows.map((r) => ({
      userId: String(r.user_id),
      email: String(r.email),
      displayName: r.display_name ? String(r.display_name) : null,
      model: String(r.model),
      requestCount: Number(r.request_count),
      totalTokens: Number(r.total_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
    }));
  }

  /**
   * Get copilot account usage breakdown (admin dashboard).
   * Shows which GitHub Copilot accounts were used by whom.
   */
  async getCopilotAccountBreakdown(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      copilotAccountId: string;
      label: string;
      githubLogin: string;
      userId: string;
      userEmail: string;
      userDisplayName: string | null;
      requestCount: number;
      totalTokens: number;
      totalCostUsd: number;
    }>
  > {
    const rows = await sql`
      SELECT
        l.copilot_account_id, gca.label, gca.github_login,
        l.user_id, u.email AS user_email, u.display_name AS user_display_name,
        COUNT(*)::int AS request_count,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd
      FROM ai_usage_log l
      INNER JOIN users u ON u.id = l.user_id
      INNER JOIN github_copilot_accounts gca ON gca.id = l.copilot_account_id
      WHERE l.workspace_id = ${workspaceId}
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
        AND l.copilot_account_id IS NOT NULL
      GROUP BY l.copilot_account_id, gca.label, gca.github_login, l.user_id, u.email, u.display_name
      ORDER BY total_cost_usd DESC
    `;

    return rows.map((r) => ({
      copilotAccountId: String(r.copilot_account_id),
      label: String(r.label),
      githubLogin: String(r.github_login),
      userId: String(r.user_id),
      userEmail: String(r.user_email),
      userDisplayName: r.user_display_name ? String(r.user_display_name) : null,
      requestCount: Number(r.request_count),
      totalTokens: Number(r.total_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
    }));
  }

  /**
   * Get top token consumers (admin dashboard).
   * Returns users sorted by token consumption.
   */
  async getTopTokenConsumers(
    workspaceId: string,
    from: Date,
    to: Date,
    limit: number = 10,
  ): Promise<
    Array<{
      userId: string;
      email: string;
      displayName: string | null;
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      thinkingTokens: number;
      totalCostUsd: number;
      requestCount: number;
    }>
  > {
    const rows = await sql`
      SELECT
        l.user_id, u.email, u.display_name,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens,
        COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens,
        COALESCE(SUM(l.thinking_tokens), 0)::bigint AS thinking_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COUNT(*)::int AS request_count
      FROM ai_usage_log l
      INNER JOIN users u ON u.id = l.user_id
      WHERE l.workspace_id = ${workspaceId}
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY l.user_id, u.email, u.display_name
      ORDER BY total_tokens DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      userId: String(r.user_id),
      email: String(r.email),
      displayName: r.display_name ? String(r.display_name) : null,
      totalTokens: Number(r.total_tokens),
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      thinkingTokens: Number(r.thinking_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
      requestCount: Number(r.request_count),
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PLATFORM-WIDE QUERIES (for platform admins - cross-workspace visibility)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get platform-wide usage summary (all workspaces).
   * For platform admins only.
   */
  async getPlatformSummary(from?: Date, to?: Date): Promise<UsageSummary & { workspaceCount: number; userCount: number }> {
    const now = new Date();
    const effectiveFrom = from ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const effectiveTo = to ?? now;

    const [row] = await sql`
      SELECT
        COUNT(*)::int AS request_count,
        COALESCE(SUM(total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(prompt_tokens), 0)::bigint AS prompt_tokens,
        COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
        COALESCE(SUM(thinking_tokens), 0)::bigint AS thinking_tokens,
        COALESCE(SUM(estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COALESCE(SUM(credits_consumed), 0)::int AS total_credits,
        COALESCE(AVG(duration_ms), 0)::int AS avg_duration_ms,
        COALESCE(SUM(tool_call_count), 0)::int AS tool_call_count,
        COUNT(DISTINCT workspace_id)::int AS workspace_count,
        COUNT(DISTINCT user_id)::int AS user_count
      FROM ai_usage_log
      WHERE created_at >= ${effectiveFrom}
        AND created_at <= ${effectiveTo}
    `;

    return {
      requestCount: Number(row?.request_count ?? 0),
      totalTokens: Number(row?.total_tokens ?? 0),
      promptTokens: Number(row?.prompt_tokens ?? 0),
      completionTokens: Number(row?.completion_tokens ?? 0),
      thinkingTokens: Number(row?.thinking_tokens ?? 0),
      totalCostUsd: Math.round(Number(row?.total_cost_usd ?? 0) * 1_000_000) / 1_000_000,
      totalCredits: Number(row?.total_credits ?? 0),
      avgDurationMs: Number(row?.avg_duration_ms ?? 0),
      toolCallCount: Number(row?.tool_call_count ?? 0),
      workspaceCount: Number(row?.workspace_count ?? 0),
      userCount: Number(row?.user_count ?? 0),
    };
  }

  /**
   * Get all users across all workspaces with their usage.
   * For platform admins only.
   */
  async getPlatformUserBreakdown(
    from: Date,
    to: Date,
    limit: number = 50,
  ): Promise<
    Array<{
      userId: string;
      email: string;
      displayName: string | null;
      workspaceId: string;
      workspaceName: string;
      totalTokens: number;
      promptTokens: number;
      completionTokens: number;
      totalCostUsd: number;
      requestCount: number;
      lastUsedAt: string;
    }>
  > {
    const rows = await sql`
      SELECT
        l.user_id, u.email, u.display_name,
        l.workspace_id, w.name AS workspace_name,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.prompt_tokens), 0)::bigint AS prompt_tokens,
        COALESCE(SUM(l.completion_tokens), 0)::bigint AS completion_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COUNT(*)::int AS request_count,
        MAX(l.created_at) AS last_used_at
      FROM ai_usage_log l
      INNER JOIN users u ON u.id = l.user_id
      INNER JOIN workspaces w ON w.id = l.workspace_id
      WHERE l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY l.user_id, u.email, u.display_name, l.workspace_id, w.name
      ORDER BY total_tokens DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      userId: String(r.user_id),
      email: String(r.email),
      displayName: r.display_name ? String(r.display_name) : null,
      workspaceId: String(r.workspace_id),
      workspaceName: String(r.workspace_name),
      totalTokens: Number(r.total_tokens),
      promptTokens: Number(r.prompt_tokens),
      completionTokens: Number(r.completion_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
      requestCount: Number(r.request_count),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : "",
    }));
  }

  /**
   * Get all copilot account usage across all workspaces.
   * For platform admins only.
   */
  async getPlatformCopilotAccountUsage(
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      copilotAccountId: string;
      label: string;
      githubLogin: string;
      workspaceId: string;
      workspaceName: string;
      userCount: number;
      users: Array<{ userId: string; email: string; displayName: string | null; totalTokens: number; requestCount: number }>;
      totalTokens: number;
      totalCostUsd: number;
      requestCount: number;
    }>
  > {
    // Get all copilot accounts with aggregates
    const accountRows = await sql`
      SELECT
        gca.id AS copilot_account_id, gca.label, gca.github_login,
        gca.workspace_id, w.name AS workspace_name,
        COUNT(DISTINCT l.user_id)::int AS user_count,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COUNT(l.id)::int AS request_count
      FROM github_copilot_accounts gca
      INNER JOIN workspaces w ON w.id = gca.workspace_id
      LEFT JOIN ai_usage_log l ON l.copilot_account_id = gca.id
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY gca.id, gca.label, gca.github_login, gca.workspace_id, w.name
      ORDER BY total_tokens DESC
    `;

    // Get per-user breakdown for each copilot account
    const userRows = await sql`
      SELECT
        l.copilot_account_id,
        l.user_id, u.email, u.display_name,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COUNT(*)::int AS request_count
      FROM ai_usage_log l
      INNER JOIN users u ON u.id = l.user_id
      WHERE l.copilot_account_id IS NOT NULL
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY l.copilot_account_id, l.user_id, u.email, u.display_name
      ORDER BY total_tokens DESC
    `;

    // Group users by copilot account
    const usersByAccount = new Map<string, Array<{ userId: string; email: string; displayName: string | null; totalTokens: number; requestCount: number }>>();
    for (const row of userRows) {
      const accountId = String(row.copilot_account_id);
      if (!usersByAccount.has(accountId)) usersByAccount.set(accountId, []);
      usersByAccount.get(accountId)!.push({
        userId: String(row.user_id),
        email: String(row.email),
        displayName: row.display_name ? String(row.display_name) : null,
        totalTokens: Number(row.total_tokens),
        requestCount: Number(row.request_count),
      });
    }

    return accountRows.map((r) => ({
      copilotAccountId: String(r.copilot_account_id),
      label: String(r.label),
      githubLogin: String(r.github_login),
      workspaceId: String(r.workspace_id),
      workspaceName: String(r.workspace_name),
      userCount: Number(r.user_count),
      users: usersByAccount.get(String(r.copilot_account_id)) ?? [],
      totalTokens: Number(r.total_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
      requestCount: Number(r.request_count),
    }));
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const usageService = new UsageService();
