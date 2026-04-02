import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { aiSettingsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import type { WorkspaceRole } from "@doable/shared";

const aiSettings = aiSettingsQueries(sql, process.env.ENCRYPTION_KEY);
const workspaces = workspaceQueries(sql);

export const aiSettingsRoutes = new Hono<AuthEnv>();

// All AI settings routes require authentication
aiSettingsRoutes.use("*", authMiddleware);

// ─── Role helpers ──────────────────────────────────────────
const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin"];

async function requireAdmin(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  if (!ADMIN_ROLES.includes(role)) return "Requires admin or owner role";
  return null;
}

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

// ─── GitHub Copilot Accounts ──────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/copilot-accounts
aiSettingsRoutes.get("/:workspaceId/ai-settings/copilot-accounts", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const accounts = await aiSettings.listCopilotAccounts(workspaceId);
  return c.json({ data: accounts });
});

const addCopilotAccountSchema = z.object({
  label: z.string().min(1).max(100),
  githubToken: z.string().min(1),
});

// POST /workspaces/:workspaceId/ai-settings/copilot-accounts
aiSettingsRoutes.post(
  "/:workspaceId/ai-settings/copilot-accounts",
  zValidator("json", addCopilotAccountSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const { label, githubToken } = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    // Validate the token by fetching the GitHub user
    let ghUser: { login: string; id: number };
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${githubToken}` },
      });
      if (!res.ok) return c.json({ error: "Invalid GitHub token" }, 400);
      ghUser = (await res.json()) as { login: string; id: number };
    } catch {
      return c.json({ error: "Failed to validate GitHub token" }, 400);
    }

    // Also verify Copilot API access — catch early if the token lacks Copilot scopes
    try {
      const { CopilotClient } = await import("@github/copilot-sdk");
      const client = new CopilotClient({ githubToken });
      await client.start();
      const models = await client.listModels();
      await client.stop();
      if (models.length === 0) {
        return c.json({ error: "GitHub token is valid but has no Copilot access. Check your Copilot subscription." }, 400);
      }
    } catch (sdkErr) {
      const msg = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      if (msg.includes("not authorized") || msg.includes("unauthorized")) {
        return c.json({ error: "GitHub token works but Copilot API access is denied. Re-authorize with Copilot scopes or check your subscription." }, 400);
      }
      // Non-critical — allow adding even if SDK check fails transiently
      console.warn("[AI Settings] Copilot access check failed (non-blocking):", msg);
    }

    try {
      const account = await aiSettings.addCopilotAccount({
        workspaceId,
        label,
        githubLogin: ghUser.login,
        githubId: String(ghUser.id),
        token: githubToken,
        addedBy: userId,
      });

      // Don't return encrypted_token
      const { encrypted_token, ...safe } = account;
      return c.json({ data: safe }, 201);
    } catch (dbErr: unknown) {
      const msg = dbErr instanceof Error ? dbErr.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return c.json({ error: "This GitHub account is already connected" }, 409);
      }
      throw dbErr;
    }
  }
);

const updateCopilotAccountSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  githubToken: z.string().min(1).optional(),
});

// PATCH /workspaces/:workspaceId/ai-settings/copilot-accounts/:id
aiSettingsRoutes.patch(
  "/:workspaceId/ai-settings/copilot-accounts/:id",
  zValidator("json", updateCopilotAccountSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const accountId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const updated = await aiSettings.updateCopilotAccount(accountId, {
      label: body.label,
      token: body.githubToken,
      isValid: body.githubToken ? true : undefined,
    });

    if (!updated) return c.json({ error: "Account not found" }, 404);

    const { encrypted_token, ...safe } = updated;
    return c.json({ data: safe });
  }
);

// DELETE /workspaces/:workspaceId/ai-settings/copilot-accounts/:id
aiSettingsRoutes.delete("/:workspaceId/ai-settings/copilot-accounts/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const accountId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const deleted = await aiSettings.deleteCopilotAccount(accountId);
  if (!deleted) return c.json({ error: "Account not found" }, 404);

  return c.json({ data: { id: accountId, deleted: true } });
});

// POST /workspaces/:workspaceId/ai-settings/copilot-accounts/:id/validate
aiSettingsRoutes.post("/:workspaceId/ai-settings/copilot-accounts/:id/validate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const accountId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const token = await aiSettings.getCopilotAccountToken(accountId);
  if (!token) return c.json({ error: "Account not found or invalid" }, 404);

  try {
    // 1. Verify GitHub token is valid
    const ghRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!ghRes.ok) {
      await aiSettings.updateCopilotAccount(accountId, { isValid: false });
      return c.json({ data: { valid: false, status: ghRes.status, error: "GitHub token is invalid or expired" } });
    }

    // 2. Verify Copilot API access by starting a SDK client and listing models
    let copilotValid = false;
    let copilotError: string | undefined;
    try {
      const { CopilotClient } = await import("@github/copilot-sdk");
      const client = new CopilotClient({ githubToken: token });
      await client.start();
      const models = await client.listModels();
      copilotValid = models.length > 0;
      if (!copilotValid) copilotError = "No models available — Copilot access may be restricted";
      await client.stop();
    } catch (sdkErr) {
      copilotError = sdkErr instanceof Error ? sdkErr.message : String(sdkErr);
      if (copilotError.includes("not authorized") || copilotError.includes("unauthorized")) {
        copilotError = "GitHub token works but Copilot API access is denied. Check your Copilot subscription or re-authorize with Copilot scopes.";
      }
    }

    if (!copilotValid) {
      await aiSettings.updateCopilotAccount(accountId, { isValid: false });
      return c.json({ data: { valid: false, status: 200, error: copilotError } });
    }

    await aiSettings.updateCopilotAccount(accountId, { isValid: true });
    return c.json({ data: { valid: true, status: 200 } });
  } catch {
    await aiSettings.updateCopilotAccount(accountId, { isValid: false });
    return c.json({ data: { valid: false, status: 0, error: "Connection check failed" } });
  }
});

// ─── Custom AI Providers ──────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/providers
aiSettingsRoutes.get("/:workspaceId/ai-settings/providers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const providers = await aiSettings.listProviders(workspaceId);
  return c.json({ data: providers });
});

const addProviderSchema = z.object({
  label: z.string().min(1).max(100),
  providerType: z.enum(["openai", "azure", "anthropic"]),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  bearerToken: z.string().optional(),
  azureApiVersion: z.string().optional(),
});

// POST /workspaces/:workspaceId/ai-settings/providers
aiSettingsRoutes.post(
  "/:workspaceId/ai-settings/providers",
  zValidator("json", addProviderSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const provider = await aiSettings.addProvider({
      workspaceId,
      label: body.label,
      providerType: body.providerType,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      bearerToken: body.bearerToken,
      azureApiVersion: body.azureApiVersion,
      addedBy: userId,
    });

    // Don't return encrypted keys
    const { encrypted_api_key, encrypted_bearer_token, ...safe } = provider;
    return c.json({ data: safe }, 201);
  }
);

const updateProviderSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  bearerToken: z.string().optional(),
  azureApiVersion: z.string().optional(),
});

// PATCH /workspaces/:workspaceId/ai-settings/providers/:id
aiSettingsRoutes.patch(
  "/:workspaceId/ai-settings/providers/:id",
  zValidator("json", updateProviderSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const providerId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const updated = await aiSettings.updateProvider(providerId, body);
    if (!updated) return c.json({ error: "Provider not found" }, 404);

    const { encrypted_api_key, encrypted_bearer_token, ...safe } = updated;
    return c.json({ data: safe });
  }
);

// DELETE /workspaces/:workspaceId/ai-settings/providers/:id
aiSettingsRoutes.delete("/:workspaceId/ai-settings/providers/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const providerId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const deleted = await aiSettings.deleteProvider(providerId);
  if (!deleted) return c.json({ error: "Provider not found" }, 404);

  return c.json({ data: { id: providerId, deleted: true } });
});

// POST /workspaces/:workspaceId/ai-settings/providers/:id/validate
aiSettingsRoutes.post("/:workspaceId/ai-settings/providers/:id/validate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const providerId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const providerData = await aiSettings.getProviderWithKey(providerId);
  if (!providerData) return c.json({ error: "Provider not found" }, 404);

  const { row, apiKey, bearerToken } = providerData;

  // Test connectivity by hitting the models endpoint
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    else if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;

    const modelsUrl = row.provider_type === "azure"
      ? `${row.base_url}/openai/models?api-version=${row.azure_api_version ?? "2024-02-15-preview"}`
      : `${row.base_url}/models`;

    if (row.provider_type === "azure" && apiKey) {
      headers["api-key"] = apiKey;
      delete headers["Authorization"];
    }

    const res = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(10_000) });
    const valid = res.ok;

    if (!valid) {
      await aiSettings.updateProvider(providerId, { isValid: false });
    } else {
      await aiSettings.updateProvider(providerId, { isValid: true });
    }

    return c.json({ data: { valid, status: res.status } });
  } catch (fetchErr) {
    await aiSettings.updateProvider(providerId, { isValid: false });
    return c.json({
      data: {
        valid: false,
        error: fetchErr instanceof Error ? fetchErr.message : "Connection failed",
      },
    });
  }
});

// ─── Available Models ─────────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/models
aiSettingsRoutes.get("/:workspaceId/ai-settings/models", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  // Return both Copilot models and custom provider info
  const [accounts, providers] = await Promise.all([
    aiSettings.listCopilotAccounts(workspaceId),
    aiSettings.listProviders(workspaceId),
  ]);

  return c.json({
    data: {
      copilotAccounts: accounts.map((a) => ({
        id: a.id,
        label: a.label,
        githubLogin: a.github_login,
        isValid: a.is_valid,
      })),
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        providerType: p.provider_type,
        isValid: p.is_valid,
      })),
    },
  });
});

// ─── Workspace AI Defaults ────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/defaults
aiSettingsRoutes.get("/:workspaceId/ai-settings/defaults", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const settings = await aiSettings.getSettings(workspaceId);
  return c.json({
    data: settings ?? {
      workspace_id: workspaceId,
      default_copilot_account_id: null,
      default_provider_id: null,
      default_model: null,
      suggestion_copilot_account_id: null,
      suggestion_provider_id: null,
      suggestion_model: null,
      enforce_ai: false,
      enforced_copilot_account_id: null,
      enforced_provider_id: null,
      enforced_model: null,
      show_model_selector: false,
      updated_by: null,
    },
  });
});

const updateDefaultsSchema = z.object({
  defaultCopilotAccountId: z.string().uuid().nullable().optional(),
  defaultProviderId: z.string().uuid().nullable().optional(),
  defaultModel: z.string().max(100).nullable().optional(),
  suggestionCopilotAccountId: z.string().uuid().nullable().optional(),
  suggestionProviderId: z.string().uuid().nullable().optional(),
  suggestionModel: z.string().max(100).nullable().optional(),
  enforceAi: z.boolean().optional(),
  enforcedCopilotAccountId: z.string().uuid().nullable().optional(),
  enforcedProviderId: z.string().uuid().nullable().optional(),
  enforcedModel: z.string().max(100).nullable().optional(),
  showModelSelector: z.boolean().optional(),
});

// PUT /workspaces/:workspaceId/ai-settings/defaults
aiSettingsRoutes.put(
  "/:workspaceId/ai-settings/defaults",
  zValidator("json", updateDefaultsSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const settings = await aiSettings.upsertSettings({
      workspaceId,
      defaultCopilotAccountId: body.defaultCopilotAccountId,
      defaultProviderId: body.defaultProviderId,
      defaultModel: body.defaultModel,
      suggestionCopilotAccountId: body.suggestionCopilotAccountId,
      suggestionProviderId: body.suggestionProviderId,
      suggestionModel: body.suggestionModel,
      enforceAi: body.enforceAi,
      enforcedCopilotAccountId: body.enforcedCopilotAccountId,
      enforcedProviderId: body.enforcedProviderId,
      enforcedModel: body.enforcedModel,
      showModelSelector: body.showModelSelector,
      updatedBy: userId,
    });

    return c.json({ data: settings });
  }
);

// ─── User AI Preferences ─────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/user-preferences
aiSettingsRoutes.get("/:workspaceId/ai-settings/user-preferences", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const [preferences, settings] = await Promise.all([
    aiSettings.getUserPreferences(workspaceId, userId),
    aiSettings.getSettings(workspaceId),
  ]);

  return c.json({
    data: {
      preferences: preferences ?? null,
      enforcement: {
        enforce_ai: settings?.enforce_ai ?? false,
        enforced_copilot_account_id: settings?.enforced_copilot_account_id ?? null,
        enforced_provider_id: settings?.enforced_provider_id ?? null,
        enforced_model: settings?.enforced_model ?? null,
      },
    },
  });
});

const updateUserPreferencesSchema = z.object({
  copilotAccountId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  model: z.string().max(100).nullable().optional(),
});

// PUT /workspaces/:workspaceId/ai-settings/user-preferences
aiSettingsRoutes.put(
  "/:workspaceId/ai-settings/user-preferences",
  zValidator("json", updateUserPreferencesSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    // Check if enforcement is active
    const settings = await aiSettings.getSettings(workspaceId);
    if (settings?.enforce_ai) {
      return c.json({ error: "AI model is enforced by workspace admin" }, 403);
    }

    const result = await aiSettings.upsertUserPreferences({
      workspaceId,
      userId,
      copilotAccountId: body.copilotAccountId ?? null,
      providerId: body.providerId ?? null,
      model: body.model ?? null,
    });

    return c.json({ data: result });
  }
);

// ─── User AI Allocations (admin manages other users) ─────

// GET /workspaces/:workspaceId/ai-settings/user-allocations
aiSettingsRoutes.get("/:workspaceId/ai-settings/user-allocations", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const rows = await aiSettings.listAllUserPreferences(workspaceId);
  return c.json({ data: rows });
});

const updateUserAllocationSchema = z.object({
  copilotAccountId: z.string().uuid().nullable().optional(),
  providerId: z.string().uuid().nullable().optional(),
  model: z.string().max(100).nullable().optional(),
});

// PUT /workspaces/:workspaceId/ai-settings/user-allocations/:targetUserId
aiSettingsRoutes.put(
  "/:workspaceId/ai-settings/user-allocations/:targetUserId",
  zValidator("json", updateUserAllocationSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const targetUserId = c.req.param("targetUserId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    // Verify target is a workspace member
    const targetErr = await requireMember(workspaceId, targetUserId);
    if (targetErr) return c.json({ error: "Target user is not a workspace member" }, 400);

    const result = await aiSettings.upsertUserPreferences({
      workspaceId,
      userId: targetUserId,
      copilotAccountId: body.copilotAccountId ?? null,
      providerId: body.providerId ?? null,
      model: body.model ?? null,
    });

    return c.json({ data: result });
  }
);

const copySettingsSchema = z.object({
  targetUserIds: z.array(z.string().uuid()).min(1).max(100),
});

// POST /workspaces/:workspaceId/ai-settings/user-allocations/copy-my-settings
aiSettingsRoutes.post(
  "/:workspaceId/ai-settings/user-allocations/copy-my-settings",
  zValidator("json", copySettingsSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const { targetUserIds } = c.req.valid("json");

    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    // Get admin's own preferences, or fall back to workspace defaults
    let copilotAccountId: string | null = null;
    let providerId: string | null = null;
    let model: string | null = null;

    const adminPrefs = await aiSettings.getUserPreferences(workspaceId, userId);
    if (adminPrefs && (adminPrefs.copilot_account_id || adminPrefs.provider_id || adminPrefs.model)) {
      copilotAccountId = adminPrefs.copilot_account_id;
      providerId = adminPrefs.provider_id;
      model = adminPrefs.model;
    } else {
      const wsDefaults = await aiSettings.getSettings(workspaceId);
      if (wsDefaults) {
        copilotAccountId = wsDefaults.default_copilot_account_id;
        providerId = wsDefaults.default_provider_id;
        model = wsDefaults.default_model;
      }
    }

    let updated = 0;
    for (const targetId of targetUserIds) {
      const memberErr = await requireMember(workspaceId, targetId);
      if (memberErr) continue;
      await aiSettings.upsertUserPreferences({
        workspaceId,
        userId: targetId,
        copilotAccountId,
        providerId,
        model,
      });
      updated++;
    }

    return c.json({ data: { updated } });
  }
);

// DELETE /workspaces/:workspaceId/ai-settings/user-allocations/:targetUserId
aiSettingsRoutes.delete("/:workspaceId/ai-settings/user-allocations/:targetUserId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const targetUserId = c.req.param("targetUserId");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  await aiSettings.deleteUserPreferences(workspaceId, targetUserId);
  return c.json({ data: { userId: targetUserId, reset: true } });
});

// ─── Effective AI Config ─────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/effective
aiSettingsRoutes.get("/:workspaceId/ai-settings/effective", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const config = await aiSettings.getEffectiveAiConfig(workspaceId, userId);
  return c.json({
    data: config ?? {
      enforce_ai: false,
      enforced_copilot_account_id: null,
      enforced_provider_id: null,
      enforced_model: null,
      show_model_selector: false,
      default_copilot_account_id: null,
      default_provider_id: null,
      default_model: null,
      user_copilot_account_id: null,
      user_provider_id: null,
      user_model: null,
    },
  });
});
