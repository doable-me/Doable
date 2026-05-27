/**
 * Apply platform-level AI defaults to a workspace.
 *
 * Called when:
 *  - A new user signs up and their workspace is created
 *  - A workspace changes plan tier (upgrade/downgrade)
 *  - Admin retroactively applies defaults to existing workspaces
 *
 * Clones the admin's Copilot account or BYOK provider into the target
 * workspace and sets it as the workspace default so users have AI
 * access out of the box.
 */

import { sql } from "../../db/index.js";
import { aiSettingsQueries, platformAiDefaultsQueries } from "@doable/db";
import { ENCRYPTION_KEY } from "../../lib/secrets.js";
import { getConfig, getEncryptedConfig } from "../../lib/platformConfig.js";

const aiSettings = aiSettingsQueries(sql, ENCRYPTION_KEY);
const platformDefaults = platformAiDefaultsQueries(sql);

/**
 * Clone a Copilot account into a target workspace (if not already there).
 * Returns the local account ID in the target workspace.
 */
async function cloneCopilotAccount(
  sourceAccountId: string,
  targetWorkspaceId: string,
): Promise<string | null> {
  const [source] = await sql<{
    id: string; workspace_id: string; label: string; github_login: string;
    github_id: string | null; is_valid: boolean; decrypted_token: string;
  }[]>`
    SELECT id, workspace_id, label, github_login, github_id, is_valid,
           pgp_sym_decrypt(encrypted_token::bytea, ${ENCRYPTION_KEY}) AS decrypted_token
    FROM github_copilot_accounts
    WHERE id = ${sourceAccountId}
  `;
  if (!source) return null;

  // Already in this workspace
  if (source.workspace_id === targetWorkspaceId) return source.id;

  // Check if account with same github_login already exists
  const [existing] = await sql<{ id: string }[]>`
    SELECT id FROM github_copilot_accounts
    WHERE workspace_id = ${targetWorkspaceId} AND github_login = ${source.github_login}
  `;
  if (existing) {
    // Update token in case it changed
    await sql`
      UPDATE github_copilot_accounts
      SET encrypted_token = pgp_sym_encrypt(${source.decrypted_token}, ${ENCRYPTION_KEY}),
          label = ${source.label}, is_valid = ${source.is_valid}
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }

  // Clone into target workspace using a system-level added_by.
  // We use the workspace owner since there's no "admin user" in context.
  const [owner] = await sql<{ owner_id: string }[]>`
    SELECT owner_id FROM workspaces WHERE id = ${targetWorkspaceId}
  `;
  const addedBy = owner?.owner_id ?? source.id; // fallback shouldn't happen

  const [newAccount] = await sql<{ id: string }[]>`
    INSERT INTO github_copilot_accounts (
      workspace_id, label, github_login, github_id, encrypted_token, is_valid, added_by
    ) VALUES (
      ${targetWorkspaceId}, ${source.label}, ${source.github_login},
      ${source.github_id}, pgp_sym_encrypt(${source.decrypted_token}, ${ENCRYPTION_KEY}),
      ${source.is_valid}, ${addedBy}
    ) RETURNING id
  `;
  return newAccount?.id ?? null;
}

/**
 * Clone a BYOK provider into a target workspace (if not already there).
 * Returns the local provider ID in the target workspace.
 */
async function cloneProvider(
  sourceProviderId: string,
  targetWorkspaceId: string,
): Promise<string | null> {
  const [source] = await sql<{
    id: string; workspace_id: string; label: string; provider_type: string;
    base_url: string; azure_api_version: string | null; wire_api: string | null;
    is_valid: boolean;
    decrypted_api_key: string | null; decrypted_bearer_token: string | null;
  }[]>`
    SELECT id, workspace_id, label, provider_type, base_url, azure_api_version, wire_api, is_valid,
           CASE WHEN encrypted_api_key IS NOT NULL
             THEN pgp_sym_decrypt(encrypted_api_key::bytea, ${ENCRYPTION_KEY}) ELSE NULL END AS decrypted_api_key,
           CASE WHEN encrypted_bearer_token IS NOT NULL
             THEN pgp_sym_decrypt(encrypted_bearer_token::bytea, ${ENCRYPTION_KEY}) ELSE NULL END AS decrypted_bearer_token
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
          encrypted_api_key = ${source.decrypted_api_key ? sql`pgp_sym_encrypt(${source.decrypted_api_key}, ${ENCRYPTION_KEY})` : null},
          encrypted_bearer_token = ${source.decrypted_bearer_token ? sql`pgp_sym_encrypt(${source.decrypted_bearer_token}, ${ENCRYPTION_KEY})` : null}
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }

  const [owner] = await sql<{ owner_id: string }[]>`
    SELECT owner_id FROM workspaces WHERE id = ${targetWorkspaceId}
  `;
  const addedBy = owner?.owner_id ?? source.id;

  const [newProvider] = await sql<{ id: string }[]>`
    INSERT INTO ai_providers (
      workspace_id, label, provider_type, base_url, encrypted_api_key,
      encrypted_bearer_token, azure_api_version, wire_api, is_valid, added_by
    ) VALUES (
      ${targetWorkspaceId}, ${source.label}, ${source.provider_type}::ai_provider_type,
      ${source.base_url},
      ${source.decrypted_api_key ? sql`pgp_sym_encrypt(${source.decrypted_api_key}, ${ENCRYPTION_KEY})` : null},
      ${source.decrypted_bearer_token ? sql`pgp_sym_encrypt(${source.decrypted_bearer_token}, ${ENCRYPTION_KEY})` : null},
      ${source.azure_api_version}, ${source.wire_api}, ${source.is_valid}, ${addedBy}
    ) RETURNING id
  `;
  return newProvider?.id ?? null;
}

/**
 * Apply platform AI defaults for a given plan to a workspace.
 * Clones the configured provider/account and sets workspace defaults.
 */
export async function applyPlatformAiDefault(
  workspaceId: string,
  ownerId: string,
  plan: string,
): Promise<boolean> {
  const defaults = await platformDefaults.getForPlan(plan);
  if (!defaults) return false;

  // Nothing configured for this tier
  if (!defaults.copilot_account_id && !defaults.provider_id) {
    // Special case: seedAiProviderFromEnv wrote provider_model but couldn't
    // create an ai_providers row (no workspace existed at boot time). If
    // platform_config holds a seeded api key, create the provider now in the
    // target workspace so the first user gets AI access without running /setup.
    if (defaults.source === "custom" && defaults.provider_model) {
      try {
        const apiKey = await getEncryptedConfig("setup.ai_provider_key");
        const baseUrl = (await getConfig("setup.ai_provider_base_url")) as string | null;
        const providerType = ((await getConfig("setup.ai_provider")) as string | null) === "anthropic" ? "anthropic" : "openai";
        if (apiKey) {
          const resolvedBaseUrl = baseUrl || (providerType === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
          const [created] = await sql<{ id: string }[]>`
            INSERT INTO ai_providers (workspace_id, label, provider_type, base_url, encrypted_api_key, is_valid, added_by, scope)
            VALUES (${workspaceId}, ${defaults.provider_model}, ${providerType}::ai_provider_type, ${resolvedBaseUrl},
                    pgp_sym_encrypt(${apiKey}, ${ENCRYPTION_KEY}), true, ${ownerId}, 'workspace'::ai_account_scope)
            ON CONFLICT DO NOTHING
            RETURNING id
          `;
          if (created) {
            // Update platform_ai_defaults to record this provider_id for future workspaces
            await sql`
              UPDATE platform_ai_defaults SET provider_id = ${created.id}
              WHERE plan = ${plan} AND provider_id IS NULL
            `;
            await aiSettings.upsertSettings({
              workspaceId,
              defaultSource: "custom",
              defaultProviderId: created.id,
              defaultProviderModel: defaults.provider_model,
              suggestionSource: "custom",
              suggestionProviderId: created.id,
              suggestionProviderModel: defaults.provider_model,
              updatedBy: ownerId,
            });
            console.log(`[PlatformAI] Seeded BYOK provider for plan=${plan} to workspace ${workspaceId.slice(0, 8)} from platform_config`);
            return true;
          }
        }
      } catch (err) {
        console.warn("[PlatformAI] Failed to seed BYOK provider from platform_config:", err);
      }
    }
    return false;
  }

  let localCopilotId: string | null = null;
  let localProviderId: string | null = null;

  if (defaults.copilot_account_id) {
    localCopilotId = await cloneCopilotAccount(defaults.copilot_account_id, workspaceId);
  }
  if (defaults.provider_id) {
    localProviderId = await cloneProvider(defaults.provider_id, workspaceId);
  }

  // Set as workspace default AND mirror to suggestions. Without the suggestion
  // mirror, the INSERT path in upsertSettings falls through to its `copilot`
  // default for suggestion_source and leaves suggestion_provider_model NULL,
  // so auto-suggestions route to the GitHub Copilot path even though the
  // admin only provisioned a custom provider. The wizard's "use as default
  // for every plan" checkbox already mirrors these — bootstrap should match.
  const source = defaults.source as "copilot" | "custom";
  // Never persist a provider model without its provider id. cloneProvider can
  // return null (e.g. source provider gone); writing the model alongside a null
  // id would seed an orphaned model that later fails resolution. Skip the
  // model columns whenever the cloned provider id is null.
  const providerModel = localProviderId ? defaults.provider_model : null;
  await aiSettings.upsertSettings({
    workspaceId,
    defaultSource: source,
    defaultCopilotAccountId: localCopilotId,
    defaultCopilotModel: defaults.copilot_model,
    defaultProviderId: localProviderId,
    defaultProviderModel: providerModel,
    suggestionSource: source,
    suggestionCopilotAccountId: localCopilotId,
    suggestionCopilotModel: defaults.copilot_model,
    suggestionProviderId: localProviderId,
    suggestionProviderModel: providerModel,
    updatedBy: ownerId,
  });

  console.log(`[PlatformAI] Applied defaults for plan=${plan} to workspace ${workspaceId.slice(0, 8)} (copilot=${!!localCopilotId}, provider=${!!localProviderId})`);
  return true;
}
