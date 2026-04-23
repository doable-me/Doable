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

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);
const workspaces = workspaceQueries(sql);

export const aiSettingsProviderRoutes = new Hono<AuthEnv>();

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

// ─── Custom AI Providers ──────────────────────────────────

// GET /workspaces/:workspaceId/ai-settings/providers
aiSettingsProviderRoutes.get("/:workspaceId/ai-settings/providers", async (c) => {
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
aiSettingsProviderRoutes.post(
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
aiSettingsProviderRoutes.patch(
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
aiSettingsProviderRoutes.delete("/:workspaceId/ai-settings/providers/:id", async (c) => {
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
aiSettingsProviderRoutes.post("/:workspaceId/ai-settings/providers/:id/validate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const providerId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const providerData = await aiSettings.getProviderWithKeyAnyStatus(providerId);
  if (!providerData) return c.json({ error: "Provider not found" }, 404);

  if (providerData.row.workspace_id !== workspaceId) {
    return c.json({ error: "Provider not found" }, 404);
  }

  const { row, apiKey, bearerToken } = providerData;

  // If this provider is bound to a known preset, look it up so we can:
  //   1. fall back to chat.completions ping when /models is unavailable
  //   2. seed ai_provider_models from preset defaults when discovery is off
  const preset = row.preset_id ? PROVIDER_BY_ID.get(row.preset_id) ?? null : null;
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
aiSettingsProviderRoutes.get("/:workspaceId/ai-settings/models", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

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
