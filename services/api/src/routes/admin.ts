import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { featureFlagQueries, aiSettingsQueries, workspaceQueries, creditQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { WORKSPACE_PLANS, WORKSPACE_ROLES } from "@doable/shared";
import { getCopilotManager } from "../ai/providers/copilot-manager.js";
import { getChatSessionsSnapshot } from "./chat.js";

const featureFlags = featureFlagQueries(sql);
const aiSettings = aiSettingsQueries(sql, process.env.ENCRYPTION_KEY);
const credits = creditQueries(sql);
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
  minPlan: z.enum(WORKSPACE_PLANS).nullable().optional(),
  minRole: z.enum(WORKSPACE_ROLES).nullable().optional(),
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
  minPlan: z.enum(WORKSPACE_PLANS).nullable().optional(),
  minRole: z.enum(WORKSPACE_ROLES).nullable().optional(),
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

// Set platform role
const setRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES),
});

adminRoutes.patch("/users/:userId/role", async (c) => {
  const body = await c.req.json();
  const parsed = setRoleSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const targetUserId = c.req.param("userId");
  const callerId = c.get("userId");

  // Prevent demoting yourself
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

adminRoutes.patch("/users/:userId/plan", async (c) => {
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

// GET /admin/users/:userId/credits — get credit balance for a user
adminRoutes.get("/users/:userId/credits", async (c) => {
  const userId = c.req.param("userId");
  // Find user's owned workspace
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

// PATCH /admin/users/:userId/credits — set credit allocation for a user
adminRoutes.patch("/users/:userId/credits", async (c) => {
  const userId = c.req.param("userId");
  const body = await c.req.json();
  const parsed = setCreditsSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { dailyCredits, monthlyCredits, rolloverCredits, resetUsage } = parsed.data;

  // Find user's owned workspace
  const [ws] = await sql<{ id: string; plan: string }[]>`
    SELECT w.id, w.plan FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ${userId} AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1
  `;
  if (!ws) return c.json({ error: "User has no workspace" }, 404);

  // Ensure balance row exists
  await credits.getCreditBalance(userId, ws.id);

  // Update individual fields
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

// Helper: copy a copilot account from one workspace to another.
// Returns the ID of the account in the target workspace (reuses existing if same github_login).
async function cloneCopilotAccountToWorkspace(
  sourceAccountId: string,
  targetWorkspaceId: string,
  adminId: string,
  encKey: string
): Promise<string | null> {
  // Get the source account with its decrypted token
  const [source] = await sql<{
    id: string; workspace_id: string; label: string; github_login: string;
    github_id: string | null; is_valid: boolean; decrypted_token: string;
  }[]>`
    SELECT id, workspace_id, label, github_login, github_id, is_valid,
           pgp_sym_decrypt(encrypted_token::bytea, ${encKey}) AS decrypted_token
    FROM github_copilot_accounts
    WHERE id = ${sourceAccountId}
  `;
  if (!source) return null;

  // If already in target workspace, nothing to do — just return the existing ID
  if (source.workspace_id === targetWorkspaceId) return source.id;

  // Check if this github_login already exists in target workspace
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM github_copilot_accounts
    WHERE workspace_id = ${targetWorkspaceId} AND github_login = ${source.github_login}
  `;
  if (existing) {
    // Update the existing account's token and label to stay in sync
    await sql`
      UPDATE github_copilot_accounts
      SET encrypted_token = pgp_sym_encrypt(${source.decrypted_token}, ${encKey}),
          label = ${source.label}, is_valid = ${source.is_valid}
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }

  // Create a copy in the target workspace
  const [newAccount] = await sql<{ id: string }[]>`
    INSERT INTO github_copilot_accounts (
      workspace_id, label, github_login, github_id, encrypted_token, is_valid, added_by
    ) VALUES (
      ${targetWorkspaceId}, ${source.label}, ${source.github_login},
      ${source.github_id}, pgp_sym_encrypt(${source.decrypted_token}, ${encKey}),
      ${source.is_valid}, ${adminId}
    ) RETURNING id
  `;
  return newAccount?.id ?? null;
}

// Helper: copy a custom AI provider from one workspace to another.
async function cloneProviderToWorkspace(
  sourceProviderId: string,
  targetWorkspaceId: string,
  adminId: string,
  encKey: string
): Promise<string | null> {
  const [source] = await sql<{
    id: string; workspace_id: string; label: string; provider_type: string;
    base_url: string; azure_api_version: string | null; is_valid: boolean;
    decrypted_api_key: string | null; decrypted_bearer_token: string | null;
  }[]>`
    SELECT id, workspace_id, label, provider_type, base_url, azure_api_version, is_valid,
           CASE WHEN encrypted_api_key IS NOT NULL
             THEN pgp_sym_decrypt(encrypted_api_key::bytea, ${encKey}) ELSE NULL END AS decrypted_api_key,
           CASE WHEN encrypted_bearer_token IS NOT NULL
             THEN pgp_sym_decrypt(encrypted_bearer_token::bytea, ${encKey}) ELSE NULL END AS decrypted_bearer_token
    FROM ai_providers
    WHERE id = ${sourceProviderId}
  `;
  if (!source) return null;

  if (source.workspace_id === targetWorkspaceId) return source.id;

  // Check if same label+type already exists in target workspace
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM ai_providers
    WHERE workspace_id = ${targetWorkspaceId}
      AND provider_type = ${source.provider_type}::ai_provider_type
      AND base_url = ${source.base_url}
  `;
  if (existing) {
    // Update existing with latest keys
    await sql`
      UPDATE ai_providers
      SET label = ${source.label}, is_valid = ${source.is_valid},
          encrypted_api_key = ${source.decrypted_api_key ? sql`pgp_sym_encrypt(${source.decrypted_api_key}, ${encKey})` : null},
          encrypted_bearer_token = ${source.decrypted_bearer_token ? sql`pgp_sym_encrypt(${source.decrypted_bearer_token}, ${encKey})` : null}
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }

  const [newProvider] = await sql<{ id: string }[]>`
    INSERT INTO ai_providers (
      workspace_id, label, provider_type, base_url, encrypted_api_key,
      encrypted_bearer_token, azure_api_version, is_valid, added_by
    ) VALUES (
      ${targetWorkspaceId}, ${source.label}, ${source.provider_type}::ai_provider_type,
      ${source.base_url},
      ${source.decrypted_api_key ? sql`pgp_sym_encrypt(${source.decrypted_api_key}, ${encKey})` : null},
      ${source.decrypted_bearer_token ? sql`pgp_sym_encrypt(${source.decrypted_bearer_token}, ${encKey})` : null},
      ${source.azure_api_version}, ${source.is_valid}, ${adminId}
    ) RETURNING id
  `;
  return newProvider?.id ?? null;
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "doable-dev-encryption-key";

// Helper: clone copilot/provider into target workspace and write preferences + workspace defaults
async function allocateAiToUser(
  adminId: string,
  targetUserId: string,
  targetWorkspaceId: string,
  sourceCopilotAccountId: string | null,
  sourceProviderId: string | null,
  model: string | null
) {
  let localCopilotId: string | null = null;
  let localProviderId: string | null = null;

  // Clone copilot account into user's workspace
  if (sourceCopilotAccountId) {
    localCopilotId = await cloneCopilotAccountToWorkspace(
      sourceCopilotAccountId, targetWorkspaceId, adminId, ENCRYPTION_KEY
    );
  }

  // Clone provider into user's workspace
  if (sourceProviderId) {
    localProviderId = await cloneProviderToWorkspace(
      sourceProviderId, targetWorkspaceId, adminId, ENCRYPTION_KEY
    );
  }

  // Write user preferences with the LOCAL (workspace-scoped) IDs
  await aiSettings.upsertUserPreferences({
    workspaceId: targetWorkspaceId,
    userId: targetUserId,
    copilotAccountId: localCopilotId,
    providerId: localProviderId,
    model,
  });

  // Also set workspace defaults so all projects in that workspace use this config
  await aiSettings.upsertSettings({
    workspaceId: targetWorkspaceId,
    defaultCopilotAccountId: localCopilotId,
    defaultProviderId: localProviderId,
    defaultModel: model,
    updatedBy: adminId,
  });
}

// Bulk update role and/or plan for multiple users
const bulkUpdateSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  role: z.enum(WORKSPACE_ROLES).optional(),
  plan: z.enum(WORKSPACE_PLANS).optional(),
});

adminRoutes.post("/users/bulk-update", async (c) => {
  const body = await c.req.json();
  const parsed = bulkUpdateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const callerId = c.get("userId");
  const { userIds, role, plan } = parsed.data;

  // Prevent changing own role in bulk
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

// GET /admin/users/ai-allocations
adminRoutes.get("/users/ai-allocations", async (c) => {
  try {
  const adminId = c.get("userId");
  const adminWorkspaceId = await getUserOwnedWorkspace(adminId);

  const rows = await sql`
    SELECT
      u.id AS user_id,
      u.email,
      u.display_name,
      u.avatar_url,
      u.is_platform_admin,
      u.platform_role,
      own_wm.role,
      own_wm.workspace_plan,
      uap.copilot_account_id,
      gca.label AS copilot_account_label,
      uap.provider_id,
      ap.label AS provider_label,
      ap.provider_type,
      uap.model,
      uap.updated_at AS preference_updated_at
    FROM users u
    LEFT JOIN LATERAL (
      SELECT wm.workspace_id, wm.role, w.plan AS workspace_plan
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

  // Return copilot accounts and providers from admin's workspace (the options to assign)
  let accounts: Awaited<ReturnType<typeof aiSettings.listCopilotAccounts>> = [];
  let providers: Awaited<ReturnType<typeof aiSettings.listProviders>> = [];
  if (adminWorkspaceId) {
    [accounts, providers] = await Promise.all([
      aiSettings.listCopilotAccounts(adminWorkspaceId),
      aiSettings.listProviders(adminWorkspaceId),
    ]);
  }

  return c.json({ data: rows, workspaceId: adminWorkspaceId, accounts, providers });
  } catch (err) {
    console.error("[admin/ai-allocations] Error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

const adminAllocateSchema = z.object({
  copilotAccountId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  model: z.string().max(100).nullable().optional(),
});

// PUT /admin/users/:userId/ai-allocation
adminRoutes.put("/users/:userId/ai-allocation", async (c) => {
  const adminId = c.get("userId");
  const targetUserId = c.req.param("userId");
  const body = await c.req.json();
  const parsed = adminAllocateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const targetWorkspaceId = await getUserOwnedWorkspace(targetUserId);
  if (!targetWorkspaceId) return c.json({ error: "Target user has no workspace" }, 400);

  // Also invite to admin's workspace for shared project access
  const adminWorkspaceId = await getUserOwnedWorkspace(adminId);
  if (adminWorkspaceId) {
    await ensureWorkspaceMember(adminWorkspaceId, targetUserId, adminId);
  }

  await allocateAiToUser(
    adminId, targetUserId, targetWorkspaceId,
    parsed.data.copilotAccountId ?? null,
    parsed.data.providerId ?? null,
    parsed.data.model ?? null
  );

  return c.json({ data: { ok: true } });
});

const adminBulkCopySchema = z.object({
  targetUserIds: z.array(z.string().uuid()).min(1).max(100),
});

// POST /admin/users/ai-allocations/copy-my-settings
adminRoutes.post("/users/ai-allocations/copy-my-settings", async (c) => {
  const adminId = c.get("userId");
  const body = await c.req.json();
  const parsed = adminBulkCopySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const adminWorkspaceId = await getUserOwnedWorkspace(adminId);
  if (!adminWorkspaceId) return c.json({ error: "No workspace found for admin" }, 400);

  // Get admin's effective AI settings (personal override → workspace defaults)
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
    const targetWsId = await getUserOwnedWorkspace(targetId);
    if (!targetWsId) continue;

    await ensureWorkspaceMember(adminWorkspaceId, targetId, adminId);
    await allocateAiToUser(adminId, targetId, targetWsId, copilotAccountId, providerId, model);
    updated++;
  }

  return c.json({ data: { updated } });
});

// DELETE /admin/users/:userId/ai-allocation
adminRoutes.delete("/users/:userId/ai-allocation", async (c) => {
  const targetUserId = c.req.param("userId");

  const targetWorkspaceId = await getUserOwnedWorkspace(targetUserId);
  if (!targetWorkspaceId) return c.json({ error: "Target user has no workspace" }, 400);

  await aiSettings.deleteUserPreferences(targetWorkspaceId, targetUserId);
  return c.json({ data: { userId: targetUserId, reset: true } });
});

// ─── Git Migration ─────────────────────────────────────────
// POST /admin/migrate-to-git — batch migrate all projects to git
adminRoutes.post("/migrate-to-git", async (c) => {
  try {
    const { migrateAllProjects } = await import("../git/migrate.js");
    const result = await migrateAllProjects();
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Migration failed", message }, 500);
  }
});

// ─── Thumbnail Management ─────────────────────────────────

// GET /admin/thumbnail-logs — get recent thumbnail generation logs
adminRoutes.get("/thumbnail-logs", async (c) => {
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  try {
    const logs = await sql`
      SELECT tl.id, tl.project_id, tl.project_name, tl.status, tl.preview_url,
             tl.error_message, tl.duration_ms, tl.triggered_by, tl.created_at,
             p.name as current_project_name
      FROM thumbnail_logs tl
      LEFT JOIN projects p ON p.id = tl.project_id
      ORDER BY tl.created_at DESC
      LIMIT ${limit}
    `;
    return c.json({ data: logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to fetch thumbnail logs", message }, 500);
  }
});

// POST /admin/thumbnails/generate-missing — generate thumbnails for all projects that are missing one
adminRoutes.post("/thumbnails/generate-missing", async (c) => {
  try {
    const { captureProjectThumbnail, thumbnailExists } = await import("../thumbnails/capture.js");
    const apiPort = parseInt(process.env.API_PORT ?? "4000", 10);

    // Get all projects
    const projects = await sql<{ id: string; name: string; thumbnail_url: string | null }[]>`
      SELECT id, name, thumbnail_url FROM projects ORDER BY updated_at DESC
    `;

    const missing: { id: string; name: string }[] = [];
    for (const p of projects) {
      if (!thumbnailExists(p.id)) {
        missing.push({ id: p.id, name: p.name });
      }
    }

    if (missing.length === 0) {
      return c.json({ data: { total: projects.length, missing: 0, queued: 0, message: "All projects already have thumbnails" } });
    }

    // Process in background — return immediately with count
    const queued = missing.length;

    // Fire and forget: generate thumbnails sequentially to avoid overwhelming Puppeteer
    (async () => {
      for (const project of missing) {
        const previewUrl = `http://127.0.0.1:${apiPort}/preview/${project.id}/`;
        try {
          const filePath = await captureProjectThumbnail(project.id, previewUrl, {
            retries: 3,
            retryDelayMs: 5000,
            triggeredBy: "admin" as const,
          });
          if (filePath) {
            const thumbnailUrl = `/thumbnails/${project.id}.png`;
            await sql`UPDATE projects SET thumbnail_url = ${thumbnailUrl}, updated_at = NOW() WHERE id = ${project.id}`;
          }
        } catch (e) {
          console.warn(`[Thumbnail Admin] Failed for ${project.id}:`, e);
        }
      }
      console.log(`[Thumbnail Admin] Finished generating ${queued} missing thumbnails`);
    })();

    return c.json({ data: { total: projects.length, missing: queued, queued, message: `Generating ${queued} missing thumbnails in background` } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to generate thumbnails", message }, 500);
  }
});

// ─── Copilot Sessions Monitoring ─────────────────────────────

// GET /admin/copilot-sessions — list all active engines + chat sessions
adminRoutes.get("/copilot-sessions", async (c) => {
  const manager = getCopilotManager();
  const poolSnapshot = manager.getPoolSnapshot();
  const chatSessions = getChatSessionsSnapshot();
  const mem = process.memoryUsage();

  // Enrich with project names from DB (filter out non-UUID keys like "models")
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const projectIds = [...new Set(poolSnapshot.map((e) => e.projectId))].filter((id) => uuidRe.test(id));
  let projectNames: Record<string, string> = {};
  if (projectIds.length > 0) {
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM projects WHERE id = ANY(${projectIds})
    `;
    projectNames = Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }

  const engines = poolSnapshot.map((e) => ({
    ...e,
    projectName: projectNames[e.projectId] ?? null,
    chatSessions: chatSessions.filter((s) => s.projectId === e.projectId),
  }));

  return c.json({
    data: {
      engines,
      poolSize: manager.poolSize,
      maxEngines: 20,
      processMemory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      uptime: process.uptime(),
    },
  });
});

// DELETE /admin/copilot-sessions/:projectId — terminate a specific engine
adminRoutes.delete("/copilot-sessions/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const manager = getCopilotManager();
  await manager.evictEngine(projectId);
  return c.json({ data: { projectId, terminated: true } });
});

// DELETE /admin/copilot-sessions — terminate ALL engines
adminRoutes.delete("/copilot-sessions", async (c) => {
  const manager = getCopilotManager();
  const count = manager.poolSize;
  await manager.stopAll();
  return c.json({ data: { terminated: count } });
});
