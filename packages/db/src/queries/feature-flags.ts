import type postgres from "postgres";
import { PLAN_LIMITS, isPlatformAdminRole, WORKSPACE_ROLES, WORKSPACE_PLANS } from "@doable/shared";
import type { WorkspacePlan } from "@doable/shared";
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

    // ─── Feature Access Check ───────────────────────────────
    /**
     * Check if a user has access to a feature, considering:
     * 1. Per-user override (highest priority)
     * 2. Global flag enabled/disabled
     * 3. min_role check (if set)
     * Returns { allowed, reason }
     */
    async isFeatureAllowed(
      userId: string,
      featureKey: string,
      userWorkspaceRole?: string | null,
      userPlan?: string | null,
    ): Promise<{ allowed: boolean; reason: string }> {
      // 1. Check per-user override first
      const [override] = await sql<{ enabled: boolean }[]>`
        SELECT enabled FROM user_feature_overrides
        WHERE user_id = ${userId} AND feature_key = ${featureKey}
      `;
      if (override) {
        return { allowed: override.enabled, reason: override.enabled ? "user_override_granted" : "user_override_denied" };
      }

      // 2. Check global flag
      const [flag] = await sql<{ enabled: boolean; min_plan: string | null; min_role: string | null }[]>`
        SELECT enabled, min_plan, min_role FROM feature_flags WHERE feature_key = ${featureKey}
      `;
      if (!flag) return { allowed: false, reason: "feature_not_found" };
      if (!flag.enabled) return { allowed: false, reason: "feature_disabled" };

      // 3. Check min_role
      if (flag.min_role && userWorkspaceRole) {
        const roleHierarchy: readonly string[] = WORKSPACE_ROLES;
        const requiredLevel = roleHierarchy.indexOf(flag.min_role);
        const userLevel = roleHierarchy.indexOf(userWorkspaceRole);
        if (userLevel < requiredLevel) {
          return { allowed: false, reason: "insufficient_role" };
        }
      } else if (flag.min_role && !userWorkspaceRole) {
        return { allowed: false, reason: "role_required" };
      }

      // 4. Check min_plan
      if (flag.min_plan && userPlan) {
        const planHierarchy: readonly string[] = WORKSPACE_PLANS;
        const requiredLevel = planHierarchy.indexOf(flag.min_plan);
        const userLevel = planHierarchy.indexOf(userPlan);
        if (userLevel < requiredLevel) {
          return { allowed: false, reason: "insufficient_plan" };
        }
      }

      return { allowed: true, reason: "allowed" };
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
        UPDATE users SET
          is_platform_admin = ${isAdmin},
          platform_role = CASE WHEN ${isAdmin} THEN 'admin'::workspace_role ELSE 'member'::workspace_role END
        WHERE id = ${userId}
      `;
    },

    async listAllUsers(): Promise<Pick<UserRow, "id" | "email" | "display_name" | "is_platform_admin" | "platform_role" | "created_at">[]> {
      return sql<Pick<UserRow, "id" | "email" | "display_name" | "is_platform_admin" | "platform_role" | "created_at">[]>`
        SELECT id, email, display_name, is_platform_admin, platform_role, created_at
        FROM users
        ORDER BY created_at DESC
      `;
    },

    // ─── Platform Roles ─────────────────────────────────────
    async setUserPlatformRole(userId: string, role: string): Promise<void> {
      const isAdmin = isPlatformAdminRole(role);
      await sql`
        UPDATE users
        SET platform_role = ${role}::workspace_role,
            is_platform_admin = ${isAdmin}
        WHERE id = ${userId}
      `;
    },

    async bulkSetPlatformRole(userIds: string[], role: string): Promise<number> {
      const isAdmin = isPlatformAdminRole(role);
      const result = await sql`
        UPDATE users
        SET platform_role = ${role}::workspace_role,
            is_platform_admin = ${isAdmin}
        WHERE id = ANY(${userIds})
      `;
      return result.count;
    },

    // ─── Admin Plan Management ──────────────────────────────
    async setUserWorkspacePlan(userId: string, plan: string): Promise<{ workspaceId: string; plan: string } | null> {
      // Find user's first owned workspace
      const [workspace] = await sql<{ id: string }[]>`
        SELECT w.id FROM workspaces w
        INNER JOIN workspace_members wm ON wm.workspace_id = w.id
        WHERE wm.user_id = ${userId} AND wm.role = 'owner'
        ORDER BY w.created_at ASC LIMIT 1
      `;
      if (!workspace) return null;

      const workspaceId = workspace.id;

      // Update the workspace plan
      const [updated] = await sql<{ id: string; plan: string }[]>`
        UPDATE workspaces SET plan = ${plan}::workspace_plan WHERE id = ${workspaceId} RETURNING id, plan
      `;
      if (!updated) return null;

      // Update credit limits for all members of that workspace
      // Cap Infinity to max int32 since PostgreSQL integer columns can't store Infinity
      const limits = PLAN_LIMITS[plan as WorkspacePlan];
      if (limits) {
        const MAX_INT = 2_147_483_647;
        const daily = Number.isFinite(limits.dailyCredits) ? limits.dailyCredits : MAX_INT;
        const monthly = Number.isFinite(limits.monthlyCredits) ? limits.monthlyCredits : MAX_INT;
        await sql`
          UPDATE credit_balances
          SET daily_credits = ${daily},
              monthly_credits = ${monthly},
              plan_type = ${plan}
          WHERE workspace_id = ${workspaceId}
        `;
      }

      return { workspaceId, plan: updated.plan };
    },

    async bulkSetWorkspacePlan(userIds: string[], plan: string): Promise<number> {
      let count = 0;
      for (const userId of userIds) {
        const result = await this.setUserWorkspacePlan(userId, plan);
        if (result) count++;
      }
      return count;
    },
  };
}
