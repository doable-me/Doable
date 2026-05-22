import { Hono } from "hono";
import { sql } from "../db/index.js";
import { aiSettingsQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { providerDiscovery, type ProviderConfig } from "../ai/provider-discovery.js";
import type { WorkspaceRole } from "@doable/shared";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);
const workspaces = workspaceQueries(sql);

export const providerBridgeRoutes = new Hono<AuthEnv>({ strict: false });

// All provider bridge routes require authentication
providerBridgeRoutes.use("*", authMiddleware);

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

// ─── Helper: Build ProviderConfig from DB row ────────────
function buildProviderConfig(
  row: { provider_type: string; base_url: string; azure_api_version?: string | null },
  apiKey: string | null,
  bearerToken: string | null,
): ProviderConfig {
  return {
    type: row.provider_type as ProviderConfig["type"],
    baseUrl: row.base_url,
    apiKey: apiKey ?? undefined,
    bearerToken: bearerToken ?? undefined,
    azure: row.provider_type === "azure"
      ? { apiVersion: row.azure_api_version ?? undefined }
      : undefined,
  };
}

// Note: Provider validation (POST /:workspaceId/ai-settings/providers/:id/validate)
// is handled by the enhanced route in ai-settings.ts which now uses ProviderDiscoveryService
// with health status tracking. No need to duplicate it here.

// ─── POST /:workspaceId/ai-settings/providers/:id/discover-models ─
// Discover models from a provider and cache them.
providerBridgeRoutes.post("/:workspaceId/ai-settings/providers/:id/discover-models", async (c) => {
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

  const config = buildProviderConfig(providerData.row, providerData.apiKey, providerData.bearerToken);

  // Clear cache to force a fresh fetch
  providerDiscovery.clearCache(providerId);

  const presetId = (providerData.row as unknown as Record<string, unknown>).preset_id as string | undefined;
  const models = await providerDiscovery.discoverModels(config, providerId, presetId);

  // Update models_cache JSONB column
  try {
    await sql`
      UPDATE ai_providers
      SET models_cache = ${JSON.stringify({ models, discoveredAt: new Date().toISOString() })}::jsonb
      WHERE id = ${providerId}
    `;
  } catch (dbErr) {
    console.error("[ProviderBridge] Failed to update models_cache:", dbErr);
  }

  // Upsert ai_provider_models rows
  try {
    for (const model of models) {
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
  } catch (dbErr) {
    console.error("[ProviderBridge] Failed to upsert provider models:", dbErr);
  }

  return c.json({ data: models });
});

// ─── GET /:workspaceId/ai-settings/providers/:id/models ─
// Return cached models for a provider.
providerBridgeRoutes.get("/:workspaceId/ai-settings/providers/:id/models", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const providerId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  // Fetch cached models from ai_provider_models table
  const models = await sql`
    SELECT model_id, display_name, is_enabled, context_window,
           supports_tools, supports_vision, display_order, created_at
    FROM ai_provider_models
    WHERE provider_id = ${providerId}
    ORDER BY display_order ASC, model_id ASC
  `;

  // Get the cache timestamp from models_cache JSONB
  const [cacheRow] = await sql`
    SELECT models_cache->>'discoveredAt' AS cached_at
    FROM ai_providers
    WHERE id = ${providerId} AND workspace_id = ${workspaceId}
  `;

  if (!cacheRow) return c.json({ error: "Provider not found" }, 404);

  return c.json({
    data: {
      models: models.map((m) => ({
        id: m.model_id,
        name: m.display_name,
        isEnabled: m.is_enabled,
        contextWindow: m.context_window,
        supportsTools: m.supports_tools,
        supportsVision: m.supports_vision,
        displayOrder: m.display_order,
      })),
      cachedAt: cacheRow.cached_at ?? null,
    },
  });
});
