import type postgres from "postgres";
import type { CreditsRow } from "../types.js";

export interface SubscriptionRow {
  id: string;
  workspace_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan: string;
  status: string;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at: Date | null;
  canceled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreditUsageRow {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  credits_consumed: number;
  action_type: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  model: string | null;
  created_at: Date;
}

export interface CreditTransactionRow {
  id: string;
  user_id: string | null;
  workspace_id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: Date;
}

export function billingQueries(sql: postgres.Sql) {
  return {
    // ─── Credits ───────────────────────────────────────────

    async getCredits(workspaceId: string): Promise<CreditsRow | undefined> {
      const [row] = await sql<CreditsRow[]>`
        SELECT * FROM credits WHERE workspace_id = ${workspaceId}
      `;
      return row;
    },

    async consumeCredit(
      workspaceId: string,
      userId: string,
      action: string,
      opts?: { projectId?: string; amount?: number }
    ): Promise<{ success: boolean; remaining: number }> {
      const amount = opts?.amount ?? 1;

      return sql.begin(async (_tx) => {
        const tx = _tx as unknown as postgres.Sql;
        // Try daily credits first, then monthly, then rollover
        const [credits] = await tx<CreditsRow[]>`
          SELECT * FROM credits WHERE workspace_id = ${workspaceId} FOR UPDATE
        `;

        if (!credits) {
          return { success: false, remaining: 0 };
        }

        let daily = credits.daily_remaining;
        let monthly = credits.monthly_remaining;
        let rollover = credits.rollover_credits;
        let remaining = amount;

        // Deduct from daily first
        if (daily >= remaining) {
          daily -= remaining;
          remaining = 0;
        } else {
          remaining -= daily;
          daily = 0;
        }

        // Then monthly
        if (remaining > 0 && monthly >= remaining) {
          monthly -= remaining;
          remaining = 0;
        } else if (remaining > 0) {
          remaining -= monthly;
          monthly = 0;
        }

        // Then rollover
        if (remaining > 0 && rollover >= remaining) {
          rollover -= remaining;
          remaining = 0;
        } else if (remaining > 0) {
          return { success: false, remaining: daily + monthly + rollover };
        }

        await tx`
          UPDATE credits
          SET daily_remaining = ${daily},
              monthly_remaining = ${monthly},
              rollover_credits = ${rollover}
          WHERE workspace_id = ${workspaceId}
        `;

        await tx`
          INSERT INTO credit_usage_log (workspace_id, user_id, project_id, credits_consumed, action_type)
          VALUES (
            ${workspaceId},
            ${userId},
            ${opts?.projectId ?? null},
            ${amount},
            ${action}
          )
        `;

        return { success: true, remaining: daily + monthly + rollover };
      });
    },

    async addCredits(
      workspaceId: string,
      credits: { daily?: number; monthly?: number; rollover?: number }
    ): Promise<CreditsRow> {
      const [row] = await sql<CreditsRow[]>`
        UPDATE credits
        SET daily_remaining = daily_remaining + ${credits.daily ?? 0},
            monthly_remaining = monthly_remaining + ${credits.monthly ?? 0},
            rollover_credits = rollover_credits + ${credits.rollover ?? 0}
        WHERE workspace_id = ${workspaceId}
        RETURNING *
      `;
      return row!;
    },

    async resetDailyCredits(
      workspaceId: string,
      dailyAmount: number
    ): Promise<void> {
      await sql`
        UPDATE credits
        SET daily_remaining = ${dailyAmount},
            last_daily_reset = now()
        WHERE workspace_id = ${workspaceId}
      `;
    },

    async resetMonthlyCredits(
      workspaceId: string,
      monthlyAmount: number
    ): Promise<void> {
      await sql`
        UPDATE credits
        SET monthly_remaining = ${monthlyAmount},
            last_monthly_reset = now()
        WHERE workspace_id = ${workspaceId}
      `;
    },

    // ─── Usage History ─────────────────────────────────────

    async getUsageHistory(
      workspaceId: string,
      opts?: { limit?: number; offset?: number; from?: Date; to?: Date }
    ): Promise<{ rows: CreditUsageRow[]; total: number }> {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;
      const fromDate = opts?.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const toDate = opts?.to ?? new Date();

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM credit_usage_log
        WHERE workspace_id = ${workspaceId}
          AND created_at >= ${fromDate}
          AND created_at <= ${toDate}
      `;

      const rows = await sql<CreditUsageRow[]>`
        SELECT * FROM credit_usage_log
        WHERE workspace_id = ${workspaceId}
          AND created_at >= ${fromDate}
          AND created_at <= ${toDate}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },

    // ─── Subscriptions ─────────────────────────────────────

    async getSubscription(workspaceId: string): Promise<SubscriptionRow | undefined> {
      const [row] = await sql<SubscriptionRow[]>`
        SELECT * FROM subscriptions WHERE workspace_id = ${workspaceId}
      `;
      return row;
    },

    async getSubscriptionByStripeId(
      stripeSubscriptionId: string
    ): Promise<SubscriptionRow | undefined> {
      const [row] = await sql<SubscriptionRow[]>`
        SELECT * FROM subscriptions
        WHERE stripe_subscription_id = ${stripeSubscriptionId}
      `;
      return row;
    },

    async upsertSubscription(data: {
      workspaceId: string;
      stripeCustomerId: string;
      stripeSubscriptionId: string | null;
      plan: string;
      status: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      cancelAt?: Date | null;
      canceledAt?: Date | null;
    }): Promise<SubscriptionRow> {
      const [row] = await sql<SubscriptionRow[]>`
        INSERT INTO subscriptions (
          workspace_id, stripe_customer_id, stripe_subscription_id,
          plan, status, current_period_start, current_period_end,
          cancel_at, canceled_at
        ) VALUES (
          ${data.workspaceId},
          ${data.stripeCustomerId},
          ${data.stripeSubscriptionId ?? null},
          ${data.plan},
          ${data.status},
          ${data.currentPeriodStart ?? null},
          ${data.currentPeriodEnd ?? null},
          ${data.cancelAt ?? null},
          ${data.canceledAt ?? null}
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
          stripe_customer_id = EXCLUDED.stripe_customer_id,
          stripe_subscription_id = EXCLUDED.stripe_subscription_id,
          plan = EXCLUDED.plan,
          status = EXCLUDED.status,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at = EXCLUDED.cancel_at,
          canceled_at = EXCLUDED.canceled_at
        RETURNING *
      `;
      return row!;
    },

    async deleteSubscription(workspaceId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM subscriptions WHERE workspace_id = ${workspaceId}
      `;
      return result.count > 0;
    },

    async getSubscriptionByCustomerId(
      stripeCustomerId: string
    ): Promise<SubscriptionRow | undefined> {
      const [row] = await sql<SubscriptionRow[]>`
        SELECT * FROM subscriptions
        WHERE stripe_customer_id = ${stripeCustomerId}
      `;
      return row;
    },

    // ─── Credit Transactions ──────────────────────────────────

    async recordTransaction(data: {
      userId?: string | null;
      workspaceId: string;
      amount: number;
      type: string;
      description?: string;
    }): Promise<CreditTransactionRow> {
      const [row] = await sql<CreditTransactionRow[]>`
        INSERT INTO credit_transactions (user_id, workspace_id, amount, type, description)
        VALUES (
          ${data.userId ?? null},
          ${data.workspaceId},
          ${data.amount},
          ${data.type},
          ${data.description ?? null}
        )
        RETURNING *
      `;
      return row!;
    },

    async getTransactions(
      workspaceId: string,
      opts?: { limit?: number; offset?: number }
    ): Promise<{ rows: CreditTransactionRow[]; total: number }> {
      const limit = opts?.limit ?? 50;
      const offset = opts?.offset ?? 0;

      const [countResult] = await sql<[{ count: string }]>`
        SELECT count(*)::text FROM credit_transactions
        WHERE workspace_id = ${workspaceId}
      `;

      const rows = await sql<CreditTransactionRow[]>`
        SELECT * FROM credit_transactions
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      return { rows, total: parseInt(countResult!.count, 10) };
    },

    // ─── User Stripe Customer ID ──────────────────────────────

    async setUserStripeCustomerId(
      userId: string,
      stripeCustomerId: string
    ): Promise<void> {
      await sql`
        UPDATE users
        SET stripe_customer_id = ${stripeCustomerId}
        WHERE id = ${userId}
      `;
    },

    async getUserByStripeCustomerId(
      stripeCustomerId: string
    ): Promise<{ id: string; email: string } | undefined> {
      const [row] = await sql<{ id: string; email: string }[]>`
        SELECT id, email FROM users
        WHERE stripe_customer_id = ${stripeCustomerId}
      `;
      return row;
    },

    // ─── Ensure credits row exists ────────────────────────────

    async ensureCredits(
      workspaceId: string,
      dailyCredits: number,
      monthlyCredits: number
    ): Promise<CreditsRow> {
      const [row] = await sql<CreditsRow[]>`
        INSERT INTO credits (workspace_id, daily_remaining, monthly_remaining)
        VALUES (${workspaceId}, ${dailyCredits}, ${monthlyCredits})
        ON CONFLICT (workspace_id) DO NOTHING
        RETURNING *
      `;
      if (row) return row;
      // Row already existed
      const [existing] = await sql<CreditsRow[]>`
        SELECT * FROM credits WHERE workspace_id = ${workspaceId}
      `;
      return existing!;
    },
  };
}
