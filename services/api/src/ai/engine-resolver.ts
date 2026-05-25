/**
 * AI engine resolution — decides which model, provider, and github
 * token to use for a chat request. Implements the 6-tier priority
 * chain: admin enforcement → explicit request params → user prefs
 * → workspace defaults → platform defaults → system default.
 */

import { sql } from "../db/index.js";
import { aiSettingsQueries, platformAiDefaultsQueries } from "@doable/db";
import type { ByokProviderConfig } from "./providers/copilot.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

const aiSettingsDb = aiSettingsQueries(sql, ENCRYPTION_KEY);
const platformDefaults = platformAiDefaultsQueries(sql);

/**
 * Resolve which AI engine, model, and provider to use for a request.
 *
 * Priority chain:
 *   1. Admin enforcement — workspace_ai_settings.enforce_ai = true
 *   2. Explicit request params — copilotAccountId / providerId / model from body
 *   3. User preferences — from user_ai_preferences table
 *   4. Workspace defaults — from workspace_ai_settings
 *   5. Platform defaults — from platform_ai_defaults (per plan tier)
 *   6. System default — gh CLI auth (no token)
 */
export async function resolveAiEngine(
  projectId: string,
  userId: string,
  overrides: {
    copilotAccountId?: string;
    providerId?: string;
    provider?: ByokProviderConfig;
    model?: string;
  },
): Promise<{
  model?: string;
  provider?: ByokProviderConfig;
  githubToken?: string;
  providerId?: string;
  modelSource: string;
  providerSource: string;
}> {
  let resolvedProvider: ByokProviderConfig | undefined = overrides.provider;
  let resolvedModel: string | undefined = overrides.model;
  let githubToken: string | undefined;

  let modelSource: string = overrides.model ? "user_preference" : "system_default";
  let providerSource: string = overrides.provider ? "user_byok" : "fallback";

  let selectedCopilotAccountId: string | undefined = overrides.copilotAccountId;
  let selectedProviderId: string | undefined = overrides.providerId;

  if (overrides.copilotAccountId) providerSource = "github_copilot";
  if (overrides.providerId) providerSource = "user_byok";

  let workspaceId: string | undefined;

  try {
    const [project] = await sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
    workspaceId = project?.workspace_id;
    if (workspaceId) {
      const config = await aiSettingsDb.getEffectiveAiConfig(workspaceId, userId);

      if (config) {
        if (config.enforce_ai) {
          selectedCopilotAccountId = config.enforced_copilot_account_id ?? undefined;
          selectedProviderId = config.enforced_provider_id ?? undefined;
          resolvedModel = config.enforced_model ?? resolvedModel;
          modelSource = "admin_override";
          providerSource = config.enforced_provider_id ? "workspace_byok" : "github_copilot";
          resolvedProvider = undefined;
        } else if (!selectedCopilotAccountId && !selectedProviderId && !resolvedProvider) {
          // User preference (tier 3) — only honour if it actually resolves to
          // a usable provider or copilot account.  A stale row with
          // source="copilot" but copilot_account_id=null is NOT usable and
          // must fall through to workspace defaults.
          const hasUserOverride = config.user_source !== null;

          let userOverrideApplied = false;
          if (hasUserOverride) {
            if (config.user_source === "custom" && config.user_provider_id) {
              selectedProviderId = config.user_provider_id;
              providerSource = "user_byok";
              userOverrideApplied = true;
              if (!resolvedModel && config.user_provider_model) {
                resolvedModel = config.user_provider_model;
                modelSource = "user_preference";
              }
            } else if (config.user_source !== "custom" && config.user_copilot_account_id) {
              selectedCopilotAccountId = config.user_copilot_account_id;
              providerSource = "github_copilot";
              userOverrideApplied = true;
              if (!resolvedModel && config.user_copilot_model) {
                resolvedModel = config.user_copilot_model;
                modelSource = "user_preference";
              }
            }
          }

          if (!userOverrideApplied) {
            if (config.default_source === "custom") {
              selectedProviderId = config.default_provider_id ?? undefined;
              providerSource = "workspace_byok";
              if (!resolvedModel && config.default_provider_model) {
                resolvedModel = config.default_provider_model;
                modelSource = "workspace_default";
              }
            } else {
              selectedCopilotAccountId = config.default_copilot_account_id ?? undefined;
              providerSource = "github_copilot";
              if (!resolvedModel && config.default_copilot_model) {
                resolvedModel = config.default_copilot_model;
                modelSource = "workspace_default";
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[Chat] Failed to resolve workspace/user AI config:", err);
  }

  // Tier 5: Platform defaults — if no provider resolved from tiers 1–4,
  // fall back to the admin-configured default for this workspace's plan.
  if (!selectedCopilotAccountId && !selectedProviderId && !resolvedProvider && workspaceId) {
    try {
      const [ws] = await sql<{ plan: string }[]>`SELECT plan FROM workspaces WHERE id = ${workspaceId}`;
      if (ws?.plan) {
        const planDefault = await platformDefaults.getForPlan(ws.plan);
        if (planDefault) {
          if (planDefault.source === "custom" && planDefault.provider_id) {
            selectedProviderId = planDefault.provider_id;
            providerSource = "platform_default";
            if (!resolvedModel && planDefault.provider_model) {
              resolvedModel = planDefault.provider_model;
              modelSource = "platform_default";
            }
          } else if (planDefault.copilot_account_id) {
            selectedCopilotAccountId = planDefault.copilot_account_id;
            providerSource = "platform_default";
            if (!resolvedModel && planDefault.copilot_model) {
              resolvedModel = planDefault.copilot_model;
              modelSource = "platform_default";
            }
          }
        }
      }
    } catch (err) {
      console.error("[Chat] Failed to resolve platform AI defaults:", err);
    }
  }

  if (selectedProviderId && !resolvedProvider) {
    try {
      const providerData = await aiSettingsDb.getProviderWithKey(selectedProviderId);
      if (providerData) {
        resolvedProvider = {
          type: providerData.row.provider_type as "openai" | "azure" | "anthropic",
          baseUrl: providerData.row.base_url,
          apiKey: providerData.apiKey ?? undefined,
          bearerToken: providerData.bearerToken ?? undefined,
          ...(providerData.row.wire_api ? { wireApi: providerData.row.wire_api as "completions" | "responses" } : {}),
          ...(providerData.row.azure_api_version
            ? { azure: { apiVersion: providerData.row.azure_api_version } }
            : {}),
        };
      }
    } catch (err) {
      console.error("[Chat] Failed to decrypt provider key:", err);
    }
  }

  // BUG-GEMINI-400: Gemini's OpenAI-compat endpoint rejects parameters the
  // Copilot SDK sends (parallel_tool_calls, frequency_penalty, etc.) with a
  // 400 and empty body on multi-turn tool calls. Route through the local
  // proxy that strips those unsupported fields before forwarding to Google.
  if (resolvedProvider && isGeminiProvider(resolvedProvider.baseUrl)) {
    resolvedProvider = rewriteGeminiBaseUrl(resolvedProvider);
  }

  if (selectedCopilotAccountId) {
    try {
      githubToken = (await aiSettingsDb.getCopilotAccountToken(selectedCopilotAccountId)) ?? undefined;
    } catch (err) {
      console.error("[Chat] Failed to decrypt copilot account token:", err);
    }
  }

  return {
    model: resolvedModel,
    provider: resolvedProvider,
    githubToken,
    providerId: selectedProviderId,
    modelSource,
    providerSource,
  };
}

// ─── Gemini proxy helpers ──────────────────────────────────────────────────

const GEMINI_HOST_PATTERN = /generativelanguage\.googleapis\.com/i;

/** True when the baseUrl points to Google's Gemini API. */
function isGeminiProvider(baseUrl: string): boolean {
  return GEMINI_HOST_PATTERN.test(baseUrl);
}

/**
 * Rewrite a Gemini provider's baseUrl to route through the local proxy.
 * Example: `https://generativelanguage.googleapis.com/v1beta/openai/`
 *       → `http://127.0.0.1:${PORT}/__gemini-proxy/v1beta/openai/`
 */
function rewriteGeminiBaseUrl(provider: ByokProviderConfig): ByokProviderConfig {
  const port = process.env.PORT ?? "4000";
  const url = new URL(provider.baseUrl);
  const proxyBase = `http://127.0.0.1:${port}/__gemini-proxy${url.pathname}`;
  return { ...provider, baseUrl: proxyBase };
}
