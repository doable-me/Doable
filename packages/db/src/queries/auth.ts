import type postgres from "postgres";
import type { UserRow } from "../types.js";

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export function authQueries(sql: postgres.Sql) {
  return {
    // ─── User Lookups ────────────────────────────────────────

    async findUserByEmail(email: string): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        SELECT * FROM users WHERE email = ${email.toLowerCase()}
      `;
      return user;
    },

    async findUserByGitHubId(githubId: string): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        SELECT * FROM users WHERE github_id = ${githubId}
      `;
      return user;
    },

    async findUserByGoogleId(googleId: string): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        SELECT * FROM users WHERE google_id = ${googleId}
      `;
      return user;
    },

    // ─── User Mutations ──────────────────────────────────────

    async createUser(data: {
      email: string;
      passwordHash?: string;
      displayName?: string;
      avatarUrl?: string;
      githubId?: string;
      googleId?: string;
      approvalStatus?: "approved" | "pending" | "rejected";
    }): Promise<UserRow> {
      const [user] = await sql<UserRow[]>`
        INSERT INTO users (email, password_hash, display_name, avatar_url, github_id, google_id, approval_status)
        VALUES (
          ${data.email.toLowerCase()},
          ${data.passwordHash ?? null},
          ${data.displayName ?? null},
          ${data.avatarUrl ?? null},
          ${data.githubId ?? null},
          ${data.googleId ?? null},
          ${data.approvalStatus ?? "approved"}
        )
        RETURNING *
      `;
      return user!;
    },

    async updateUserPassword(
      userId: string,
      passwordHash: string
    ): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        UPDATE users
        SET password_hash = ${passwordHash}
        WHERE id = ${userId}
        RETURNING *
      `;
      return user;
    },

    /**
     * Upsert a user from an OAuth provider.
     * If a user with matching provider ID exists, update their info.
     * Otherwise, create a new user.
     */
    async createOrUpdateOAuthUser(data: {
      email: string;
      displayName?: string;
      avatarUrl?: string;
      githubId?: string;
      googleId?: string;
      approvalStatus?: "approved" | "pending" | "rejected";
    }): Promise<UserRow> {
      // Try to find by provider ID first
      let existing: UserRow | undefined;

      if (data.githubId) {
        existing = await this.findUserByGitHubId(data.githubId);
      } else if (data.googleId) {
        existing = await this.findUserByGoogleId(data.googleId);
      }

      // Fall back to email lookup
      if (!existing) {
        existing = await this.findUserByEmail(data.email);
      }

      if (existing) {
        // Update provider ID and profile info
        const updates: Record<string, unknown> = {};
        if (data.githubId && !existing.github_id)
          updates.github_id = data.githubId;
        if (data.googleId && !existing.google_id)
          updates.google_id = data.googleId;
        if (data.displayName && !existing.display_name)
          updates.display_name = data.displayName;
        if (data.avatarUrl && !existing.avatar_url)
          updates.avatar_url = data.avatarUrl;

        if (Object.keys(updates).length > 0) {
          const [updated] = await sql<UserRow[]>`
            UPDATE users
            SET ${sql(updates as Record<string, postgres.SerializableParameter>)}
            WHERE id = ${existing.id}
            RETURNING *
          `;
          return updated!;
        }
        return existing;
      }

      return this.createUser(data);
    },

    // ─── Refresh Tokens ──────────────────────────────────────

    async storeRefreshToken(data: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }): Promise<RefreshTokenRow> {
      const [token] = await sql<RefreshTokenRow[]>`
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
        VALUES (${data.userId}, ${data.tokenHash}, ${data.expiresAt})
        RETURNING *
      `;
      return token!;
    },

    async findRefreshToken(
      tokenHash: string
    ): Promise<RefreshTokenRow | undefined> {
      const [token] = await sql<RefreshTokenRow[]>`
        SELECT * FROM refresh_tokens
        WHERE token_hash = ${tokenHash}
          AND expires_at > now()
      `;
      return token;
    },

    async deleteRefreshToken(tokenHash: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM refresh_tokens WHERE token_hash = ${tokenHash}
      `;
      return result.count > 0;
    },

    async deleteAllRefreshTokensForUser(userId: string): Promise<void> {
      await sql`
        DELETE FROM refresh_tokens WHERE user_id = ${userId}
      `;
    },
  };
}
