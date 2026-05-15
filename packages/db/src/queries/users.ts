import type postgres from "postgres";
import type { UserRow } from "../types.js";

export function userQueries(sql: postgres.Sql) {
  return {
    async findById(id: string): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        SELECT * FROM users WHERE id = ${id}
      `;
      return user;
    },

    async findByEmail(email: string): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        SELECT * FROM users WHERE email = ${email.toLowerCase()}
      `;
      return user;
    },

    /**
     * BUG-CORPUS-PROJ-005: lookup helper for invite / add-collaborator
     * flows where the caller needs to find a user by email but is NOT
     * guaranteed to share a workspace with them — exactly the case the
     * `users_workspace_visible` RLS policy (migration 076) hides under
     * `authMiddlewareWithRls`.
     *
     * Goes through the `doable_lookup_user_by_email` SECURITY DEFINER
     * function (migration 084) which returns only public-safe columns
     * (id, email, display_name, avatar_url) and requires the caller to
     * be authenticated (`doable_current_user_id() IS NOT NULL`). Never
     * exposes password_hash / mfa secrets / oauth tokens. Caller MUST
     * still gate use of this method on their own permission check
     * (e.g. "is the caller a workspace admin?") — this method only
     * bypasses the visibility RLS, not the application-level authz.
     */
    async findByEmailForInvite(email: string): Promise<
      | {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
        }
      | undefined
    > {
      const rows = await sql<
        {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
        }[]
      >`
        SELECT id, email, display_name, avatar_url
        FROM doable_lookup_user_by_email(${email.toLowerCase()})
      `;
      return rows[0];
    },

    async findByGithubId(githubId: string): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        SELECT * FROM users WHERE github_id = ${githubId}
      `;
      return user;
    },

    async findByGoogleId(googleId: string): Promise<UserRow | undefined> {
      const [user] = await sql<UserRow[]>`
        SELECT * FROM users WHERE google_id = ${googleId}
      `;
      return user;
    },

    async create(data: {
      email: string;
      passwordHash?: string;
      displayName?: string;
      avatarUrl?: string;
      githubId?: string;
      googleId?: string;
    }): Promise<UserRow> {
      const [user] = await sql<UserRow[]>`
        INSERT INTO users (email, password_hash, display_name, avatar_url, github_id, google_id)
        VALUES (
          ${data.email.toLowerCase()},
          ${data.passwordHash ?? null},
          ${data.displayName ?? null},
          ${data.avatarUrl ?? null},
          ${data.githubId ?? null},
          ${data.googleId ?? null}
        )
        RETURNING *
      `;
      return user!;
    },

    async update(
      id: string,
      data: Partial<{
        email: string;
        passwordHash: string;
        displayName: string;
        avatarUrl: string;
      }>
    ): Promise<UserRow | undefined> {
      const sets: string[] = [];
      const values: Record<string, unknown> = {};

      if (data.email !== undefined) {
        values.email = data.email.toLowerCase();
      }
      if (data.passwordHash !== undefined) {
        values.password_hash = data.passwordHash;
      }
      if (data.displayName !== undefined) {
        values.display_name = data.displayName;
      }
      if (data.avatarUrl !== undefined) {
        values.avatar_url = data.avatarUrl;
      }

      if (Object.keys(values).length === 0) return this.findById(id);

      const [user] = await sql<UserRow[]>`
        UPDATE users
        SET ${sql(values as Record<string, postgres.SerializableParameter>)}
        WHERE id = ${id}
        RETURNING *
      `;
      return user;
    },

    async delete(id: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM users WHERE id = ${id}
      `;
      return result.count > 0;
    },
  };
}
