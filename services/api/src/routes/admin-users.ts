import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { featureFlagQueries, creditQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { WORKSPACE_PLANS, WORKSPACE_ROLES } from "@doable/shared";

const featureFlags = featureFlagQueries(sql);
const credits = creditQueries(sql);

export const adminUserRoutes = new Hono<AuthEnv>();

adminUserRoutes.use("*", authMiddleware);
adminUserRoutes.use("*", platformAdminMiddleware);

// ─── Check admin status ────────────────────────────────────
adminUserRoutes.get("/status", async (c) => {
  return c.json({ admin: true });
});

// ─── User Management ───────────────────────────────────────

// List all users
adminUserRoutes.get("/users", async (c) => {
  const users = await featureFlags.listAllUsers();
  return c.json(users);
});

// Toggle platform admin
const toggleAdminSchema = z.object({
  isPlatformAdmin: z.boolean(),
});

adminUserRoutes.patch("/users/:userId/admin", async (c) => {
  const body = await c.req.json();
  const parsed = toggleAdminSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const targetUserId = c.req.param("userId");
  const callerId = c.get("userId");

  if (targetUserId === callerId && !parsed.data.isPlatformAdmin) {
    return c.json({ error: "Cannot remove your own platform admin access" }, 400);
  }

  await featureFlags.setPlatformAdmin(targetUserId, parsed.data.isPlatformAdmin);
  return c.json({ ok: true });
});

// Set platform role
const setRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
});

adminUserRoutes.patch("/users/:userId/role", async (c) => {
  const body = await c.req.json();
  const parsed = setRoleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const targetUserId = c.req.param("userId");
  const callerId = c.get("userId");

  if (targetUserId === callerId) {
    return c.json({ error: "Cannot change your own platform role" }, 400);
  }

  await featureFlags.setUserPlatformRole(targetUserId, parsed.data.role);
  return c.json({ ok: true });
});

// Set user workspace plan
const setPlanSchema = z.object({
  plan: z.enum(WORKSPACE_PLANS),
});

adminUserRoutes.patch("/users/:userId/plan", async (c) => {
  const body = await c.req.json();
  const parsed = setPlanSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const result = await featureFlags.setUserWorkspacePlan(c.req.param("userId"), parsed.data.plan);
  if (!result) return c.json({ error: "User has no workspace" }, 400);
  return c.json({ ok: true, workspaceId: result.workspaceId, plan: result.plan });
});

// ─── Admin Credit Allocation ─────────────────────────────

const setCreditsSchema = z.object({
  dailyCredits: z.number().int().min(0).max(100000).optional(),
  monthlyCredits: z.number().int().min(0).max(1000000).optional(),
  rolloverCredits: z.number().int().min(0).max(1000000).optional(),
  resetUsage: z.boolean().optional(),
});

// GET /admin/users/:userId/credits
adminUserRoutes.get("/users/:userId/credits", async (c) => {
  const userId = c.req.param("userId");
  const [ws] = await sql<{ id: string; plan: string }[]>`
    SELECT w.id, w.plan FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ${userId} AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1
  `;
  if (!ws) return c.json({ error: "User has no workspace" }, 404);

  const balance = await credits.getCreditBalance(userId, ws.id);
  return c.json({ ...balance, workspaceId: ws.id });
});

// PATCH /admin/users/:userId/credits
adminUserRoutes.patch("/users/:userId/credits", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const parsed = setCreditsSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { dailyCredits, monthlyCredits, rolloverCredits, resetUsage } = parsed.data;

  const [ws] = await sql<{ id: string; plan: string }[]>`
    SELECT w.id, w.plan FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ${userId} AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1
  `;
  if (!ws) return c.json({ error: "User has no workspace" }, 404);

  await credits.getCreditBalance(userId, ws.id);

  if (dailyCredits !== undefined) {
    await sql`UPDATE credit_balances SET daily_credits = ${dailyCredits}, updated_at = now()
              WHERE user_id = ${userId} AND workspace_id = ${ws.id}`;
  }
  if (monthlyCredits !== undefined) {
    await sql`UPDATE credit_balances SET monthly_credits = ${monthlyCredits}, updated_at = now()
              WHERE user_id = ${userId} AND workspace_id = ${ws.id}`;
  }
  if (rolloverCredits !== undefined) {
    await sql`UPDATE credit_balances SET rollover_credits = ${rolloverCredits}, updated_at = now()
              WHERE user_id = ${userId} AND workspace_id = ${ws.id}`;
  }

  if (resetUsage) {
    await sql`
      UPDATE credit_balances
      SET daily_credits_used = 0,
          monthly_credits_used = 0,
          daily_reset_at = now() + interval '1 day',
          monthly_reset_at = date_trunc('month', now()) + interval '1 month'
      WHERE user_id = ${userId} AND workspace_id = ${ws.id}
    `;
  }

  const balance = await credits.getCreditBalance(userId, ws.id);
  return c.json({ ok: true, balance });
});

// Get overrides for a specific user
adminUserRoutes.get("/users/:userId/overrides", async (c) => {
  const overrides = await featureFlags.getUserOverrides(c.req.param("userId"));
  return c.json(overrides);
});

// Bulk update role and/or plan for multiple users
const bulkUpdateSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  role: z.enum(WORKSPACE_ROLES).optional(),
  plan: z.enum(WORKSPACE_PLANS).optional(),
});

adminUserRoutes.post("/users/bulk-update", async (c) => {
  const body = await c.req.json();
  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const callerId = c.get("userId");
  const { userIds, role, plan } = parsed.data;

  if (role && userIds.includes(callerId)) {
    return c.json({ error: "Cannot change your own platform role" }, 400);
  }

  let roleUpdated = 0;
  let planUpdated = 0;

  if (role) {
    roleUpdated = await featureFlags.bulkSetPlatformRole(userIds, role);
  }
  if (plan) {
    planUpdated = await featureFlags.bulkSetWorkspacePlan(userIds, plan);
  }

  return c.json({ data: { roleUpdated, planUpdated } });
});
