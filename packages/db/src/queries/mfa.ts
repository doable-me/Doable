import type postgres from "postgres";

export interface UserMfaFactorRow {
  id: string;
  user_id: string;
  type: "totp";
  secret_ciphertext: string;
  label: string;
  verified_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

export interface MfaRecoveryCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Date;
}

/**
 * Queries for optional multi-factor authentication (TOTP + recovery codes).
 *
 * The "primary" factor is the row with verified_at IS NOT NULL — at most
 * one per user, enforced by the partial unique index in 079_mfa.sql.
 * Unverified rows are enrollment scratch space and are deleted on
 * successful verification or replaced on re-enrollment.
 */
export function mfaQueries(sql: postgres.Sql) {
  return {
    // ─── Factor lookups ──────────────────────────────────────

    async getVerifiedFactor(userId: string): Promise<UserMfaFactorRow | undefined> {
      const [row] = await sql<UserMfaFactorRow[]>`
        SELECT * FROM user_mfa_factors
        WHERE user_id = ${userId}
          AND verified_at IS NOT NULL
        LIMIT 1
      `;
      return row;
    },

    async getPendingFactor(userId: string): Promise<UserMfaFactorRow | undefined> {
      const [row] = await sql<UserMfaFactorRow[]>`
        SELECT * FROM user_mfa_factors
        WHERE user_id = ${userId}
          AND verified_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return row;
    },

    async hasVerifiedFactor(userId: string): Promise<boolean> {
      const [row] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM user_mfa_factors
          WHERE user_id = ${userId}
            AND verified_at IS NOT NULL
        ) AS exists
      `;
      return !!row?.exists;
    },

    // ─── Enrollment ──────────────────────────────────────────

    /**
     * Replace the user's pending enrollment with a fresh ciphertext.
     * Verified factors are untouched — a re-enroll only swaps the
     * verified row after the new code is verified, atomically.
     */
    async upsertPendingFactor(args: {
      userId: string;
      secretCiphertext: string;
      label?: string;
    }): Promise<UserMfaFactorRow> {
      const label = args.label ?? "Authenticator app";
      // Delete any prior pending row, insert the new one. This is run in
      // a single transaction by the route handler so it's atomic.
      await sql`
        DELETE FROM user_mfa_factors
        WHERE user_id = ${args.userId}
          AND verified_at IS NULL
      `;
      const [row] = await sql<UserMfaFactorRow[]>`
        INSERT INTO user_mfa_factors (user_id, type, secret_ciphertext, label)
        VALUES (${args.userId}, 'totp', ${args.secretCiphertext}, ${label})
        RETURNING *
      `;
      return row!;
    },

    /**
     * Promote a pending factor to verified, replacing any prior verified
     * factor for this user atomically.
     */
    async verifyPendingFactor(args: {
      userId: string;
      pendingFactorId: string;
    }): Promise<UserMfaFactorRow | undefined> {
      // Drop previous verified factor first, then mark pending as verified.
      // The partial unique index allows this swap inside one statement.
      await sql`
        DELETE FROM user_mfa_factors
        WHERE user_id = ${args.userId}
          AND verified_at IS NOT NULL
      `;
      const [row] = await sql<UserMfaFactorRow[]>`
        UPDATE user_mfa_factors
        SET verified_at = now()
        WHERE id = ${args.pendingFactorId}
          AND user_id = ${args.userId}
          AND verified_at IS NULL
        RETURNING *
      `;
      return row;
    },

    async markFactorUsed(factorId: string): Promise<void> {
      await sql`
        UPDATE user_mfa_factors
        SET last_used_at = now()
        WHERE id = ${factorId}
      `;
    },

    /** Remove all factors + recovery codes for a user (disable MFA). */
    async deleteAllForUser(userId: string): Promise<void> {
      await sql`DELETE FROM user_mfa_factors WHERE user_id = ${userId}`;
      await sql`DELETE FROM mfa_recovery_codes WHERE user_id = ${userId}`;
    },

    // ─── Recovery codes ──────────────────────────────────────

    async replaceRecoveryCodes(args: {
      userId: string;
      codeHashes: string[];
    }): Promise<void> {
      await sql.begin(async (tx) => {
        const txn = tx as unknown as postgres.Sql;
        await txn`DELETE FROM mfa_recovery_codes WHERE user_id = ${args.userId}`;
        for (const codeHash of args.codeHashes) {
          await txn`
            INSERT INTO mfa_recovery_codes (user_id, code_hash)
            VALUES (${args.userId}, ${codeHash})
          `;
        }
      });
    },

    async findUnusedRecoveryCode(args: {
      userId: string;
      codeHash: string;
    }): Promise<MfaRecoveryCodeRow | undefined> {
      const [row] = await sql<MfaRecoveryCodeRow[]>`
        SELECT * FROM mfa_recovery_codes
        WHERE user_id = ${args.userId}
          AND code_hash = ${args.codeHash}
          AND used_at IS NULL
        LIMIT 1
      `;
      return row;
    },

    async markRecoveryCodeUsed(id: string): Promise<void> {
      await sql`
        UPDATE mfa_recovery_codes
        SET used_at = now()
        WHERE id = ${id}
          AND used_at IS NULL
      `;
    },

    async countUnusedRecoveryCodes(userId: string): Promise<number> {
      const [row] = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count FROM mfa_recovery_codes
        WHERE user_id = ${userId}
          AND used_at IS NULL
      `;
      return Number(row?.count ?? 0);
    },

    // ─── Admin views ─────────────────────────────────────────

    async listUsersWithMfa(): Promise<Array<{
      user_id: string;
      email: string;
      display_name: string | null;
      verified_at: Date;
      last_used_at: Date | null;
      unused_recovery_codes: number;
    }>> {
      return sql<Array<{
        user_id: string;
        email: string;
        display_name: string | null;
        verified_at: Date;
        last_used_at: Date | null;
        unused_recovery_codes: number;
      }>>`
        SELECT
          u.id AS user_id,
          u.email,
          u.display_name,
          f.verified_at,
          f.last_used_at,
          (
            SELECT count(*)::int
            FROM mfa_recovery_codes c
            WHERE c.user_id = u.id AND c.used_at IS NULL
          ) AS unused_recovery_codes
        FROM users u
        JOIN user_mfa_factors f ON f.user_id = u.id
        WHERE f.verified_at IS NOT NULL
        ORDER BY f.verified_at DESC
      `;
    },
  };
}
