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
