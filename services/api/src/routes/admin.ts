import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { featureFlagQueries, aiSettingsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";

const featureFlags = featureFlagQueries(sql);
const aiSettings = aiSettingsQueries(sql, process.env.ENCRYPTION_KEY);
const workspaces = workspaceQueries(sql);

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

// ─── AI Allocation (platform-level) ──────────────────────

// Helper: get a user's primary workspace (the one they own)
async function getUserOwnedWorkspace(userId: string) {
  const [ws] = await sql<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ${userId} AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1
  `;
  return ws?.id ?? null;
}

// Helper: ensure user is a member of a workspace
async function ensureWorkspaceMember(workspaceId: string, userId: string, invitedBy: string) {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) {
    await workspaces.addMember(workspaceId, userId, "member", invitedBy);
  }
}

// GET /admin/users/ai-allocations — all users with their AI allocation in their own workspace
adminRoutes.get("/users/ai-allocations", async (c) => {
  const adminId = c.get("userId");
  const adminWorkspaceId = await getUserOwnedWorkspace(adminId);

  // For each user, look up their AI preferences in THEIR OWN workspace (the one they own).
  // This way the admin sees what each user actually experiences.
  const rows = await sql`
    SELECT
      u.id AS user_id,
      u.email,
      u.display_name,
      u.avatar_url,
      u.is_platform_admin,
      own_wm.role,
      uap.copilot_account_id,
      gca.label AS copilot_account_label,
      uap.provider_id,
      ap.label AS provider_label,
      ap.provider_type,
      uap.model,
      uap.updated_at AS preference_updated_at
    FROM users u
    LEFT JOIN LATERAL (
      SELECT wm.workspace_id, wm.role
      FROM workspace_members wm
      INNER JOIN workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = u.id AND wm.role = 'owner'
      ORDER BY w.created_at ASC LIMIT 1
    ) own_wm ON true
    LEFT JOIN user_ai_preferences uap
      ON uap.workspace_id = own_wm.workspace_id AND uap.user_id = u.id
    LEFT JOIN github_copilot_accounts gca
      ON gca.id = uap.copilot_account_id
    LEFT JOIN ai_providers ap
      ON ap.id = uap.provider_id
    ORDER BY u.created_at ASC
  `;

  // Return copilot accounts and providers from admin's workspace (these are the options to assign)
  let accounts: Awaited<ReturnType<typeof aiSettings.listCopilotAccounts>> = [];
  let providers: Awaited<ReturnType<typeof aiSettings.listProviders>> = [];
  if (adminWorkspaceId) {
    [accounts, providers] = await Promise.all([
      aiSettings.listCopilotAccounts(adminWorkspaceId),
      aiSettings.listProviders(adminWorkspaceId),
    ]);
  }

  return c.json({ data: rows, workspaceId: adminWorkspaceId, accounts, providers });
});

const adminAllocateSchema = z.object({
  copilotAccountId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  model: z.string().max(100).nullable().optional(),
});

// PUT /admin/users/:userId/ai-allocation — write AI prefs into the TARGET USER's own workspace
adminRoutes.put("/users/:userId/ai-allocation", async (c) => {
  const adminId = c.get("userId");
  const targetUserId = c.req.param("userId");
  const body = await c.req.json();
  const parsed = adminAllocateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  // Write to the TARGET user's own workspace so they see it when they log in
  const targetWorkspaceId = await getUserOwnedWorkspace(targetUserId);
  if (!targetWorkspaceId) return c.json({ error: "Target user has no workspace" }, 400);

  // Also add target user to admin's workspace so they can access shared projects
  const adminWorkspaceId = await getUserOwnedWorkspace(adminId);
  if (adminWorkspaceId) {
    await ensureWorkspaceMember(adminWorkspaceId, targetUserId, adminId);
  }

  const result = await aiSettings.upsertUserPreferences({
    workspaceId: targetWorkspaceId,
    userId: targetUserId,
    copilotAccountId: parsed.data.copilotAccountId ?? null,
    providerId: parsed.data.providerId ?? null,
    model: parsed.data.model ?? null,
  });

  return c.json({ data: result });
});

const adminBulkCopySchema = z.object({
  targetUserIds: z.array(z.string().uuid()).min(1).max(100),
});

// POST /admin/users/ai-allocations/copy-my-settings — copy admin's settings into each user's own workspace
adminRoutes.post("/users/ai-allocations/copy-my-settings", async (c) => {
  const adminId = c.get("userId");
  const body = await c.req.json();
  const parsed = adminBulkCopySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const adminWorkspaceId = await getUserOwnedWorkspace(adminId);
  if (!adminWorkspaceId) return c.json({ error: "No workspace found for admin" }, 400);

  // Get admin's own preferences, or fall back to workspace defaults
  let copilotAccountId: string | null = null;
  let providerId: string | null = null;
  let model: string | null = null;

  const adminPrefs = await aiSettings.getUserPreferences(adminWorkspaceId, adminId);
  if (adminPrefs && (adminPrefs.copilot_account_id || adminPrefs.provider_id || adminPrefs.model)) {
    copilotAccountId = adminPrefs.copilot_account_id;
    providerId = adminPrefs.provider_id;
    model = adminPrefs.model;
  } else {
    const wsDefaults = await aiSettings.getSettings(adminWorkspaceId);
    if (wsDefaults) {
      copilotAccountId = wsDefaults.default_copilot_account_id;
      providerId = wsDefaults.default_provider_id;
      model = wsDefaults.default_model;
    }
  }

  let updated = 0;
  for (const targetId of parsed.data.targetUserIds) {
    // Write to each target user's own workspace
    const targetWsId = await getUserOwnedWorkspace(targetId);
    if (!targetWsId) continue;

    // Also invite them to admin's workspace for shared access
    await ensureWorkspaceMember(adminWorkspaceId, targetId, adminId);

    await aiSettings.upsertUserPreferences({
      workspaceId: targetWsId,
      userId: targetId,
      copilotAccountId,
      providerId,
      model,
    });
    updated++;
  }

  return c.json({ data: { updated } });
});

// DELETE /admin/users/:userId/ai-allocation — reset from user's own workspace
adminRoutes.delete("/users/:userId/ai-allocation", async (c) => {
  const targetUserId = c.req.param("userId");

  const targetWorkspaceId = await getUserOwnedWorkspace(targetUserId);
  if (!targetWorkspaceId) return c.json({ error: "Target user has no workspace" }, 400);

  await aiSettings.deleteUserPreferences(targetWorkspaceId, targetUserId);
  return c.json({ data: { userId: targetUserId, reset: true } });
});
