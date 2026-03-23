import type postgres from "postgres";
import type {
  GitHubCopilotAccountRow,
  AiProviderRow,
  WorkspaceAiSettingsRow,
  UserAiPreferencesRow,
  EffectiveAiConfigRow,
} from "../types.js";

export function aiSettingsQueries(sql: postgres.Sql, encryptionKey = "doable-dev-encryption-key") {
  const ENCRYPTION_KEY = encryptionKey;
  return {
    // ─── GitHub Copilot Accounts ──────────────────────────────

    async listCopilotAccounts(
      workspaceId: string
    ): Promise<Omit<GitHubCopilotAccountRow, "encrypted_token">[]> {
      return sql`
        SELECT id, workspace_id, label, github_login, github_id,
               is_valid, added_by, created_at, updated_at
        FROM github_copilot_accounts
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at ASC
      `;
    },

    async getCopilotAccountToken(id: string): Promise<string | null> {
      const [row] = await sql<{ token: string }[]>`
        SELECT pgp_sym_decrypt(encrypted_token::bytea, ${ENCRYPTION_KEY}) AS token
        FROM github_copilot_accounts
        WHERE id = ${id} AND is_valid = true
      `;
      return row?.token ?? null;
    },

    async addCopilotAccount(data: {
      workspaceId: string;
      label: string;
      githubLogin: string;
      githubId?: string;
      token: string;
      addedBy: string;
    }): Promise<GitHubCopilotAccountRow> {
      const [row] = await sql<GitHubCopilotAccountRow[]>`
        INSERT INTO github_copilot_accounts (
          workspace_id, label, github_login, github_id,
          encrypted_token, added_by
        ) VALUES (
          ${data.workspaceId},
          ${data.label},
          ${data.githubLogin},
          ${data.githubId ?? null},
          pgp_sym_encrypt(${data.token}, ${ENCRYPTION_KEY}),
          ${data.addedBy}
        )
        RETURNING *
      `;
      return row!;
    },

    async updateCopilotAccount(
      id: string,
      data: { label?: string; token?: string; isValid?: boolean }
    ): Promise<GitHubCopilotAccountRow | undefined> {
      // Build dynamic SET clause
      if (data.token) {
        const [row] = await sql<GitHubCopilotAccountRow[]>`
          UPDATE github_copilot_accounts
          SET label = COALESCE(${data.label ?? null}, label),
              encrypted_token = pgp_sym_encrypt(${data.token}, ${ENCRYPTION_KEY}),
              is_valid = COALESCE(${data.isValid ?? null}, is_valid)
          WHERE id = ${id}
          RETURNING *
        `;
        return row;
      }
      const [row] = await sql<GitHubCopilotAccountRow[]>`
        UPDATE github_copilot_accounts
        SET label = COALESCE(${data.label ?? null}, label),
            is_valid = COALESCE(${data.isValid ?? null}, is_valid)
        WHERE id = ${id}
        RETURNING *
      `;
      return row;
    },

    async deleteCopilotAccount(id: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM github_copilot_accounts WHERE id = ${id}
      `;
      return result.count > 0;
    },

    // ─── AI Providers ─────────────────────────────────────────

    async listProviders(
      workspaceId: string
    ): Promise<Omit<AiProviderRow, "encrypted_api_key" | "encrypted_bearer_token">[]> {
      return sql`
        SELECT id, workspace_id, label, provider_type, base_url,
               azure_api_version, is_valid, added_by, created_at, updated_at
        FROM ai_providers
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at ASC
      `;
    },

    async getProviderWithKey(id: string): Promise<{
      row: AiProviderRow;
      apiKey: string | null;
      bearerToken: string | null;
    } | null> {
      const [row] = await sql<(AiProviderRow & { decrypted_api_key: string | null; decrypted_bearer_token: string | null })[]>`
        SELECT *,
          CASE WHEN encrypted_api_key IS NOT NULL
            THEN pgp_sym_decrypt(encrypted_api_key::bytea, ${ENCRYPTION_KEY})
            ELSE NULL END AS decrypted_api_key,
          CASE WHEN encrypted_bearer_token IS NOT NULL
            THEN pgp_sym_decrypt(encrypted_bearer_token::bytea, ${ENCRYPTION_KEY})
            ELSE NULL END AS decrypted_bearer_token
        FROM ai_providers
        WHERE id = ${id} AND is_valid = true
      `;
      if (!row) return null;
      return {
        row,
        apiKey: row.decrypted_api_key,
        bearerToken: row.decrypted_bearer_token,
      };
    },

    async addProvider(data: {
      workspaceId: string;
      label: string;
      providerType: string;
      baseUrl: string;
      apiKey?: string;
      bearerToken?: string;
      azureApiVersion?: string;
      addedBy: string;
    }): Promise<AiProviderRow> {
      const [row] = await sql<AiProviderRow[]>`
        INSERT INTO ai_providers (
          workspace_id, label, provider_type, base_url,
          encrypted_api_key, encrypted_bearer_token,
          azure_api_version, added_by
        ) VALUES (
          ${data.workspaceId},
          ${data.label},
          ${data.providerType}::ai_provider_type,
          ${data.baseUrl},
          ${data.apiKey ? sql`pgp_sym_encrypt(${data.apiKey}, ${ENCRYPTION_KEY})` : null},
          ${data.bearerToken ? sql`pgp_sym_encrypt(${data.bearerToken}, ${ENCRYPTION_KEY})` : null},
          ${data.azureApiVersion ?? null},
          ${data.addedBy}
        )
        RETURNING *
      `;
      return row!;
    },

    async updateProvider(
      id: string,
      data: {
        label?: string;
        baseUrl?: string;
        apiKey?: string;
        bearerToken?: string;
        azureApiVersion?: string;
        isValid?: boolean;
      }
    ): Promise<AiProviderRow | undefined> {
      const [row] = await sql<AiProviderRow[]>`
        UPDATE ai_providers
        SET label = COALESCE(${data.label ?? null}, label),
            base_url = COALESCE(${data.baseUrl ?? null}, base_url),
            encrypted_api_key = CASE
              WHEN ${data.apiKey ?? null}::text IS NOT NULL
              THEN pgp_sym_encrypt(${data.apiKey ?? ""}, ${ENCRYPTION_KEY})::text
              ELSE encrypted_api_key END,
            encrypted_bearer_token = CASE
              WHEN ${data.bearerToken ?? null}::text IS NOT NULL
              THEN pgp_sym_encrypt(${data.bearerToken ?? ""}, ${ENCRYPTION_KEY})::text
              ELSE encrypted_bearer_token END,
            azure_api_version = COALESCE(${data.azureApiVersion ?? null}, azure_api_version),
            is_valid = COALESCE(${data.isValid ?? null}, is_valid)
        WHERE id = ${id}
        RETURNING *
      `;
      return row;
    },

    async deleteProvider(id: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM ai_providers WHERE id = ${id}
      `;
      return result.count > 0;
    },

    // ─── Workspace AI Settings ────────────────────────────────

    async getSettings(workspaceId: string): Promise<WorkspaceAiSettingsRow | undefined> {
      const [row] = await sql<WorkspaceAiSettingsRow[]>`
        SELECT * FROM workspace_ai_settings
        WHERE workspace_id = ${workspaceId}
      `;
      return row;
    },

    async upsertSettings(data: {
      workspaceId: string;
      defaultCopilotAccountId?: string | null;
      defaultProviderId?: string | null;
      defaultModel?: string | null;
      suggestionCopilotAccountId?: string | null;
      suggestionProviderId?: string | null;
      suggestionModel?: string | null;
      enforceAi?: boolean | null;
      enforcedCopilotAccountId?: string | null;
      enforcedProviderId?: string | null;
      enforcedModel?: string | null;
      showModelSelector?: boolean | null;
      updatedBy: string;
    }): Promise<WorkspaceAiSettingsRow> {
      const [row] = await sql<WorkspaceAiSettingsRow[]>`
        INSERT INTO workspace_ai_settings (
          workspace_id, default_copilot_account_id, default_provider_id,
          default_model, suggestion_copilot_account_id, suggestion_provider_id,
          suggestion_model, enforce_ai, enforced_copilot_account_id,
          enforced_provider_id, enforced_model, show_model_selector, updated_by
        ) VALUES (
          ${data.workspaceId},
          ${data.defaultCopilotAccountId ?? null},
          ${data.defaultProviderId ?? null},
          ${data.defaultModel ?? null},
          ${data.suggestionCopilotAccountId ?? null},
          ${data.suggestionProviderId ?? null},
          ${data.suggestionModel ?? null},
          ${data.enforceAi ?? false},
          ${data.enforcedCopilotAccountId ?? null},
          ${data.enforcedProviderId ?? null},
          ${data.enforcedModel ?? null},
          ${data.showModelSelector ?? false},
          ${data.updatedBy}
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
          default_copilot_account_id = COALESCE(${data.defaultCopilotAccountId ?? null}, workspace_ai_settings.default_copilot_account_id),
          default_provider_id = COALESCE(${data.defaultProviderId ?? null}, workspace_ai_settings.default_provider_id),
          default_model = COALESCE(${data.defaultModel ?? null}, workspace_ai_settings.default_model),
          suggestion_copilot_account_id = COALESCE(${data.suggestionCopilotAccountId ?? null}, workspace_ai_settings.suggestion_copilot_account_id),
          suggestion_provider_id = COALESCE(${data.suggestionProviderId ?? null}, workspace_ai_settings.suggestion_provider_id),
          suggestion_model = COALESCE(${data.suggestionModel ?? null}, workspace_ai_settings.suggestion_model),
          enforce_ai = EXCLUDED.enforce_ai,
          enforced_copilot_account_id = EXCLUDED.enforced_copilot_account_id,
          enforced_provider_id = EXCLUDED.enforced_provider_id,
          enforced_model = EXCLUDED.enforced_model,
          show_model_selector = EXCLUDED.show_model_selector,
          updated_by = ${data.updatedBy}
        RETURNING *
      `;
      return row!;
    },

    // ─── User AI Preferences ──────────────────────────────────

    async getUserPreferences(
      workspaceId: string,
      userId: string
    ): Promise<UserAiPreferencesRow | null> {
      const [row] = await sql<UserAiPreferencesRow[]>`
        SELECT * FROM user_ai_preferences
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;
      return row ?? null;
    },

    async upsertUserPreferences(data: {
      workspaceId: string;
      userId: string;
      copilotAccountId?: string | null;
      providerId?: string | null;
      model?: string | null;
    }): Promise<UserAiPreferencesRow> {
      const [row] = await sql<UserAiPreferencesRow[]>`
        INSERT INTO user_ai_preferences (
          workspace_id, user_id, copilot_account_id, provider_id, model
        ) VALUES (
          ${data.workspaceId},
          ${data.userId},
          ${data.copilotAccountId ?? null},
          ${data.providerId ?? null},
          ${data.model ?? null}
        )
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET
          copilot_account_id = EXCLUDED.copilot_account_id,
          provider_id = EXCLUDED.provider_id,
          model = EXCLUDED.model,
          updated_at = now()
        RETURNING *
      `;
      return row!;
    },

    async listAllUserPreferences(workspaceId: string) {
      return sql<{
        user_id: string;
        email: string;
        display_name: string | null;
        avatar_url: string | null;
        role: string;
        copilot_account_id: string | null;
        copilot_account_label: string | null;
        provider_id: string | null;
        provider_label: string | null;
        provider_type: string | null;
        model: string | null;
        preference_updated_at: Date | null;
      }[]>`
        SELECT
          wm.user_id,
          u.email,
          u.display_name,
          u.avatar_url,
          wm.role,
          uap.copilot_account_id,
          gca.label AS copilot_account_label,
          uap.provider_id,
          ap.label AS provider_label,
          ap.provider_type,
          uap.model,
          uap.updated_at AS preference_updated_at
        FROM workspace_members wm
        INNER JOIN users u ON u.id = wm.user_id
        LEFT JOIN user_ai_preferences uap
          ON uap.workspace_id = wm.workspace_id AND uap.user_id = wm.user_id
        LEFT JOIN github_copilot_accounts gca
          ON gca.id = uap.copilot_account_id
        LEFT JOIN ai_providers ap
          ON ap.id = uap.provider_id
        WHERE wm.workspace_id = ${workspaceId}
        ORDER BY
          CASE wm.role
            WHEN 'owner' THEN 0
            WHEN 'admin' THEN 1
            WHEN 'member' THEN 2
            WHEN 'viewer' THEN 3
          END,
          wm.joined_at ASC
      `;
    },

    async deleteUserPreferences(workspaceId: string, userId: string): Promise<boolean> {
      const result = await sql`
        DELETE FROM user_ai_preferences
        WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      `;
      return result.count > 0;
    },

    async getEffectiveAiConfig(
      workspaceId: string,
      userId: string
    ): Promise<EffectiveAiConfigRow | null> {
      const [row] = await sql<EffectiveAiConfigRow[]>`
        SELECT
          was.enforce_ai,
          was.enforced_copilot_account_id,
          was.enforced_provider_id,
          was.enforced_model,
          was.show_model_selector,
          was.default_copilot_account_id,
          was.default_provider_id,
          was.default_model,
          uap.copilot_account_id AS user_copilot_account_id,
          uap.provider_id AS user_provider_id,
          uap.model AS user_model
        FROM workspace_ai_settings was
        LEFT JOIN user_ai_preferences uap
          ON uap.workspace_id = was.workspace_id AND uap.user_id = ${userId}
        WHERE was.workspace_id = ${workspaceId}
      `;
      return row ?? null;
    },
  };
}
