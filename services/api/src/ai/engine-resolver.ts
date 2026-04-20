/**
 * AI engine resolution — decides which model, provider, and github
 * token to use for a chat request. Implements the 5-tier priority
 * chain: admin enforcement → explicit request params → user prefs
 * → workspace defaults → system default.
 */

import { sql } from "../db/index.js";
import { aiSettingsQueries } from "@doable/db";
import type { ByokProviderConfig } from "./providers/copilot.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

const aiSettingsDb = aiSettingsQueries(sql, ENCRYPTION_KEY);

/**
 * Resolve which AI engine, model, and provider to use for a request.
 *
 * Priority chain:
 *   1. Admin enforcement — workspace_ai_settings.enforce_ai = true
 *   2. Explicit request params — copilotAccountId / providerId / model from body
 *   3. User preferences — from user_ai_preferences table
 *   4. Workspace defaults — from workspace_ai_settings
 *   5. System default — gh CLI auth (no token)
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
  modelSource: string;
  providerSource: string;
  copilotAccountId?: string;
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

  try {
    const [project] = await sql`SELECT workspace_id FROM projects WHERE id = ${projectId}`;
    if (project?.workspace_id) {
      const config = await aiSettingsDb.getEffectiveAiConfig(project.workspace_id, userId);

      if (config) {
        if (config.enforce_ai) {
          selectedCopilotAccountId = config.enforced_copilot_account_id ?? undefined;
          selectedProviderId = config.enforced_provider_id ?? undefined;
          resolvedModel = config.enforced_model ?? resolvedModel;
          modelSource = "admin_override";
          providerSource = config.enforced_provider_id ? "workspace_byok" : "github_copilot";
          resolvedProvider = undefined;
        } else if (!selectedCopilotAccountId && !selectedProviderId && !resolvedProvider) {
          // user_source in the DB means admin explicitly set this user's source.
          // Treat it as an override even if copilot_account_id or provider_id is null
          // (null means "use default copilot" / "use default provider").
          const hasUserOverride = config.user_source !== null;

          if (hasUserOverride) {
            if (config.user_source === "custom") {
              selectedProviderId = config.user_provider_id ?? undefined;
              providerSource = "user_byok";
              if (!resolvedModel && config.user_provider_model) {
                resolvedModel = config.user_provider_model;
                modelSource = "user_preference";
              }
            } else {
              selectedCopilotAccountId = config.user_copilot_account_id ?? undefined;
              providerSource = "github_copilot";
              if (!resolvedModel && config.user_copilot_model) {
                resolvedModel = config.user_copilot_model;
                modelSource = "user_preference";
              }
            }
          } else {
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

  if (selectedCopilotAccountId) {
    try {
      githubToken = (await aiSettingsDb.getCopilotAccountToken(selectedCopilotAccountId)) ?? undefined;
    } catch (err) {
      console.error("[Chat] Failed to decrypt copilot account token:", err);
    }
  }

  return { model: resolvedModel, provider: resolvedProvider, githubToken, modelSource, providerSource, copilotAccountId: selectedCopilotAccountId };
}
