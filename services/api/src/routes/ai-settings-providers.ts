import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { aiSettingsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { providerDiscovery, type ProviderConfig } from "../ai/provider-discovery.js";
import type { WorkspaceRole } from "@doable/shared";
import { PROVIDER_BY_ID } from "@doable/shared/ai/provider-catalog.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";
import { hasWorkspaceReadAccessViaProject } from "./projects/helpers.js";

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);
const workspaces = workspaceQueries(sql);

export const aiSettingsProviderRoutes = new Hono<AuthEnv>({ strict: false });

aiSettingsProviderRoutes.use("*", authMiddleware);

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

/** Scope-aware authorization for an existing provider row. Migration 072. */
async function authorizeProviderMutation(
  workspaceId: string,
  providerId: string,
  callerId: string,
): Promise<
  | { ok: true; row: NonNullable<Awaited<ReturnType<typeof aiSettings.getProviderAuthInfo>>> }
  | { ok: false; error: string; status: 403 | 404 }
> {
  const row = await aiSettings.getProviderAuthInfo(providerId);
  if (!row || row.workspace_id !== workspaceId) {
    return { ok: false, error: "Provider not found", status: 404 };
  }
  if (row.scope === "user") {
    if (row.owner_user_id !== callerId) {
      return { ok: false, error: "Provider not found", status: 404 };
    }
    const memErr = await requireMember(workspaceId, callerId);
    if (memErr) return { ok: false, error: memErr, status: 403 };
    return { ok: true, row };
  }
  const adminErr = await requireAdmin(workspaceId, callerId);
  if (adminErr) return { ok: false, error: adminErr, status: 403 };
  return { ok: true, row };
}

// ─── Custom AI Providers ──────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/providers
//
// Returns the workspace-shared providers plus the caller's personal ones.
// Other members' personal providers are never disclosed.
//
// READ-only. Workspace members are authorized as before. A project
// collaborator (shared into a private project, not a workspace member) may
// pass ?projectId=<their project in this workspace> to list providers needed
// to run AI chat on that shared project. listProviders is scoped to
// (workspaceId, userId), so the collaborator only sees workspace-shared
// providers plus their OWN personal ones — never another member's.
aiSettingsProviderRoutes.get("/:workspaceId/ai-settings/providers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const allowed = await hasWorkspaceReadAccessViaProject(userId, workspaceId, projectId);
  if (!allowed) return c.json({ error: "Not a member of this workspace" }, 403);

  const providers = await aiSettings.listProviders(workspaceId, userId);
  return c.json({ data: providers });
});

const addProviderSchema = z.object({
  label: z.string().min(1).max(100),
  providerType: z.enum(["openai", "azure", "anthropic"]),
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  bearerToken: z.string().optional(),
  azureApiVersion: z.string().optional(),
  presetId: z.string().optional(),
  /** 'user' (default) for personal; 'workspace' for admin-shared. */
  scope: z.enum(["workspace", "user"]).default("user"),
});

// POST /workspaces/:workspaceId/ai-settings/providers
aiSettingsProviderRoutes.post(
  "/:workspaceId/ai-settings/providers",
  zValidator("json", addProviderSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const authErr = body.scope === "workspace"
      ? await requireAdmin(workspaceId, userId)
      : await requireMember(workspaceId, userId);
    if (authErr) return c.json({ error: authErr }, 403);

    const provider = await aiSettings.addProvider({
      workspaceId,
      label: body.label,
      providerType: body.providerType,
      baseUrl: body.baseUrl,
      apiKey: body.apiKey,
      bearerToken: body.bearerToken,
      azureApiVersion: body.azureApiVersion,
      addedBy: userId,
      presetId: body.presetId,
      scope: body.scope,
      ownerUserId: body.scope === "user" ? userId : null,
    });

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
  /**
   * Promote a personal provider to workspace-shared (or demote). Admin-only.
   * The query layer clears owner_user_id when scope='workspace' to satisfy
   * the aip_scope_owner_consistent CHECK (migration 072).
   */
  scope: z.enum(["workspace", "user"]).optional(),
});

// PATCH /workspaces/:workspaceId/ai-settings/providers/:id
aiSettingsProviderRoutes.patch(
  "/:workspaceId/ai-settings/providers/:id",
  zValidator("json", updateProviderSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const providerId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const auth = await authorizeProviderMutation(workspaceId, providerId, userId);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);

    // Scope change (promote personal -> workspace, or demote) is admin-only —
    // it shares a token with the whole workspace. Reuse the admin check used
    // by /discover-models. Migration 072.
    const wantsScopeChange = body.scope !== undefined && body.scope !== auth.row.scope;
    let ownerUserId: string | null | undefined;
    if (wantsScopeChange) {
      const adminErr = await requireAdmin(workspaceId, userId);
      if (adminErr) return c.json({ error: adminErr }, 403);

      if (body.scope === "user") {
        // Demoting a workspace provider that a workspace default/suggestion/
        // enforced choice still points at would orphan that reference (the
        // enforce_workspace_default_scope trigger only fires on
        // workspace_ai_settings writes). Block it; the admin must repoint the
        // default first. Migration 072.
        const [refRow] = await sql<{ referenced: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM workspace_ai_settings
            WHERE workspace_id = ${workspaceId}
              AND ${providerId} IN (
                default_provider_id, suggestion_provider_id, enforced_provider_id
              )
          ) AS referenced
        `;
        if (refRow?.referenced) {
          return c.json({
            error: "This provider is set as a workspace default. Change the workspace default before making it personal.",
          }, 409);
        }
        // scope='user' requires an owner; assign it to the promoting admin.
        ownerUserId = userId;
      }
    }

    const updated = await aiSettings.updateProvider(providerId, { ...body, ownerUserId });
    if (!updated) return c.json({ error: "Provider not found" }, 404);

    const { encrypted_api_key, encrypted_bearer_token, ...safe } = updated;
    return c.json({ data: safe });
  }
);

// DELETE /workspaces/:workspaceId/ai-settings/providers/:id
aiSettingsProviderRoutes.delete("/:workspaceId/ai-settings/providers/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const providerId = c.req.param("id");
  const userId = c.get("userId");

  const auth = await authorizeProviderMutation(workspaceId, providerId, userId);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const deleted = await aiSettings.deleteProvider(providerId);
  if (!deleted) return c.json({ error: "Provider not found" }, 404);

  return c.json({ data: { id: providerId, deleted: true } });
});

// POST /workspaces/:workspaceId/ai-settings/providers/:id/validate
aiSettingsProviderRoutes.post("/:workspaceId/ai-settings/providers/:id/validate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const providerId = c.req.param("id");
  const userId = c.get("userId");

  const auth = await authorizeProviderMutation(workspaceId, providerId, userId);
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);

  const providerData = await aiSettings.getProviderWithKeyAnyStatus(providerId);
  if (!providerData) return c.json({ error: "Provider not found" }, 404);

  if (providerData.row.workspace_id !== workspaceId) {
    return c.json({ error: "Provider not found" }, 404);
  }

  const { row, apiKey, bearerToken } = providerData;

  // If this provider is bound to a known preset, look it up so we can:
  //   1. fall back to chat.completions ping when /models is unavailable
  //   2. seed ai_provider_models from preset defaults when discovery is off
  const preset = row.preset_id ? (PROVIDER_BY_ID as Record<string, typeof PROVIDER_BY_ID[keyof typeof PROVIDER_BY_ID]>)[row.preset_id] ?? null : null;
  const validationModel = preset && !preset.supportsModelDiscovery
    ? preset.defaultModels[0]?.id
    : undefined;

  const config: ProviderConfig = {
    type: row.provider_type as ProviderConfig["type"],
    baseUrl: row.base_url,
    apiKey: apiKey ?? undefined,
    bearerToken: bearerToken ?? undefined,
    azure: row.provider_type === "azure"
      ? { apiVersion: row.azure_api_version ?? undefined }
      : undefined,
    validationModel,
  };

  const result = await providerDiscovery.validateProvider(config);

  // If validation succeeded but the provider doesn't expose discovery,
  // seed `result.models` from the preset so the route below caches them.
  if (result.ok && (!result.models || result.models.length === 0) && preset && preset.defaultModels.length > 0) {
    result.models = preset.defaultModels.map((m) => ({
      id: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
      capabilities: { tools: m.supportsTools, vision: m.supportsVision },
    }));
  }

  const healthStatus = result.ok ? "healthy" : (result.error === "rate_limited" ? "degraded" : "down");

  try {
    await sql`
      UPDATE ai_providers
      SET health_status = ${healthStatus},
          health_latency_ms = ${result.latencyMs},
          last_health_check = now(),
          is_valid = ${result.ok}
      WHERE id = ${providerId}
    `;
  } catch (dbErr) {
    console.error("[AI Settings] Failed to update health status:", dbErr);
  }

  if (result.ok && result.models && result.models.length > 0) {
    try {
      for (const model of result.models) {
        await sql`
          INSERT INTO ai_provider_models (provider_id, model_id, display_name, context_window, supports_tools, supports_vision)
          VALUES (
            ${providerId},
            ${model.id},
            ${model.name ?? null},
            ${model.contextWindow ?? null},
            ${model.capabilities?.tools ?? true},
            ${model.capabilities?.vision ?? false}
          )
          ON CONFLICT (provider_id, model_id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            context_window = EXCLUDED.context_window,
            supports_tools = EXCLUDED.supports_tools,
            supports_vision = EXCLUDED.supports_vision
        `;
      }
      await sql`
        UPDATE ai_providers
        SET models_cache = ${JSON.stringify({ models: result.models, discoveredAt: new Date().toISOString() })}::jsonb
        WHERE id = ${providerId}
      `;
    } catch (dbErr) {
      console.error("[AI Settings] Failed to save discovered models:", dbErr);
    }
  }

  return c.json({
    data: {
      valid: result.ok,
      latencyMs: result.latencyMs,
      error: result.errorMessage ?? result.error,
      healthStatus,
      models: result.models,
    },
  });
});

// ─── Available Models ─────────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/models
//
// Returns the accounts/providers the caller can actually pick as their
// chat default — workspace-shared rows + their own personal rows. Other
// members' personal rows are never disclosed.
aiSettingsProviderRoutes.get("/:workspaceId/ai-settings/models", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const [accounts, providers] = await Promise.all([
    aiSettings.listCopilotAccounts(workspaceId, userId),
    aiSettings.listProviders(workspaceId, userId),
  ]);

  return c.json({
    data: {
      copilotAccounts: accounts.map((a) => ({
        id: a.id,
        label: a.label,
        githubLogin: a.github_login,
        isValid: a.is_valid,
        scope: a.scope,
      })),
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        providerType: p.provider_type,
        isValid: p.is_valid,
        scope: p.scope,
      })),
    },
  });
});
