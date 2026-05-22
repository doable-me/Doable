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
      sources: Array<{
        kind: "copilot" | "provider" | "direct";
        label: string;
        githubLogin: string | null;
        providerType: string | null;
        ownerEmail: string | null;
        ownerDisplayName: string | null;
        totalTokens: number;
        requestCount: number;
        models: Array<{ model: string; totalTokens: number; requestCount: number }>;
      }>;
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

    // Per user → per source (copilot account / byok provider / direct) → per model.
    // We dedupe copilot accounts by github_login and providers by (provider_type, label),
    // matching the grouping used in the Copilot / Custom Provider tabs.
    const sourceRows = await sql`
      SELECT
        l.user_id,
        CASE
          WHEN l.copilot_account_id IS NOT NULL THEN 'copilot'
          WHEN l.byok_provider_id   IS NOT NULL THEN 'provider'
          ELSE 'direct'
        END AS kind,
        gca.github_login,
        ap.provider_type::text AS provider_type,
        ap.label AS provider_label,
        gca.label AS copilot_label,
        owner.email AS owner_email,
        owner.display_name AS owner_display_name,
        l.model,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COUNT(*)::int AS request_count
      FROM ai_usage_log l
      LEFT JOIN github_copilot_accounts gca ON gca.id = l.copilot_account_id
      LEFT JOIN ai_providers ap ON ap.id = l.byok_provider_id
      LEFT JOIN users owner ON owner.id = COALESCE(gca.added_by, ap.added_by)
      WHERE l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY
        l.user_id,
        kind,
        gca.github_login,
        ap.provider_type,
        ap.label,
        gca.label,
        owner.email,
        owner.display_name,
        l.model
    `;

    type SourceEntry = {
      kind: "copilot" | "provider" | "direct";
      label: string;
      githubLogin: string | null;
      providerType: string | null;
      ownerEmail: string | null;
      ownerDisplayName: string | null;
      totalTokens: number;
      requestCount: number;
      modelsMap: Map<string, { model: string; totalTokens: number; requestCount: number }>;
    };
    const sourcesByUser = new Map<string, Map<string, SourceEntry>>();
    for (const row of sourceRows) {
      const userId = String(row.user_id);
      const kind = String(row.kind) as "copilot" | "provider" | "direct";
      const githubLogin = row.github_login ? String(row.github_login) : null;
      const providerType = row.provider_type ? String(row.provider_type) : null;
      const providerLabel = row.provider_label ? String(row.provider_label) : null;
      const copilotLabel = row.copilot_label ? String(row.copilot_label) : null;
      const model = row.model ? String(row.model) : "(unknown)";
      const tokens = Number(row.total_tokens);
      const reqs = Number(row.request_count);

      const label =
        kind === "copilot"
          ? copilotLabel || githubLogin || "Copilot"
          : kind === "provider"
            ? providerLabel || providerType || "Provider"
            : "Direct (no account)";
      const sourceKey =
        kind === "copilot"
          ? `copilot|${githubLogin ?? ""}`
          : kind === "provider"
            ? `provider|${providerType ?? ""}|${providerLabel ?? ""}`
            : "direct";

      let bySource = sourcesByUser.get(userId);
      if (!bySource) {
        bySource = new Map();
        sourcesByUser.set(userId, bySource);
      }
      let entry = bySource.get(sourceKey);
      if (!entry) {
        entry = {
          kind,
          label,
          githubLogin,
          providerType,
          ownerEmail: row.owner_email ? String(row.owner_email) : null,
          ownerDisplayName: row.owner_display_name ? String(row.owner_display_name) : null,
          totalTokens: 0,
          requestCount: 0,
          modelsMap: new Map(),
        };
        bySource.set(sourceKey, entry);
      }
      entry.totalTokens += tokens;
      entry.requestCount += reqs;

      const mk = entry.modelsMap.get(model);
      if (mk) {
        mk.totalTokens += tokens;
        mk.requestCount += reqs;
      } else {
        entry.modelsMap.set(model, { model, totalTokens: tokens, requestCount: reqs });
      }
    }

    return rows.map((r) => {
      const userId = String(r.user_id);
      const srcMap = sourcesByUser.get(userId);
      const sources = srcMap
        ? Array.from(srcMap.values())
            .map((s) => ({
              kind: s.kind,
              label: s.label,
              githubLogin: s.githubLogin,
              providerType: s.providerType,
              ownerEmail: s.ownerEmail,
              ownerDisplayName: s.ownerDisplayName,
              totalTokens: s.totalTokens,
              requestCount: s.requestCount,
              models: Array.from(s.modelsMap.values()).sort((a, b) => b.totalTokens - a.totalTokens),
            }))
            .sort((a, b) => b.totalTokens - a.totalTokens)
        : [];

      return {
        userId,
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
        sources,
      };
    });
  }

  /**
   * Get all copilot account usage across all workspaces, deduped by github_login.
   *
   * Each GitHub Copilot subscription (identified by `github_login`) may be
   * linked to multiple workspaces — we aggregate those together so admins see
   * one row per subscription instead of one row per (workspace, subscription).
   *
   * Per subscription we include:
   *   - list of workspace names the subscription is linked to
   *   - per-user breakdown, and within each user, which models they used
   *
   * For platform admins only.
   */
  async getPlatformCopilotAccountUsage(
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      githubLogin: string;
      label: string;
      workspaceNames: string[];
      workspaceCount: number;
      userCount: number;
      addedAt: string | null;
      owners: Array<{ email: string; displayName: string | null }>;
      users: Array<{
        userId: string;
        email: string;
        displayName: string | null;
        totalTokens: number;
        requestCount: number;
        models: Array<{ model: string; totalTokens: number; requestCount: number }>;
      }>;
      totalTokens: number;
      totalCostUsd: number;
      requestCount: number;
    }>
  > {
    // Aggregate per github_login (one row per actual Copilot subscription).
    const accountRows = await sql`
      SELECT
        gca.github_login,
        MAX(gca.label) AS label,
        MIN(gca.created_at) AS added_at,
        ARRAY_AGG(DISTINCT w.name ORDER BY w.name) AS workspace_names,
        COUNT(DISTINCT gca.id)::int AS workspace_count,
        COUNT(DISTINCT l.user_id)::int AS user_count,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COUNT(l.id)::int AS request_count
      FROM github_copilot_accounts gca
      INNER JOIN workspaces w ON w.id = gca.workspace_id
      LEFT JOIN ai_usage_log l ON l.copilot_account_id = gca.id
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY gca.github_login
      ORDER BY total_tokens DESC
    `;

    // Collect owners (added_by) per github_login — a subscription linked to
    // multiple workspaces may have been added by different users.
    const ownerRows = await sql`
      SELECT DISTINCT gca.github_login, owner.email, owner.display_name
      FROM github_copilot_accounts gca
      INNER JOIN users owner ON owner.id = gca.added_by
    `;
    const ownersByLogin = new Map<string, Array<{ email: string; displayName: string | null }>>();
    for (const row of ownerRows) {
      const login = String(row.github_login);
      if (!ownersByLogin.has(login)) ownersByLogin.set(login, []);
      ownersByLogin.get(login)!.push({
        email: String(row.email),
        displayName: row.display_name ? String(row.display_name) : null,
      });
    }

    // Per-user per-model breakdown, keyed by github_login.
    const userModelRows = await sql`
      SELECT
        gca.github_login,
        l.user_id, u.email, u.display_name,
        l.model,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COUNT(*)::int AS request_count
      FROM ai_usage_log l
      INNER JOIN github_copilot_accounts gca ON gca.id = l.copilot_account_id
      INNER JOIN users u ON u.id = l.user_id
      WHERE l.copilot_account_id IS NOT NULL
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY gca.github_login, l.user_id, u.email, u.display_name, l.model
      ORDER BY total_tokens DESC
    `;

    // Group (login → user_id → { user summary, models[] })
    type UserEntry = {
      userId: string;
      email: string;
      displayName: string | null;
      totalTokens: number;
      requestCount: number;
      models: Array<{ model: string; totalTokens: number; requestCount: number }>;
    };
    const usersByLogin = new Map<string, Map<string, UserEntry>>();
    for (const row of userModelRows) {
      const login = String(row.github_login);
      const userId = String(row.user_id);
      const tokens = Number(row.total_tokens);
      const reqs = Number(row.request_count);
      const model = row.model ? String(row.model) : "(unknown)";

      let byUser = usersByLogin.get(login);
      if (!byUser) {
        byUser = new Map();
        usersByLogin.set(login, byUser);
      }
      let entry = byUser.get(userId);
      if (!entry) {
        entry = {
          userId,
          email: String(row.email),
          displayName: row.display_name ? String(row.display_name) : null,
          totalTokens: 0,
          requestCount: 0,
          models: [],
        };
        byUser.set(userId, entry);
      }
      entry.totalTokens += tokens;
      entry.requestCount += reqs;
      entry.models.push({ model, totalTokens: tokens, requestCount: reqs });
    }

    return accountRows.map((r) => {
      const login = String(r.github_login);
      const userMap = usersByLogin.get(login);
      const users = userMap ? Array.from(userMap.values()) : [];
      users.sort((a, b) => b.totalTokens - a.totalTokens);
      for (const u of users) u.models.sort((a, b) => b.totalTokens - a.totalTokens);

      return {
        githubLogin: login,
        label: String(r.label ?? login),
        workspaceNames: (r.workspace_names as string[]) ?? [],
        workspaceCount: Number(r.workspace_count),
        userCount: Number(r.user_count),
        addedAt: r.added_at ? new Date(r.added_at).toISOString() : null,
        owners: ownersByLogin.get(login) ?? [],
        users,
        totalTokens: Number(r.total_tokens),
        totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
        requestCount: Number(r.request_count),
      };
    });
  }

  /**
   * Get all custom (BYOK) provider usage across all workspaces, grouped
   * by (provider_type, label). Mirror of Copilot-account breakdown.
   *
   * For platform admins only.
   */
  async getPlatformCustomProviderUsage(
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      providerType: string;
      label: string;
      workspaceNames: string[];
      workspaceCount: number;
      userCount: number;
      addedAt: string | null;
      owners: Array<{ email: string; displayName: string | null }>;
      users: Array<{
        userId: string;
        email: string;
        displayName: string | null;
        totalTokens: number;
        requestCount: number;
        models: Array<{ model: string; totalTokens: number; requestCount: number }>;
      }>;
      totalTokens: number;
      totalCostUsd: number;
      requestCount: number;
    }>
  > {
    const providerRows = await sql`
      SELECT
        ap.provider_type::text AS provider_type,
        ap.label,
        MIN(ap.created_at) AS added_at,
        ARRAY_AGG(DISTINCT w.name ORDER BY w.name) AS workspace_names,
        COUNT(DISTINCT ap.id)::int AS workspace_count,
        COUNT(DISTINCT l.user_id)::int AS user_count,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd,
        COUNT(l.id)::int AS request_count
      FROM ai_providers ap
      INNER JOIN workspaces w ON w.id = ap.workspace_id
      LEFT JOIN ai_usage_log l ON l.byok_provider_id = ap.id
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY ap.provider_type, ap.label
      ORDER BY total_tokens DESC
    `;

    const ownerRows = await sql`
      SELECT DISTINCT ap.provider_type::text AS provider_type, ap.label,
                      owner.email, owner.display_name
      FROM ai_providers ap
      INNER JOIN users owner ON owner.id = ap.added_by
    `;
    const ownersByKey = new Map<string, Array<{ email: string; displayName: string | null }>>();
    for (const row of ownerRows) {
      const key = `${String(row.provider_type)}|${String(row.label)}`;
      if (!ownersByKey.has(key)) ownersByKey.set(key, []);
      ownersByKey.get(key)!.push({
        email: String(row.email),
        displayName: row.display_name ? String(row.display_name) : null,
      });
    }

    const userModelRows = await sql`
      SELECT
        ap.provider_type::text AS provider_type,
        ap.label,
        l.user_id, u.email, u.display_name,
        l.model,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COUNT(*)::int AS request_count
      FROM ai_usage_log l
      INNER JOIN ai_providers ap ON ap.id = l.byok_provider_id
      INNER JOIN users u ON u.id = l.user_id
      WHERE l.byok_provider_id IS NOT NULL
        AND l.created_at >= ${from}
        AND l.created_at <= ${to}
      GROUP BY ap.provider_type, ap.label, l.user_id, u.email, u.display_name, l.model
      ORDER BY total_tokens DESC
    `;

    type UserEntry = {
      userId: string;
      email: string;
      displayName: string | null;
      totalTokens: number;
      requestCount: number;
      models: Array<{ model: string; totalTokens: number; requestCount: number }>;
    };
    const usersByProvider = new Map<string, Map<string, UserEntry>>();
    for (const row of userModelRows) {
      const key = `${String(row.provider_type)}|${String(row.label)}`;
      const userId = String(row.user_id);
      const tokens = Number(row.total_tokens);
      const reqs = Number(row.request_count);
      const model = row.model ? String(row.model) : "(unknown)";

      let byUser = usersByProvider.get(key);
      if (!byUser) {
        byUser = new Map();
        usersByProvider.set(key, byUser);
      }
      let entry = byUser.get(userId);
      if (!entry) {
        entry = {
          userId,
          email: String(row.email),
          displayName: row.display_name ? String(row.display_name) : null,
          totalTokens: 0,
          requestCount: 0,
          models: [],
        };
        byUser.set(userId, entry);
      }
      entry.totalTokens += tokens;
      entry.requestCount += reqs;
      entry.models.push({ model, totalTokens: tokens, requestCount: reqs });
    }

    return providerRows.map((r) => {
      const key = `${String(r.provider_type)}|${String(r.label)}`;
      const userMap = usersByProvider.get(key);
      const users = userMap ? Array.from(userMap.values()) : [];
      users.sort((a, b) => b.totalTokens - a.totalTokens);
      for (const u of users) u.models.sort((a, b) => b.totalTokens - a.totalTokens);

      return {
        providerType: String(r.provider_type),
        label: String(r.label),
        workspaceNames: (r.workspace_names as string[]) ?? [],
        workspaceCount: Number(r.workspace_count),
        userCount: Number(r.user_count),
        addedAt: r.added_at ? new Date(r.added_at).toISOString() : null,
        owners: ownersByKey.get(key) ?? [],
        users,
        totalTokens: Number(r.total_tokens),
        totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
        requestCount: Number(r.request_count),
      };
    });
  }

  /**
   * Get platform-wide model usage breakdown.
   * Shows which models are used across the platform, with per-user breakdown.
   */
  async getPlatformModelBreakdown(
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      model: string;
      provider: string | null;
      totalTokens: number;
      totalCostUsd: number;
      requestCount: number;
      userCount: number;
      users: Array<{
        userId: string;
        email: string;
        displayName: string | null;
        workspaceName: string;
        totalTokens: number;
        requestCount: number;
      }>;
    }>
  > {
    // Aggregate per model
    const modelRows = await sql`
      SELECT
        l.model, l.provider,
        COUNT(*)::int AS request_count,
        COUNT(DISTINCT l.user_id)::int AS user_count,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(l.estimated_cost_usd), 0)::numeric AS total_cost_usd
      FROM ai_usage_log l
      WHERE l.created_at >= ${from}
        AND l.created_at <= ${to}
        AND l.model IS NOT NULL
      GROUP BY l.model, l.provider
      ORDER BY total_tokens DESC
    `;

    // Per-user per-model breakdown
    const userRows = await sql`
      SELECT
        l.model, l.user_id, u.email, u.display_name, w.name AS workspace_name,
        COALESCE(SUM(l.total_tokens), 0)::bigint AS total_tokens,
        COUNT(*)::int AS request_count
      FROM ai_usage_log l
      INNER JOIN users u ON u.id = l.user_id
      INNER JOIN workspaces w ON w.id = l.workspace_id
      WHERE l.created_at >= ${from}
        AND l.created_at <= ${to}
        AND l.model IS NOT NULL
      GROUP BY l.model, l.user_id, u.email, u.display_name, w.name
      ORDER BY total_tokens DESC
    `;

    const usersByModel = new Map<
      string,
      Array<{ userId: string; email: string; displayName: string | null; workspaceName: string; totalTokens: number; requestCount: number }>
    >();
    for (const row of userRows) {
      const model = String(row.model);
      if (!usersByModel.has(model)) usersByModel.set(model, []);
      usersByModel.get(model)!.push({
        userId: String(row.user_id),
        email: String(row.email),
        displayName: row.display_name ? String(row.display_name) : null,
        workspaceName: String(row.workspace_name),
        totalTokens: Number(row.total_tokens),
        requestCount: Number(row.request_count),
      });
    }

    return modelRows.map((r) => ({
      model: String(r.model),
      provider: r.provider ? String(r.provider) : null,
      totalTokens: Number(r.total_tokens),
      totalCostUsd: Math.round(Number(r.total_cost_usd) * 1_000_000) / 1_000_000,
      requestCount: Number(r.request_count),
      userCount: Number(r.user_count),
      users: usersByModel.get(String(r.model)) ?? [],
    }));
  }
}

// ─── Singleton ─────────────────────────────────────────────

export const usageService = new UsageService();
