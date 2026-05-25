import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/index.js";
import { aiSettingsQueries, platformAiDefaultsQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";
import { getConfig } from "../lib/platformConfig.js";
import { savePlatformEmbeddingProvider } from "./setup.js";
import { recordAdminAction } from "../admin/audit-log.js";

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);
const platformDefaults = platformAiDefaultsQueries(sql);

export const adminAiRoutes = new Hono<AuthEnv>({ strict: false });

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
      -- Personal rows are private to the owning user. Don't leak their
      -- id/label/type to other admins; just flag that a personal selection
      -- exists. Migration 072.
      CASE WHEN gca.scope = 'user' THEN NULL ELSE uap.copilot_account_id END AS copilot_account_id,
      CASE WHEN gca.scope = 'user' THEN NULL ELSE gca.label END AS copilot_account_label,
      gca.scope AS copilot_account_scope,
      uap.copilot_model,
      CASE WHEN ap.scope  = 'user' THEN NULL ELSE uap.provider_id        END AS provider_id,
      CASE WHEN ap.scope  = 'user' THEN NULL ELSE ap.label               END AS provider_label,
      CASE WHEN ap.scope  = 'user' THEN NULL ELSE ap.provider_type::text END AS provider_type,
      ap.scope AS provider_scope,
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

// ─── Platform AI Defaults (per plan tier) ────────────────

// GET /admin/platform-ai-defaults
adminAiRoutes.get("/platform-ai-defaults", async (c) => {
  try {
    const defaults = await platformDefaults.listAll();
    return c.json({ data: defaults });
  } catch (err: any) {
    // Table may not exist yet if migration 056 hasn't been applied
    if (err?.code === "42P01") {
      console.warn("[admin/platform-ai-defaults] Table does not exist yet — run pnpm db:migrate");
      return c.json({ data: [] });
    }
    console.error("[admin/platform-ai-defaults] Error:", err);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

const platformDefaultSchema = z.object({
  source: z.enum(["copilot", "custom"]).optional(),
  copilotAccountId: z.string().uuid().nullable().optional(),
  copilotModel: z.string().max(100).nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  providerModel: z.string().max(100).nullable().optional(),
});

// PUT /admin/platform-ai-defaults/:plan
adminAiRoutes.put("/platform-ai-defaults/:plan", async (c) => {
  const adminId = c.get("userId");
  const plan = c.req.param("plan");
  if (!["free", "pro", "business", "enterprise"].includes(plan)) {
    return c.json({ error: "Invalid plan tier" }, 400);
  }

  const body = await c.req.json();
  const parsed = platformDefaultSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const source: "copilot" | "custom" =
    parsed.data.source ?? (parsed.data.providerId ? "custom" : "copilot");

  const row = await platformDefaults.upsert({
    plan,
    source,
    copilotAccountId: source === "copilot" ? (parsed.data.copilotAccountId ?? null) : null,
    copilotModel: source === "copilot" ? (parsed.data.copilotModel ?? null) : null,
    providerId: source === "custom" ? (parsed.data.providerId ?? null) : null,
    providerModel: source === "custom" ? (parsed.data.providerModel ?? null) : null,
    updatedBy: adminId,
  });

  console.log(`[Admin] Platform AI default updated for plan=${plan} source=${source} by ${adminId}`);
  return c.json({ data: row });
});

// POST /admin/platform-ai-defaults/apply-to-existing
// Retroactively apply platform defaults to all workspaces on a given plan
// that don't have a copilot account or provider configured yet.
const applyExistingSchema = z.object({
  plan: z.enum(["free", "pro", "business", "enterprise"]),
  overwrite: z.boolean().default(false),
});

// ─── Platform-default Embedding Provider ─────────────────
//
// Set once during /setup, editable any time afterwards from /admin. Every
// workspace inherits it silently (resolveEmbeddingEngine() walks project →
// workspace → platform-default). End users never see embeddings config —
// they just say "build me a chatbot with my docs" and Doable does the rest.

adminAiRoutes.get("/embedding-provider", async (c) => {
  const [provider, baseUrl, model, apiKey] = await Promise.all([
    getConfig("setup.embedding_provider"),
    getConfig("setup.embedding_base_url"),
    getConfig("setup.embedding_model"),
    getConfig("setup.embedding_api_key"),
  ]);
  return c.json({
    data: {
      provider: provider ?? null,
      baseUrl: baseUrl ?? null,
      model: model ?? null,
      configured: !!(provider && apiKey),
      apiKeyMasked: apiKey ? "••••••••" : null,
    },
  });
});

const adminEmbeddingProviderSchema = z.object({
  provider: z
    .enum(["openai", "gemini", "custom"])
    .transform((v) => (v === "gemini" ? "openai" : v === "custom" ? "openai" : v)),
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1).max(120),
});

adminAiRoutes.put("/embedding-provider", async (c) => {
  const parsed = adminEmbeddingProviderSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const userId = c.get("userId");
  const saved = await savePlatformEmbeddingProvider({
    userId,
    provider: parsed.data.provider as "openai" | "anthropic",
    apiKey: parsed.data.apiKey,
    baseUrl: parsed.data.baseUrl,
    model: parsed.data.model,
    bindToAdminWorkspace: true,
  });
  if (!saved.ok) {
    return c.json({ ok: false, error: "EMBEDDING_PROBE_FAILED", detail: saved.error }, 422);
  }
  recordAdminAction(c, {
    action: "admin_update_embedding_provider",
    details: { provider: parsed.data.provider, model: parsed.data.model, baseUrl: parsed.data.baseUrl, dims: saved.dims },
  }).catch(() => {});
  return c.json({ ok: true, providerId: saved.providerId, dimensions: saved.dims });
});

adminAiRoutes.post("/platform-ai-defaults/apply-to-existing", async (c) => {
  const adminId = c.get("userId");
  const body = await c.req.json();
  const parsed = applyExistingSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);

  const { plan, overwrite } = parsed.data;
  const defaults = await platformDefaults.getForPlan(plan);
  if (!defaults || (!defaults.copilot_account_id && !defaults.provider_id)) {
    return c.json({ error: `No platform AI default configured for plan '${plan}'` }, 400);
  }

  // Find all workspaces on this plan
  const workspaces = await sql<{ id: string; owner_id: string }[]>`
    SELECT w.id, w.owner_id FROM workspaces w WHERE w.plan = ${plan}
  `;

  let updated = 0;
  for (const ws of workspaces) {
    if (!overwrite) {
      // Skip workspaces that already have a copilot account or provider configured
      const [existing] = await sql<{ has_config: boolean }[]>`
        SELECT (default_copilot_account_id IS NOT NULL OR default_provider_id IS NOT NULL) AS has_config
        FROM workspace_ai_settings WHERE workspace_id = ${ws.id}
      `;
      if (existing?.has_config) continue;
    }

    await allocateAiToUser(adminId, ws.owner_id, ws.id, {
      source: defaults.source as "copilot" | "custom",
      copilotAccountId: defaults.copilot_account_id,
      copilotModel: defaults.copilot_model,
      providerId: defaults.provider_id,
      providerModel: defaults.provider_model,
    });
    updated++;
  }

  console.log(`[Admin] Applied platform AI defaults for plan=${plan} to ${updated}/${workspaces.length} workspaces`);
  return c.json({ data: { plan, total: workspaces.length, updated } });
});

// ─── GET /admin/ai/abuse-flags — Phase 3 abuse analytics ─────────────────
//
// Returns ai_usage_log rows where is_flagged_abuse = true, newest first.
// Used by the Vigil admin dashboard to surface anomalous runtime AI requests.
//
// Query params:
//   limit    — rows to return, 1–200, default 50.
//   offset   — pagination, default 0.
//   resolved — "true" / "false" / omit → return all.  (future: let admin
//              mark a flag resolved; for now every flagged row is surfaced.)

adminAiRoutes.get("/abuse-flags", async (c) => {
  const rawLimit  = parseInt(c.req.query("limit")  ?? "50", 10);
  const rawOffset = parseInt(c.req.query("offset") ?? "0",  10);
  const limit  = Math.min(200, Math.max(1, isNaN(rawLimit)  ? 50  : rawLimit));
  const offset = Math.max(0,              isNaN(rawOffset)  ? 0   : rawOffset);

  const rows = await sql<Array<{
    id:                  string;
    project_id:          string;
    workspace_id:        string | null;
    user_id:             string | null;
    app_user_id:         string | null;
    mode:                string | null;
    model:               string | null;
    total_tokens:        number | null;
    estimated_cost_usd:  string | number | null;
    duration_ms:         number | null;
    created_at:          string;
  }>>`
    SELECT
      id, project_id, workspace_id, user_id, app_user_id,
      mode, model,
      total_tokens, estimated_cost_usd, duration_ms, created_at
    FROM ai_usage_log
    WHERE is_flagged_abuse = true
    ORDER BY created_at DESC
    LIMIT  ${limit}
    OFFSET ${offset}
  `;

  const [{ total }] = await sql<[{ total: string | number }]>`
    SELECT COUNT(*)::bigint AS total
    FROM ai_usage_log
    WHERE is_flagged_abuse = true
  `;

  return c.json({
    data: rows.map((r) => ({
      id:               r.id,
      projectId:        r.project_id,
      workspaceId:      r.workspace_id,
      userId:           r.user_id,
      appUserId:        r.app_user_id,
      mode:             r.mode,
      model:            r.model,
      totalTokens:      r.total_tokens,
      estimatedCostUsd: r.estimated_cost_usd === null ? null : Number(r.estimated_cost_usd),
      durationMs:       r.duration_ms,
      createdAt:        r.created_at,
    })),
    meta: {
      total: Number(total),
      limit,
      offset,
    },
  });
});
