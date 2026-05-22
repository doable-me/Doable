import type postgres from "postgres";
import { PLAN_LIMITS } from "@doable/shared";
import type { WorkspacePlan } from "@doable/shared";
import type { CreditBalanceSummary, CreditBalanceRow, ConsumeCreditsMetadata, CreditUsageLogRow } from "./credits-types.js";
export * from "./credits-types.js";

// ─── Queries ─────────────────────────────────────────────────

export function creditQueries(sql: postgres.Sql) {
  return {
    /**
     * Get the current credit balance for a user in a workspace.
     * Auto-initializes if no balance row exists.
     * Auto-resets daily credits if the reset time has passed.
     */
    async getCreditBalance(
      userId: string,
      workspaceId: string
    ): Promise<CreditBalanceSummary> {
      let [balance] = await sql<CreditBalanceRow[]>`
        SELECT * FROM credit_balances
        WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
      `;

      // Auto-initialize if not found
      if (!balance) {
        // Look up workspace plan
        const [workspace] = await sql<[{ plan: string }]>`
          SELECT plan FROM workspaces WHERE id = ${workspaceId}
        `;
        const planType = (workspace?.plan ?? "free") as WorkspacePlan;
        balance = await this.initializeCreditBalance(userId, workspaceId, planType);
      }

      // Auto-reset daily credits if past reset time
      const now = new Date();
      if (balance.daily_reset_at <= now) {
        balance = await this._resetDailyForUser(userId, workspaceId, balance.daily_credits);
      }

      // Auto-reset monthly credits if past reset time
      if (balance.monthly_reset_at <= now) {
        balance = await this._resetMonthlyForUser(userId, workspaceId, balance.monthly_credits);
      }

      const dailyRemaining = Math.max(0, balance.daily_credits - balance.daily_credits_used);
      const monthlyRemaining = Math.max(0, balance.monthly_credits - balance.monthly_credits_used);

      return {
        daily_remaining: dailyRemaining,
        daily_total: balance.daily_credits,
        monthly_remaining: monthlyRemaining,
        monthly_total: balance.monthly_credits,
        rollover_credits: balance.rollover_credits,
        total_available: dailyRemaining + monthlyRemaining + balance.rollover_credits,
        daily_reset_at: balance.daily_reset_at,
        monthly_reset_at: balance.monthly_reset_at,
        plan_type: balance.plan_type,
      };
    },

    /**
     * Consume credits from a user's balance. Deducts from daily first,
     * then monthly, then rollover. Returns success/failure and remaining.
     */
    async consumeCredits(
      userId: string,
      workspaceId: string,
      amount: number,
      metadata: ConsumeCreditsMetadata
    ): Promise<{ success: boolean; remaining: number }> {
      return sql.begin(async (_tx) => {
        const tx = _tx as unknown as postgres.Sql;
        // Lock the row for update
        let [balance] = await tx<CreditBalanceRow[]>`
          SELECT * FROM credit_balances
          WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
          FOR UPDATE
        `;

        if (!balance) {
          // Auto-initialize
          const [workspace] = await tx<[{ plan: string }]>`
            SELECT plan FROM workspaces WHERE id = ${workspaceId}
          `;
          const planType = (workspace?.plan ?? "free") as WorkspacePlan;
          const limits = PLAN_LIMITS[planType];

          [balance] = await tx<CreditBalanceRow[]>`
            INSERT INTO credit_balances (
              user_id, workspace_id, daily_credits, monthly_credits, plan_type
            ) VALUES (
              ${userId}, ${workspaceId}, ${limits.dailyCredits}, ${limits.monthlyCredits}, ${planType}
            )
            ON CONFLICT (user_id, workspace_id) DO NOTHING
            RETURNING *
          `;

          if (!balance) {
            // Race condition — re-select
            [balance] = await tx<CreditBalanceRow[]>`
              SELECT * FROM credit_balances
              WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
              FOR UPDATE
            `;
          }
        }

        if (!balance) {
          return { success: false, remaining: 0 };
        }

        // Auto-reset daily if needed
        const now = new Date();
        if (balance.daily_reset_at <= now) {
          await tx`
            UPDATE credit_balances
            SET daily_credits_used = 0,
                daily_reset_at = now() + interval '1 day'
            WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
          `;
          balance.daily_credits_used = 0;
        }

        // Auto-reset monthly if needed
        if (balance.monthly_reset_at <= now) {
          await tx`
            UPDATE credit_balances
            SET monthly_credits_used = 0,
                monthly_reset_at = date_trunc('month', now()) + interval '1 month'
            WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
          `;
          balance.monthly_credits_used = 0;
        }

        // Calculate available credits
        const dailyRemaining = Math.max(0, balance.daily_credits - balance.daily_credits_used);
        const monthlyRemaining = Math.max(0, balance.monthly_credits - balance.monthly_credits_used);
        const totalAvailable = dailyRemaining + monthlyRemaining + balance.rollover_credits;

        if (totalAvailable < amount) {
          return { success: false, remaining: totalAvailable };
        }

        // Deduct from daily first, then monthly, then rollover
        let remaining = amount;
        let dailyUsedInc = 0;
        let monthlyUsedInc = 0;
        let rolloverDec = 0;

        // Deduct from daily
        if (dailyRemaining >= remaining) {
          dailyUsedInc = remaining;
          remaining = 0;
        } else {
          dailyUsedInc = dailyRemaining;
          remaining -= dailyRemaining;
        }

        // Deduct from monthly
        if (remaining > 0) {
          if (monthlyRemaining >= remaining) {
            monthlyUsedInc = remaining;
            remaining = 0;
          } else {
            monthlyUsedInc = monthlyRemaining;
            remaining -= monthlyRemaining;
          }
        }

        // Deduct from rollover
        if (remaining > 0) {
          rolloverDec = remaining;
          remaining = 0;
        }

        await tx`
          UPDATE credit_balances
          SET daily_credits_used = daily_credits_used + ${dailyUsedInc},
              monthly_credits_used = monthly_credits_used + ${monthlyUsedInc},
              rollover_credits = rollover_credits - ${rolloverDec}
          WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
        `;

        // Log usage
        await tx`
          INSERT INTO credit_usage_log (
            user_id, workspace_id, project_id, credits_consumed,
            action_type, prompt_tokens, completion_tokens, model
          ) VALUES (
            ${userId},
            ${workspaceId},
            ${metadata.projectId ?? null},
            ${amount},
            ${metadata.actionType},
            ${metadata.promptTokens ?? null},
            ${metadata.completionTokens ?? null},
            ${metadata.model ?? null}
          )
        `;

        const newTotal = totalAvailable - amount;
        return { success: true, remaining: newTotal };
      });
    },

    /**
     * Reset daily credits for all users whose reset time has passed.
     * Intended to be called by a cron job or on-demand.
     */
    async resetDailyCredits(): Promise<number> {
      const result = await sql`
        UPDATE credit_balances
        SET daily_credits_used = 0,
            daily_reset_at = now() + interval '1 day'
        WHERE daily_reset_at <= now()
      `;
      return result.count;
    },

    /**
     * Reset monthly credits for all users whose reset time has passed.
     * Intended to be called by a cron job or on-demand.
     */
    async resetMonthlyCredits(): Promise<number> {
      const result = await sql`
        UPDATE credit_balances
        SET monthly_credits_used = 0,
            monthly_reset_at = date_trunc('month', now()) + interval '1 month'
        WHERE monthly_reset_at <= now()
      `;
      return result.count;
    },

    /**
     * Get credit usage history for a user in a workspace.
     */
    async getCreditUsageHistory(
      userId: string,
      workspaceId: string,
      days: number = 30
    ): Promise<{ rows: CreditUsageLogRow[]; total: number; dailyBreakdown: { date: string; total: number }[] }> {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM credit_usage_log
        WHERE user_id = ${userId}
          AND workspace_id = ${workspaceId}
          AND created_at >= ${since}
      `;

      const rows = await sql<CreditUsageLogRow[]>`
        SELECT * FROM credit_usage_log
        WHERE user_id = ${userId}
          AND workspace_id = ${workspaceId}
          AND created_at >= ${since}
        ORDER BY created_at DESC
        LIMIT 100
      `;

      const dailyBreakdown = await sql<{ date: string; total: number }[]>`
        SELECT
          to_char(created_at, 'YYYY-MM-DD') as date,
          sum(credits_consumed)::int as total
        FROM credit_usage_log
        WHERE user_id = ${userId}
          AND workspace_id = ${workspaceId}
          AND created_at >= ${since}
        GROUP BY to_char(created_at, 'YYYY-MM-DD')
        ORDER BY date DESC
      `;

      return {
        rows,
        total: parseInt(countResult!.count, 10),
        dailyBreakdown,
      };
    },

    /**
     * Initialize a credit balance row for a user in a workspace.
     */
    async initializeCreditBalance(
      userId: string,
      workspaceId: string,
      planType: WorkspacePlan
    ): Promise<CreditBalanceRow> {
      const limits = PLAN_LIMITS[planType];
      // Postgres integer columns cap at int32; clamp Infinity (enterprise).
      const MAX_INT = 2147483647;
      const daily = Number.isFinite(limits.dailyCredits) ? limits.dailyCredits : MAX_INT;
      const monthly = Number.isFinite(limits.monthlyCredits) ? limits.monthlyCredits : MAX_INT;

      const [row] = await sql<CreditBalanceRow[]>`
        INSERT INTO credit_balances (
          user_id, workspace_id, daily_credits, monthly_credits, plan_type,
          daily_reset_at, monthly_reset_at
        ) VALUES (
          ${userId},
          ${workspaceId},
          ${daily},
          ${monthly},
          ${planType},
          now() + interval '1 day',
          date_trunc('month', now()) + interval '1 month'
        )
        ON CONFLICT (user_id, workspace_id) DO UPDATE SET
          daily_credits = ${daily},
          monthly_credits = ${monthly},
          plan_type = ${planType}
        RETURNING *
      `;

      return row!;
    },

    /**
     * Update all credit balances for a workspace when the plan changes.
     */
    async updateWorkspacePlanCredits(
      workspaceId: string,
      planType: WorkspacePlan
    ): Promise<void> {
      const limits = PLAN_LIMITS[planType];
      // Postgres integer columns cap at int32; clamp Infinity (enterprise).
      const MAX_INT = 2147483647;
      const daily = Number.isFinite(limits.dailyCredits) ? limits.dailyCredits : MAX_INT;
      const monthly = Number.isFinite(limits.monthlyCredits) ? limits.monthlyCredits : MAX_INT;

      await sql`
        UPDATE credit_balances
        SET daily_credits = ${daily},
            monthly_credits = ${monthly},
            plan_type = ${planType}
        WHERE workspace_id = ${workspaceId}
      `;
    },

    /**
     * Add rollover credits to a workspace (e.g., from a top-up purchase).
     */
    async addRolloverCredits(
      workspaceId: string,
      amount: number
    ): Promise<void> {
      await sql`
        UPDATE credit_balances
        SET rollover_credits = rollover_credits + ${amount}
        WHERE workspace_id = ${workspaceId}
      `;
    },

    // ─── Internal helpers ─────────────────────────────────────

    async _resetDailyForUser(
      userId: string,
      workspaceId: string,
      dailyCredits: number
    ): Promise<CreditBalanceRow> {
      const [row] = await sql<CreditBalanceRow[]>`
        UPDATE credit_balances
        SET daily_credits_used = 0,
            daily_reset_at = now() + interval '1 day'
        WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
        RETURNING *
      `;
      return row!;
    },

    async _resetMonthlyForUser(
      userId: string,
      workspaceId: string,
      monthlyCredits: number
    ): Promise<CreditBalanceRow> {
      const [row] = await sql<CreditBalanceRow[]>`
        UPDATE credit_balances
        SET monthly_credits_used = 0,
            monthly_reset_at = date_trunc('month', now()) + interval '1 month'
        WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
        RETURNING *
      `;
      return row!;
    },
  };
}
