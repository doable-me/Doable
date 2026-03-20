import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { featureFlagQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";

const featureFlags = featureFlagQueries(sql);

export const adminRoutes = new Hono<AuthEnv>();

// ─── Feature access check (any authenticated user) ──────
// This is BEFORE the platform admin guard so regular users can check their own access.
adminRoutes.get("/features/check/:key", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const featureKey = c.req.param("key");
  const workspaceId = c.req.query("workspaceId");

  // Get user's workspace role if workspaceId provided
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

  // Platform admins always have access
  const isPAdmin = await featureFlags.isPlatformAdmin(userId);
  if (isPAdmin) {
    return c.json({ allowed: true, reason: "platform_admin" });
  }

  const result = await featureFlags.isFeatureAllowed(userId, featureKey, userRole, userPlan);
  return c.json(result);
});

// All remaining admin routes require auth + platform admin
adminRoutes.use("*", authMiddleware);
adminRoutes.use("*", platformAdminMiddleware);

// ─── Check admin status ────────────────────────────────────
adminRoutes.get("/status", async (c) => {
  return c.json({ admin: true });
});

// ─── Feature Flags ─────────────────────────────────────────

// List all feature flags
adminRoutes.get("/features", async (c) => {
  const flags = await featureFlags.listAll();
  return c.json(flags);
});

// Get a single feature flag
adminRoutes.get("/features/:key", async (c) => {
  const flag = await featureFlags.getByKey(c.req.param("key"));
  if (!flag) return c.json({ error: "Feature not found" }, 404);
  return c.json(flag);
});

// Update a feature flag
const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  minPlan: z.enum(["free", "pro", "business", "enterprise"]).nullable().optional(),
  minRole: z.enum(["viewer", "member", "admin", "owner"]).nullable().optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

adminRoutes.patch("/features/:key", async (c) => {
  const body = await c.req.json();
  const parsed = updateFlagSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const flag = await featureFlags.update(c.req.param("key"), parsed.data);
  if (!flag) return c.json({ error: "Feature not found" }, 404);
  return c.json(flag);
});

// Create a new feature flag
const createFlagSchema = z.object({
  featureKey: z.string().min(1).regex(/^[a-z_]+$/),
  label: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  minPlan: z.enum(["free", "pro", "business", "enterprise"]).nullable().optional(),
  minRole: z.enum(["viewer", "member", "admin", "owner"]).nullable().optional(),
});

adminRoutes.post("/features", async (c) => {
  const body = await c.req.json();
  const parsed = createFlagSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  try {
    const flag = await featureFlags.create(parsed.data);
    return c.json(flag, 201);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("duplicate")) {
      return c.json({ error: "Feature key already exists" }, 409);
    }
    throw err;
  }
});

// Delete a feature flag
adminRoutes.delete("/features/:key", async (c) => {
  const deleted = await featureFlags.delete(c.req.param("key"));
  if (!deleted) return c.json({ error: "Feature not found" }, 404);
  return c.json({ ok: true });
});

// ─── User Overrides ────────────────────────────────────────

// List overrides for a feature
adminRoutes.get("/features/:key/overrides", async (c) => {
  const overrides = await featureFlags.listOverrides(c.req.param("key"));
  return c.json(overrides);
});

// Set override for a user
const setOverrideSchema = z.object({
  userId: z.string().uuid(),
  enabled: z.boolean(),
});

adminRoutes.post("/features/:key/overrides", async (c) => {
  const body = await c.req.json();
  const parsed = setOverrideSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await featureFlags.setOverride(parsed.data.userId, c.req.param("key"), parsed.data.enabled);
  return c.json({ ok: true });
});

// Remove override for a user
adminRoutes.delete("/features/:key/overrides/:userId", async (c) => {
  const removed = await featureFlags.removeOverride(c.req.param("userId"), c.req.param("key"));
  if (!removed) return c.json({ error: "Override not found" }, 404);
  return c.json({ ok: true });
});

// ─── User Management ───────────────────────────────────────

// List all users
adminRoutes.get("/users", async (c) => {
  const users = await featureFlags.listAllUsers();
  return c.json(users);
});

// Toggle platform admin
const toggleAdminSchema = z.object({
  isPlatformAdmin: z.boolean(),
});

adminRoutes.patch("/users/:userId/admin", async (c) => {
  const body = await c.req.json();
  const parsed = toggleAdminSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const targetUserId = c.req.param("userId");
  const callerId = c.get("userId");

  // Prevent removing your own admin access
  if (targetUserId === callerId && !parsed.data.isPlatformAdmin) {
    return c.json({ error: "Cannot remove your own platform admin access" }, 400);
  }

  await featureFlags.setPlatformAdmin(targetUserId, parsed.data.isPlatformAdmin);
  return c.json({ ok: true });
});

// Get overrides for a specific user
adminRoutes.get("/users/:userId/overrides", async (c) => {
  const overrides = await featureFlags.getUserOverrides(c.req.param("userId"));
  return c.json(overrides);
});
