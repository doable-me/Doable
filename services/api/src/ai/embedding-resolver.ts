/**
 * Embedding-provider resolution for /__doable/ai/embed.
 *
 * Priority chain (per PRD ChatBotInfra ch04 + user clarification):
 *   1) project_ai_settings.embedding_provider_id (+ embedding_model)
 *   2) workspace_ai_settings.default_embedding_provider_id (+ default_embedding_model)
 *   3) platform default — set via /api/setup/ai-embedding-provider and stored in
 *      platform_config under the `setup.embedding_*` keys. This is the "Doable
 *      admin sets it once at install, every workspace inherits silently" path
 *      the user asked for.
 *
 * Returns the decrypted, ready-to-call provider config plus the resolved
 * model id. Returns null when nothing is configured anywhere — callers turn
 * that into a 503 EMBEDDING_NOT_CONFIGURED to the SDK.
 *
 * Kept deliberately separate from engine-resolver.ts (which only knows about
 * chat providers) so chat and embed evolve independently.
 */

import { sql } from "../db/index.js";
import { aiSettingsQueries } from "@doable/db";
import type { ByokProviderConfig } from "./engine-types.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";
import { getConfig, getEncryptedConfig } from "../lib/platformConfig.js";

const aiSettingsDb = aiSettingsQueries(sql, ENCRYPTION_KEY);

export interface ResolvedEmbeddingEngine {
  provider: ByokProviderConfig;
  model: string;
  /** Where the row came from — surfaced in audit/usage logs. */
  source: "project" | "workspace" | "platform";
}

/**
 * Read the platform-default embedding provider from `platform_config`.
 * Keys are written by /api/setup/ai-embedding-provider and edited by
 * /admin/embedding-provider. All optional; returns null when the admin has
 * not configured embeddings yet.
 */
export async function getPlatformEmbeddingDefault(): Promise<
  { providerType: "openai" | "anthropic"; baseUrl: string; apiKey: string; model: string } | null
> {
  try {
    const [providerType, baseUrl, model, apiKey] = await Promise.all([
      getConfig("setup.embedding_provider"),
      getConfig("setup.embedding_base_url"),
      getConfig("setup.embedding_model"),
      getEncryptedConfig("setup.embedding_api_key"),
    ]);
    if (!apiKey || !model || !baseUrl) return null;
    const pt = providerType === "anthropic" ? "anthropic" : "openai";
    return {
      providerType: pt,
      baseUrl: String(baseUrl),
      apiKey: String(apiKey),
      model: String(model),
    };
  } catch {
    return null;
  }
}

/**
 * Look up a row from `ai_providers` and decrypt its key into the same
 * `ByokProviderConfig` shape the chat path uses.
 */
async function loadProviderById(providerId: string): Promise<ByokProviderConfig | null> {
  try {
    const data = await aiSettingsDb.getProviderWithKey(providerId);
    if (!data) return null;
    return {
      type: data.row.provider_type as "openai" | "azure" | "anthropic",
      baseUrl: data.row.base_url,
      apiKey: data.apiKey ?? undefined,
      bearerToken: data.bearerToken ?? undefined,
      ...(data.row.azure_api_version
        ? { azure: { apiVersion: data.row.azure_api_version } }
        : {}),
    };
  } catch (err) {
    console.error("[embedding-resolver] decrypt provider failed:", err);
    return null;
  }
}

interface ProjectEmbeddingOverride {
  embeddingProviderId: string | null;
  embeddingModel: string | null;
}

/**
 * Resolve the effective embedding provider + model for a given project.
 * Pass the already-loaded ProjectAiSettings to avoid an extra DB roundtrip.
 */
export async function resolveEmbeddingEngine(
  projectId: string,
  projectOverride: ProjectEmbeddingOverride,
): Promise<ResolvedEmbeddingEngine | null> {
  // Tier 1 — project-level override (set via PUT /projects/:id/ai-settings).
  if (projectOverride.embeddingProviderId) {
    const provider = await loadProviderById(projectOverride.embeddingProviderId);
    if (provider) {
      return {
        provider,
        model: projectOverride.embeddingModel ?? "text-embedding-004",
        source: "project",
      };
    }
  }

  // Tier 2 — workspace default (workspace_ai_settings.default_embedding_provider_id).
  let workspaceId: string | undefined;
  try {
    const [project] = await sql<{ workspace_id: string }[]>`
      SELECT workspace_id FROM projects WHERE id = ${projectId}
    `;
    workspaceId = project?.workspace_id;
  } catch (err) {
    console.error("[embedding-resolver] project lookup failed:", err);
  }

  if (workspaceId) {
    try {
      const [row] = await sql<
        { default_embedding_provider_id: string | null; default_embedding_model: string | null }[]
      >`
        SELECT default_embedding_provider_id, default_embedding_model
        FROM workspace_ai_settings
        WHERE workspace_id = ${workspaceId}
        LIMIT 1
      `;
      if (row?.default_embedding_provider_id) {
        const provider = await loadProviderById(row.default_embedding_provider_id);
        if (provider) {
          return {
            provider,
            model:
              projectOverride.embeddingModel ??
              row.default_embedding_model ??
              "text-embedding-004",
            source: "workspace",
          };
        }
      }
    } catch (err) {
      console.error("[embedding-resolver] workspace lookup failed:", err);
    }
  }

  // Tier 3 — platform default (set during /setup, lives in platform_config).
  const platform = await getPlatformEmbeddingDefault();
  if (platform) {
    return {
      provider: {
        type: platform.providerType,
        baseUrl: platform.baseUrl,
        apiKey: platform.apiKey,
      },
      model: projectOverride.embeddingModel ?? platform.model,
      source: "platform",
    };
  }

  return null;
}
