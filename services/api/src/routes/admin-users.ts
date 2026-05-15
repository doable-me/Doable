import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { featureFlagQueries, creditQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { WORKSPACE_PLANS, WORKSPACE_ROLES, PLAN_LIMITS } from "@doable/shared";

const featureFlags = featureFlagQueries(sql);
const credits = creditQueries(sql);

export const adminUserRoutes = new Hono<AuthEnv>({ strict: false });

adminUserRoutes.use("*", authMiddleware);
adminUserRoutes.use("*", platformAdminMiddleware);

// ─── Check admin status ────────────────────────────────────
adminUserRoutes.get("/status", async (c) => {
  return c.json({ admin: true });
});

// ─── User Management ───────────────────────────────────────

// List all users (with plan, AI config, and credit fields)
adminUserRoutes.get("/users", async (c) => {
  const search = (c.req.query("search") ?? "").slice(0, 100);
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100", 10) || 100, 500);
  const offset = Math.max(parseInt(c.req.query("offset") ?? "0", 10) || 0, 0);
  const searchPattern = `%${search}%`;

  const rows = await sql<{
    id: string; email: string; display_name: string | null;
    is_platform_admin: boolean; platform_role: string | null; created_at: Date;
    plan: string | null; workspace_id: string | null;
    ai_source: string | null; model: string | null;
    daily_credits: number | null; monthly_credits: number | null; rollover_credits: number | null;
  }[]>`
    SELECT
      u.id, u.email, u.display_name, u.is_platform_admin, u.platform_role, u.created_at,
      w.plan, w.id AS workspace_id,
      was.default_source AS ai_source, was.default_copilot_model AS model,
      COALESCE(cb.daily_credits, 0)    AS daily_credits,
      COALESCE(cb.monthly_credits, 0)  AS monthly_credits,
      COALESCE(cb.rollover_credits, 0) AS rollover_credits
    FROM users u
    LEFT JOIN workspaces w ON w.owner_id = u.id
    LEFT JOIN workspace_ai_settings was ON was.workspace_id = w.id
    LEFT JOIN credit_balances cb ON cb.workspace_id = w.id AND cb.user_id = u.id
    WHERE (
      ${search} = '' OR
      u.email ILIKE ${searchPattern} OR
      u.display_name ILIKE ${searchPattern}
    )
    ORDER BY u.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // BUG-ADMIN-012 (regression of BUG-ADMIN-005): return a flat snake_case
  // array. The sole consumer (apps/web/src/hooks/use-platform-admin.ts)
  // does setUsers(data) → admin/page.tsx does users.map(...). When
  // BUG-ADMIN-005 wrapped this in a { data, total, limit, offset } envelope
  // with camelCase keys, /admin crashed with "A.map is not a function". If
  // pagination UI is ever built, surface total/limit/offset via response
  // headers — do NOT re-wrap this body.
  return c.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      is_platform_admin: u.is_platform_admin,
      platform_role: u.platform_role,
      created_at: u.created_at,
      workspace_id: u.workspace_id,
      plan: u.plan ?? "free",
      ai_source: u.ai_source,
      model: u.model,
      daily_credits: u.daily_credits ?? 0,
      monthly_credits: u.monthly_credits ?? 0,
      rollover_credits: u.rollover_credits ?? 0,
    })),
  );
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

// ─── Admin Project Limit Override ────────────────────────

const setProjectLimitSchema = z.object({
  maxProjects: z.number().int().min(1).max(10000).nullable(),
});

// GET /admin/users/:userId/project-limit
adminUserRoutes.get("/users/:userId/project-limit", async (c) => {
  const userId = c.req.param("userId");
  const [ws] = await sql<{ id: string; plan: string; max_projects_override: number | null }[]>`
    SELECT w.id, w.plan, w.max_projects_override FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ${userId} AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1
  `;
  if (!ws) return c.json({ error: "User has no workspace" }, 404);

  const planLimits = PLAN_LIMITS[ws.plan as import("@doable/shared").WorkspacePlan] ?? PLAN_LIMITS.free;
  return c.json({
    workspaceId: ws.id,
    plan: ws.plan,
    planDefault: planLimits.maxProjects,
    override: ws.max_projects_override,
    effective: ws.max_projects_override ?? planLimits.maxProjects,
  });
});

// PATCH /admin/users/:userId/project-limit
// Set maxProjects to a number to override, or null to reset to plan default.
adminUserRoutes.patch("/users/:userId/project-limit", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const parsed = setProjectLimitSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const [ws] = await sql<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ${userId} AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1
  `;
  if (!ws) return c.json({ error: "User has no workspace" }, 404);

  await sql`
    UPDATE workspaces SET max_projects_override = ${parsed.data.maxProjects}, updated_at = now()
    WHERE id = ${ws.id}
  `;

  return c.json({ ok: true, maxProjects: parsed.data.maxProjects });
});
