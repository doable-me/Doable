import type postgres from "postgres";
import type { UserRow } from "../types.js";

export interface SignupApprovalConfig {
  enabled: boolean;
  pending_message: string;
}

export const DEFAULT_PENDING_MESSAGE =
  "Doable is invite-only right now. You have successfully signed up to be on the list and you will receive your surprise to enjoy it very soon.";

export interface PendingSignupRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  approval_status: "approved" | "pending" | "rejected";
  has_password: boolean;
  has_github: boolean;
  has_google: boolean;
  created_at: Date;
}

export interface BlockedEmailRow {
  email: string;
  reason: string | null;
  blocked_at: Date;
  blocked_by: string | null;
}

export function signupApprovalQueries(sql: postgres.Sql) {
  return {
    async getConfig(): Promise<SignupApprovalConfig> {
      try {
        const [row] = await sql<{ value: unknown }[]>`
          SELECT value FROM platform_config WHERE key = 'signup_approval'
        `;
        let parsed: unknown = row?.value ?? null;
        if (typeof parsed === "string") {
          try { parsed = JSON.parse(parsed); } catch { /* ignore */ }
        }
        if (parsed && typeof parsed === "object") {
          const p = parsed as Partial<SignupApprovalConfig>;
          return {
            enabled: p.enabled === true,
            pending_message: typeof p.pending_message === "string" && p.pending_message.trim().length > 0
              ? p.pending_message
              : DEFAULT_PENDING_MESSAGE,
          };
        }
      } catch {
        // platform_config may not exist yet on a fresh DB pre-migration
      }
      return { enabled: false, pending_message: DEFAULT_PENDING_MESSAGE };
    },

    async setConfig(
      config: SignupApprovalConfig,
      updatedBy: string | null
    ): Promise<SignupApprovalConfig> {
      const value = {
        enabled: !!config.enabled,
        pending_message: config.pending_message.trim().length > 0
          ? config.pending_message.trim()
          : DEFAULT_PENDING_MESSAGE,
      };
      await sql`
        INSERT INTO platform_config (key, value, updated_at, updated_by)
        VALUES ('signup_approval', ${sql.json(value)}, now(), ${updatedBy})
        ON CONFLICT (key) DO UPDATE
          SET value = ${sql.json(value)}, updated_at = now(), updated_by = ${updatedBy}
      `;
      return value;
    },

    async listPending(): Promise<PendingSignupRow[]> {
      return await sql<PendingSignupRow[]>`
        SELECT id, email, display_name, avatar_url, approval_status,
               (password_hash IS NOT NULL) AS has_password,
               (github_id IS NOT NULL) AS has_github,
               (google_id IS NOT NULL) AS has_google,
               created_at
        FROM users
        WHERE approval_status = 'pending'
        ORDER BY created_at DESC
      `;
    },

    async listRecentlyDecided(limit = 50): Promise<PendingSignupRow[]> {
      return await sql<PendingSignupRow[]>`
        SELECT id, email, display_name, avatar_url, approval_status,
               (password_hash IS NOT NULL) AS has_password,
               (github_id IS NOT NULL) AS has_github,
               (google_id IS NOT NULL) AS has_google,
               created_at
        FROM users
        WHERE approval_status = 'rejected'
        ORDER BY updated_at DESC
        LIMIT ${limit}
      `;
    },

    async countPending(): Promise<number> {
      try {
        const [row] = await sql<{ c: string }[]>`
          SELECT COUNT(*)::text AS c FROM users WHERE approval_status = 'pending'
        `;
        return Number(row?.c ?? 0);
      } catch {
        return 0;
      }
    },

    async setStatus(
      userId: string,
      status: "approved" | "pending" | "rejected"
    ): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        UPDATE users
        SET approval_status = ${status}, updated_at = now()
        WHERE id = ${userId}
        RETURNING *
      `;
      return user;
    },

    async isEmailBlocked(email: string): Promise<boolean> {
      try {
        const [row] = await sql<{ email: string }[]>`
          SELECT email FROM blocked_signup_emails WHERE email = ${email.toLowerCase()}
        `;
        return !!row;
      } catch {
        return false;
      }
    },

    async blockEmail(email: string, reason: string | null, blockedBy: string | null): Promise<void> {
      await sql`
        INSERT INTO blocked_signup_emails (email, reason, blocked_by)
        VALUES (${email.toLowerCase()}, ${reason}, ${blockedBy})
        ON CONFLICT (email) DO UPDATE
          SET reason = EXCLUDED.reason, blocked_by = EXCLUDED.blocked_by, blocked_at = now()
      `;
    },

    async unblockEmail(email: string): Promise<boolean> {
      const res = await sql`
        DELETE FROM blocked_signup_emails WHERE email = ${email.toLowerCase()}
      `;
      return res.count > 0;
    },

    async listBlocked(): Promise<BlockedEmailRow[]> {
      try {
        return await sql<BlockedEmailRow[]>`
          SELECT email, reason, blocked_at, blocked_by
          FROM blocked_signup_emails
          ORDER BY blocked_at DESC
        `;
      } catch {
        return [];
      }
    },
  };
}
