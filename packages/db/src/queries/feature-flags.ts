import type postgres from "postgres";
import type { FeatureFlagRow, UserFeatureOverrideRow, UserRow } from "../types.js";

export function featureFlagQueries(sql: postgres.Sql) {
  return {
    // ─── Feature Flags ─────────────────────────────────────
    async listAll(): Promise<FeatureFlagRow[]> {
      return sql<FeatureFlagRow[]>`
        SELECT * FROM feature_flags ORDER BY label ASC
      `;
    },

    async getByKey(key: string): Promise<FeatureFlagRow | undefined> {
      const [flag] = await sql<FeatureFlagRow[]>`
        SELECT * FROM feature_flags WHERE feature_key = ${key}
      `;
      return flag;
    },

    async update(
      key: string,
      data: Partial<{
        enabled: boolean;
        minPlan: string | null;
        minRole: string | null;
        label: string;
        description: string | null;
      }>
    ): Promise<FeatureFlagRow | undefined> {
      const values: Record<string, unknown> = {};
      if (data.enabled !== undefined) values.enabled = data.enabled;
      if (data.minPlan !== undefined) values.min_plan = data.minPlan;
      if (data.minRole !== undefined) values.min_role = data.minRole;
      if (data.label !== undefined) values.label = data.label;
      if (data.description !== undefined) values.description = data.description;
      values.updated_at = sql`now()`;

      if (Object.keys(values).length <= 1) return this.getByKey(key);

      const [flag] = await sql<FeatureFlagRow[]>`
        UPDATE feature_flags
        SET ${sql(values as Record<string, postgres.SerializableParameter>)}
        WHERE feature_key = ${key}
        RETURNING *
      `;
      return flag;
    },

    async create(data: {
      featureKey: string;
      label: string;
      description?: string;
      enabled?: boolean;
      minPlan?: string | null;
      minRole?: string | null;
    }): Promise<FeatureFlagRow> {
      const [flag] = await sql<FeatureFlagRow[]>`
        INSERT INTO feature_flags (feature_key, label, description, enabled, min_plan, min_role)
        VALUES (
          ${data.featureKey},
          ${data.label},
          ${data.description ?? null},
          ${data.enabled ?? true},
          ${data.minPlan ?? null},
          ${data.minRole ?? null}
        )
        RETURNING *
      `;
      return flag!;
    },

    async delete(key: string): Promise<boolean> {
      const result = await sql`DELETE FROM feature_flags WHERE feature_key = ${key}`;
      return result.count > 0;
    },

    // ─── User Overrides ────────────────────────────────────
    async listOverrides(featureKey: string): Promise<(UserFeatureOverrideRow & { email: string; display_name: string | null })[]> {
      return sql<(UserFeatureOverrideRow & { email: string; display_name: string | null })[]>`
        SELECT ufo.*, u.email, u.display_name
        FROM user_feature_overrides ufo
        JOIN users u ON u.id = ufo.user_id
        WHERE ufo.feature_key = ${featureKey}
        ORDER BY u.email ASC
      `;
    },

    async setOverride(userId: string, featureKey: string, enabled: boolean): Promise<void> {
      await sql`
        INSERT INTO user_feature_overrides (user_id, feature_key, enabled)
        VALUES (${userId}, ${featureKey}, ${enabled})
        ON CONFLICT (user_id, feature_key) DO UPDATE SET enabled = ${enabled}
      `;
    },

    async removeOverride(userId: string, featureKey: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM user_feature_overrides
        WHERE user_id = ${userId} AND feature_key = ${featureKey}
      `;
      return result.count > 0;
    },

    async getUserOverrides(userId: string): Promise<UserFeatureOverrideRow[]> {
      return sql<UserFeatureOverrideRow[]>`
        SELECT * FROM user_feature_overrides WHERE user_id = ${userId}
      `;
    },

    // ─── Platform Admin ────────────────────────────────────
    async isPlatformAdmin(userId: string): Promise<boolean> {
      const [user] = await sql<{ is_platform_admin: boolean }[]>`
        SELECT is_platform_admin FROM users WHERE id = ${userId}
      `;
      return user?.is_platform_admin ?? false;
    },

    async setPlatformAdmin(userId: string, isAdmin: boolean): Promise<void> {
      await sql`
        UPDATE users SET is_platform_admin = ${isAdmin} WHERE id = ${userId}
      `;
    },

    async listAllUsers(): Promise<Pick<UserRow, "id" | "email" | "display_name" | "is_platform_admin" | "created_at">[]> {
      return sql<Pick<UserRow, "id" | "email" | "display_name" | "is_platform_admin" | "created_at">[]>`
        SELECT id, email, display_name, is_platform_admin, created_at
        FROM users
        ORDER BY created_at DESC
      `;
    },
  };
}
