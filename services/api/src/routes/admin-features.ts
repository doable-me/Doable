import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { featureFlagQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { WORKSPACE_PLANS, WORKSPACE_ROLES } from "@doable/shared";

const featureFlags = featureFlagQueries(sql);

export const adminFeatureRoutes = new Hono<AuthEnv>();

adminFeatureRoutes.use("*", authMiddleware);
adminFeatureRoutes.use("*", platformAdminMiddleware);

// ─── Feature Flags ─────────────────────────────────────────

// List all feature flags
adminFeatureRoutes.get("/features", async (c) => {
  const flags = await featureFlags.listAll();
  return c.json(flags);
});

// Get a single feature flag
adminFeatureRoutes.get("/features/:key", async (c) => {
  const flag = await featureFlags.getByKey(c.req.param("key"));
  if (!flag) return c.json({ error: "Feature not found" }, 404);
  return c.json(flag);
});

// Update a feature flag
const updateFlagSchema = z.object({
  enabled: z.boolean().optional(),
  minPlan: z.enum(WORKSPACE_PLANS).nullable().optional(),
  minRole: z.enum(WORKSPACE_ROLES).nullable().optional(),
  label: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

adminFeatureRoutes.patch("/features/:key", async (c) => {
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
  minPlan: z.enum(WORKSPACE_PLANS).nullable().optional(),
  minRole: z.enum(WORKSPACE_ROLES).nullable().optional(),
});

adminFeatureRoutes.post("/features", async (c) => {
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
adminFeatureRoutes.delete("/features/:key", async (c) => {
  const deleted = await featureFlags.delete(c.req.param("key"));
  if (!deleted) return c.json({ error: "Feature not found" }, 404);
  return c.json({ ok: true });
});

// ─── User Overrides ────────────────────────────────────────

// List overrides for a feature
adminFeatureRoutes.get("/features/:key/overrides", async (c) => {
  const overrides = await featureFlags.listOverrides(c.req.param("key"));
  return c.json(overrides);
});

// Set override for a user
const setOverrideSchema = z.object({
  userId: z.string().uuid(),
  enabled: z.boolean(),
});

adminFeatureRoutes.post("/features/:key/overrides", async (c) => {
  const body = await c.req.json();
  const parsed = setOverrideSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  await featureFlags.setOverride(parsed.data.userId, c.req.param("key"), parsed.data.enabled);
  return c.json({ ok: true });
});

// Remove override for a user
adminFeatureRoutes.delete("/features/:key/overrides/:userId", async (c) => {
  const removed = await featureFlags.removeOverride(c.req.param("userId"), c.req.param("key"));
  if (!removed) return c.json({ error: "Override not found" }, 404);
  return c.json({ ok: true });
});
