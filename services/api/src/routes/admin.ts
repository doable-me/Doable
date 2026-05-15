import { Hono } from "hono";
import { sql } from "../db/index.js";
import { featureFlagQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { adminFeatureRoutes } from "./admin-features.js";
import { adminUserRoutes } from "./admin-users.js";
import { adminAiRoutes } from "./admin-ai.js";
import { adminOpsRoutes } from "./admin-ops.js";
import { adminEmailRoutes } from "./admin-email.js";
import { adminToolsRoutes } from "./admin-tools.js";
import { adminPlanLimitsRoutes } from "./admin-plan-limits.js";
import { adminFrameworkRoutes } from "./admin-frameworks.js";

const featureFlags = featureFlagQueries(sql);

export const adminRoutes = new Hono<AuthEnv>({ strict: false });

// ─── Feature access check (any authenticated user) ──────
// This is BEFORE the platform admin guard so regular users can check their own access.
adminRoutes.get("/features/check/:key", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const featureKey = c.req.param("key");
  const workspaceId = c.req.query("workspaceId");

  let userRole: string | null = null;
  let userPlan: string | null = null;
  if (workspaceId) {
    const [member] = await sql<{ role: string }[]>`
      SELECT role FROM workspace_members WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    `;
    userRole = member?.role ?? null;
    const [ws] = await sql<{ plan: string }[]>`
      SELECT plan FROM workspaces WHERE id = ${workspaceId}
    `;
    userPlan = ws?.plan ?? "free";
  }

  const isPAdmin = await featureFlags.isPlatformAdmin(userId);
  if (isPAdmin) {
    return c.json({ allowed: true, reason: "platform_admin" });
  }

  const result = await featureFlags.isFeatureAllowed(userId, featureKey, userRole, userPlan);
  return c.json(result);
});

adminRoutes.route("/", adminFeatureRoutes);
adminRoutes.route("/", adminUserRoutes);
adminRoutes.route("/", adminAiRoutes);
adminRoutes.route("/", adminOpsRoutes);
adminRoutes.route("/", adminToolsRoutes);
adminRoutes.route("/", adminPlanLimitsRoutes);
adminRoutes.route("/", adminFrameworkRoutes);
adminRoutes.route("/email", adminEmailRoutes);
