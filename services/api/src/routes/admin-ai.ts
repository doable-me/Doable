import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { aiSettingsQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);

export const adminAiRoutes = new Hono<AuthEnv>();

adminAiRoutes.use("*", authMiddleware);
adminAiRoutes.use("*", platformAdminMiddleware);

// ─── AI Allocation helpers ──────────────────────────────

async function getUserOwnedWorkspace(userId: string) {
  const [ws] = await sql<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    INNER JOIN workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.user_id = ${userId} AND wm.role = 'owner'
    ORDER BY w.created_at ASC LIMIT 1
  `;
  return ws?.id ?? null;
}

async function cloneCopilotAccountToWorkspace(
  sourceAccountId: string,
  targetWorkspaceId: string,
  adminId: string,
  encKey: string
): Promise<string | null> {
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

  if (source.workspace_id === targetWorkspaceId) return source.id;

  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM github_copilot_accounts
    WHERE workspace_id = ${targetWorkspaceId} AND github_login = ${source.github_login}
  `;
  if (existing) {
    await sql`
      UPDATE github_copilot_accounts
      SET encrypted_token = pgp_sym_encrypt(${source.decrypted_token}, ${encKey}),
          label = ${source.label}, is_valid = ${source.is_valid}
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }

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

  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM ai_providers
    WHERE workspace_id = ${targetWorkspaceId}
      AND provider_type = ${source.provider_type}::ai_provider_type
      AND base_url = ${source.base_url}
  `;
  if (existing) {
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

async function allocateAiToUser(
  adminId: string,
  targetUserId: string,
  targetWorkspaceId: string,
  alloc: {
    source: "copilot" | "custom";
    copilotAccountId: string | null;
    copilotModel: string | null;
    providerId: string | null;
    providerModel: string | null;
  }
) {
  let localCopilotId: string | null = null;
  let localProviderId: string | null = null;

  if (alloc.copilotAccountId) {
    localCopilotId = await cloneCopilotAccountToWorkspace(
      alloc.copilotAccountId, targetWorkspaceId, adminId, ENCRYPTION_KEY
    );
  }

  if (alloc.providerId) {
    localProviderId = await cloneProviderToWorkspace(
      alloc.providerId, targetWorkspaceId, adminId, ENCRYPTION_KEY
    );
  }

  await aiSettings.upsertUserPreferences({
    workspaceId: targetWorkspaceId,
    userId: targetUserId,
    source: alloc.source,
    copilotAccountId: localCopilotId,
    copilotModel: alloc.copilotModel,
    providerId: localProviderId,
    providerModel: alloc.providerModel,
  });

  await aiSettings.upsertSettings({
    workspaceId: targetWorkspaceId,
    defaultSource: alloc.source,
    defaultCopilotAccountId: localCopilotId,
    defaultCopilotModel: alloc.copilotModel,
    defaultProviderId: localProviderId,
    defaultProviderModel: alloc.providerModel,
    updatedBy: adminId,
  });
}

// ─── AI Allocation Routes ────────────────────────────────

// GET /admin/users/ai-allocations
adminAiRoutes.get("/users/ai-allocations", async (c) => {
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
      uap.source,
      uap.copilot_account_id,
      gca.label AS copilot_account_label,
      uap.copilot_model,
      uap.provider_id,
      ap.label AS provider_label,
      ap.provider_type,
      uap.provider_model,
      uap.model,
      uap.updated_at AS preference_updated_at,
      cb.daily_credits,
      cb.daily_credits_used,
      cb.monthly_credits,
      cb.monthly_credits_used,
      cb.rollover_credits,
      was.enforce_ai,
      was.enforced_model,
      was.default_source,
      was.default_copilot_model,
      was.default_provider_model,
      was.default_copilot_account_id AS ws_default_copilot_account_id,
      was.default_provider_id AS ws_default_provider_id
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
    LEFT JOIN credit_balances cb
      ON cb.user_id = u.id AND cb.workspace_id = own_wm.workspace_id
    LEFT JOIN workspace_ai_settings was
      ON was.workspace_id = own_wm.workspace_id
    ORDER BY u.created_at ASC
  `;

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
  source: z.enum(["copilot", "custom"]).optional(),
  copilotAccountId: z.string().uuid().nullable().optional(),
  copilotModel: z.string().max(100).nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  providerModel: z.string().max(100).nullable().optional(),
});

// PUT /admin/users/:userId/ai-allocation
adminAiRoutes.put("/users/:userId/ai-allocation", async (c) => {
  const adminId = c.get("userId");
  const targetUserId = c.req.param("userId");
  const body = await c.req.json();
  const parsed = adminAllocateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const targetWorkspaceId = await getUserOwnedWorkspace(targetUserId);
  if (!targetWorkspaceId) return c.json({ error: "Target user has no workspace" }, 400);

  // Note: AI artifacts are cloned into the target user's own workspace
  // (see allocateAiToUser → cloneCopilotAccountToWorkspace/cloneProviderToWorkspace).
  // We intentionally do NOT add the target user to the admin's workspace here —
  // doing so silently polluted the admin's member list with every user they touched.

  const source: "copilot" | "custom" =
    parsed.data.source ??
    (parsed.data.providerId ? "custom" : "copilot");

  await allocateAiToUser(adminId, targetUserId, targetWorkspaceId, {
    source,
    copilotAccountId: parsed.data.copilotAccountId ?? null,
    copilotModel: source === "copilot" ? (parsed.data.copilotModel ?? null) : null,
    providerId: parsed.data.providerId ?? null,
    providerModel: source === "custom" ? (parsed.data.providerModel ?? null) : null,
  });

  return c.json({ data: { ok: true } });
});

const adminBulkCopySchema = z.object({
  targetUserIds: z.array(z.string().uuid()).min(1).max(100),
});

// POST /admin/users/ai-allocations/copy-my-settings
adminAiRoutes.post("/users/ai-allocations/copy-my-settings", async (c) => {
  const adminId = c.get("userId");
  const body = await c.req.json();
  const parsed = adminBulkCopySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const adminWorkspaceId = await getUserOwnedWorkspace(adminId);
  if (!adminWorkspaceId) return c.json({ error: "No workspace found for admin" }, 400);

  let source: "copilot" | "custom" = "copilot";
  let copilotAccountId: string | null = null;
  let copilotModel: string | null = null;
  let providerId: string | null = null;
  let providerModel: string | null = null;

  const adminPrefs = await aiSettings.getUserPreferences(adminWorkspaceId, adminId);
  if (
    adminPrefs &&
    (adminPrefs.copilot_account_id ||
      adminPrefs.provider_id ||
      adminPrefs.copilot_model ||
      adminPrefs.provider_model)
  ) {
    source = adminPrefs.source;
    copilotAccountId = adminPrefs.copilot_account_id;
    copilotModel = adminPrefs.copilot_model;
    providerId = adminPrefs.provider_id;
    providerModel = adminPrefs.provider_model;
  } else {
    const wsDefaults = await aiSettings.getSettings(adminWorkspaceId);
    if (wsDefaults) {
      source = wsDefaults.default_source;
      copilotAccountId = wsDefaults.default_copilot_account_id;
      copilotModel = wsDefaults.default_copilot_model;
      providerId = wsDefaults.default_provider_id;
      providerModel = wsDefaults.default_provider_model;
    }
  }

  let updated = 0;
  for (const targetId of parsed.data.targetUserIds) {
    const targetWsId = await getUserOwnedWorkspace(targetId);
    if (!targetWsId) continue;

    // Do NOT add target user to admin's workspace — clone happens in target's own workspace.
    await allocateAiToUser(adminId, targetId, targetWsId, {
      source,
      copilotAccountId,
      copilotModel,
      providerId,
      providerModel,
    });
    updated++;
  }

  return c.json({ data: { updated } });
});

// DELETE /admin/users/:userId/ai-allocation
adminAiRoutes.delete("/users/:userId/ai-allocation", async (c) => {
  const targetUserId = c.req.param("userId");

  const targetWorkspaceId = await getUserOwnedWorkspace(targetUserId);
  if (!targetWorkspaceId) return c.json({ error: "Target user has no workspace" }, 400);

  await aiSettings.deleteUserPreferences(targetWorkspaceId, targetUserId);
  return c.json({ data: { userId: targetUserId, reset: true } });
});
