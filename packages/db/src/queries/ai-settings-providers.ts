import type postgres from "postgres";
import type {
  GitHubCopilotAccountRow,
  AiProviderRow,
} from "../types.js";

export function aiSettingsProviderQueries(sql: postgres.Sql, encryptionKey: string) {
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
               azure_api_version, wire_api, is_valid, added_by, created_at, updated_at,
               preset_id, supports_tools, supports_vision, supports_mcp,
               last_health_check, health_status, health_latency_ms,
               display_order, models_cache, default_timeout_ms
        FROM ai_providers
        WHERE workspace_id = ${workspaceId}
        ORDER BY display_order ASC, created_at ASC
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

    /**
     * Get provider with decrypted key, regardless of is_valid status.
     * Used by validate/discover routes that need to test invalid providers.
     */
    async getProviderWithKeyAnyStatus(id: string): Promise<{
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
        WHERE id = ${id}
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
      presetId?: string;
    }): Promise<AiProviderRow> {
      const [row] = await sql<AiProviderRow[]>`
        INSERT INTO ai_providers (
          workspace_id, label, provider_type, base_url,
          encrypted_api_key, encrypted_bearer_token,
          azure_api_version, added_by, preset_id
        ) VALUES (
          ${data.workspaceId},
          ${data.label},
          ${data.providerType}::ai_provider_type,
          ${data.baseUrl},
          ${data.apiKey ? sql`pgp_sym_encrypt(${data.apiKey}, ${ENCRYPTION_KEY})` : null},
          ${data.bearerToken ? sql`pgp_sym_encrypt(${data.bearerToken}, ${ENCRYPTION_KEY})` : null},
          ${data.azureApiVersion ?? null},
          ${data.addedBy},
          ${data.presetId ?? null}
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
  };
}