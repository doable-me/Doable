import type postgres from "postgres";
import { PROVIDER_BY_ID } from "@doable/shared";
import type {
  GitHubCopilotAccountRow,
  AiProviderRow,
} from "../types.js";

export function aiSettingsProviderQueries(sql: postgres.Sql, encryptionKey: string) {
  const ENCRYPTION_KEY = encryptionKey;
  return {
    // ─── GitHub Copilot Accounts ──────────────────────────────

    /**
     * List Copilot accounts visible to a given user in a workspace:
     *   - all scope='workspace' rows (the admin-managed pool)
     *   - the caller's own scope='user' rows (their personal accounts)
     * Other members' personal rows are NEVER returned. Migration 072.
     *
     * If `userId` is omitted (e.g. legacy callers), only workspace rows are
     * returned — never personal — so an old caller can't accidentally leak
     * a user-scoped row.
     */
    async listCopilotAccounts(
      workspaceId: string,
      userId?: string
    ): Promise<Omit<GitHubCopilotAccountRow, "encrypted_token">[]> {
      if (userId) {
        return sql`
          SELECT id, workspace_id, label, github_login, github_id,
                 is_valid, added_by, scope, owner_user_id, created_at, updated_at
          FROM github_copilot_accounts
          WHERE workspace_id = ${workspaceId}
            AND (
              scope = 'workspace'
              OR (scope = 'user' AND owner_user_id = ${userId})
            )
          ORDER BY scope ASC, created_at ASC
        `;
      }
      return sql`
        SELECT id, workspace_id, label, github_login, github_id,
               is_valid, added_by, scope, owner_user_id, created_at, updated_at
        FROM github_copilot_accounts
        WHERE workspace_id = ${workspaceId}
          AND scope = 'workspace'
        ORDER BY created_at ASC
      `;
    },

    /**
     * Lightweight ownership/scope probe — returns just the fields the route
     * layer needs to decide whether the caller may PATCH/DELETE/validate
     * this row. Never returns the encrypted token. Migration 072.
     */
    async getCopilotAccountAuthInfo(id: string): Promise<{
      id: string;
      workspace_id: string;
      scope: GitHubCopilotAccountRow["scope"];
      owner_user_id: string | null;
    } | null> {
      const [row] = await sql<{
        id: string;
        workspace_id: string;
        scope: GitHubCopilotAccountRow["scope"];
        owner_user_id: string | null;
      }[]>`
        SELECT id, workspace_id, scope, owner_user_id
        FROM github_copilot_accounts
        WHERE id = ${id}
      `;
      return row ?? null;
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
      /** Default 'workspace' for back-compat. Pass 'user' for a personal account. */
      scope?: GitHubCopilotAccountRow["scope"];
      /** Required when scope='user'. The DB CHECK constraint also enforces this. */
      ownerUserId?: string | null;
    }): Promise<GitHubCopilotAccountRow> {
      const scope = data.scope ?? "workspace";
      const ownerUserId = scope === "user" ? (data.ownerUserId ?? data.addedBy) : null;
      const [row] = await sql<GitHubCopilotAccountRow[]>`
        INSERT INTO github_copilot_accounts (
          workspace_id, label, github_login, github_id,
          encrypted_token, added_by, scope, owner_user_id
        ) VALUES (
          ${data.workspaceId},
          ${data.label},
          ${data.githubLogin},
          ${data.githubId ?? null},
          pgp_sym_encrypt(${data.token}, ${ENCRYPTION_KEY}),
          ${data.addedBy},
          ${scope}::ai_account_scope,
          ${ownerUserId}
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

    /**
     * List custom AI providers visible to a user in a workspace:
     *   - all scope='workspace' rows
     *   - the caller's own scope='user' rows
     * See listCopilotAccounts for rationale. Migration 072.
     */
    async listProviders(
      workspaceId: string,
      userId?: string
    ): Promise<Omit<AiProviderRow, "encrypted_api_key" | "encrypted_bearer_token">[]> {
      if (userId) {
        return sql`
          SELECT id, workspace_id, label, provider_type, base_url,
                 azure_api_version, wire_api, is_valid, added_by, created_at, updated_at,
                 preset_id, supports_tools, supports_vision, supports_mcp,
                 last_health_check, health_status, health_latency_ms,
                 display_order, models_cache, default_timeout_ms,
                 scope, owner_user_id
          FROM ai_providers
          WHERE workspace_id = ${workspaceId}
            AND (
              scope = 'workspace'
              OR (scope = 'user' AND owner_user_id = ${userId})
            )
          ORDER BY scope ASC, display_order ASC, created_at ASC
        `;
      }
      return sql`
        SELECT id, workspace_id, label, provider_type, base_url,
               azure_api_version, wire_api, is_valid, added_by, created_at, updated_at,
               preset_id, supports_tools, supports_vision, supports_mcp,
               last_health_check, health_status, health_latency_ms,
               display_order, models_cache, default_timeout_ms,
               scope, owner_user_id
        FROM ai_providers
        WHERE workspace_id = ${workspaceId}
          AND scope = 'workspace'
        ORDER BY display_order ASC, created_at ASC
      `;
    },

    /** Lightweight scope/ownership probe for the route layer. Migration 072. */
    async getProviderAuthInfo(id: string): Promise<{
      id: string;
      workspace_id: string;
      scope: AiProviderRow["scope"];
      owner_user_id: string | null;
    } | null> {
      const [row] = await sql<{
        id: string;
        workspace_id: string;
        scope: AiProviderRow["scope"];
        owner_user_id: string | null;
      }[]>`
        SELECT id, workspace_id, scope, owner_user_id
        FROM ai_providers
        WHERE id = ${id}
      `;
      return row ?? null;
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
      /** Default 'workspace' for back-compat. Pass 'user' for a personal provider. */
      scope?: AiProviderRow["scope"];
      /** Required when scope='user'. The DB CHECK constraint also enforces this. */
      ownerUserId?: string | null;
    }): Promise<AiProviderRow> {
      const scope = data.scope ?? "workspace";
      const ownerUserId = scope === "user" ? (data.ownerUserId ?? data.addedBy) : null;
      const [row] = await sql<AiProviderRow[]>`
        INSERT INTO ai_providers (
          workspace_id, label, provider_type, base_url,
          encrypted_api_key, encrypted_bearer_token,
          azure_api_version, added_by, preset_id, scope, owner_user_id
        ) VALUES (
          ${data.workspaceId},
          ${data.label},
          ${data.providerType}::ai_provider_type,
          ${data.baseUrl},
          ${data.apiKey ? sql`pgp_sym_encrypt(${data.apiKey}, ${ENCRYPTION_KEY})` : null},
          ${data.bearerToken ? sql`pgp_sym_encrypt(${data.bearerToken}, ${ENCRYPTION_KEY})` : null},
          ${data.azureApiVersion ?? null},
          ${data.addedBy},
          ${data.presetId ?? null},
          ${scope}::ai_account_scope,
          ${ownerUserId}
        )
        RETURNING *
      `;

      // Seed ai_provider_models from the catalog preset's defaultModels so the
      // model dropdown is populated immediately — even for providers whose
      // SDK doesn't expose /models discovery (e.g. DeepSeek). Mirrors the
      // upsert used when discovery returns models. Best-effort: a seeding
      // failure must not fail provider creation.
      const preset = data.presetId ? PROVIDER_BY_ID[data.presetId as keyof typeof PROVIDER_BY_ID] : undefined;
      if (row && preset && preset.defaultModels.length > 0) {
        try {
          for (const m of preset.defaultModels) {
            await sql`
              INSERT INTO ai_provider_models (provider_id, model_id, display_name, context_window, supports_tools, supports_vision)
              VALUES (
                ${row.id},
                ${m.id},
                ${m.name ?? null},
                ${m.contextWindow ?? null},
                ${m.supportsTools ?? true},
                ${m.supportsVision ?? false}
              )
              ON CONFLICT (provider_id, model_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                context_window = EXCLUDED.context_window,
                supports_tools = EXCLUDED.supports_tools,
                supports_vision = EXCLUDED.supports_vision
            `;
          }
        } catch (err) {
          console.error("[AI Settings] Failed to seed catalog models on provider add:", err);
        }
      }

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
        /**
         * Promote/demote scope. When promoting to 'workspace', owner_user_id
         * is forced NULL to satisfy aip_scope_owner_consistent (migration
         * 072). When demoting to 'user', ownerUserId MUST be supplied (the
         * route layer passes the caller's id). Migration 072.
         */
        scope?: AiProviderRow["scope"];
        /** Required when scope='user'. Ignored when scope='workspace'. */
        ownerUserId?: string | null;
      }
    ): Promise<AiProviderRow | undefined> {
      // Keep scope and owner_user_id consistent with the CHECK constraint
      // aip_scope_owner_consistent: owner NULL iff scope='workspace'.
      const ownerUserId = data.scope === "workspace"
        ? null
        : data.scope === "user"
          ? (data.ownerUserId ?? null)
          : null;
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
            is_valid = COALESCE(${data.isValid ?? null}, is_valid),
            scope = COALESCE(${data.scope ?? null}::ai_account_scope, scope),
            owner_user_id = CASE
              WHEN ${data.scope ?? null}::text IS NOT NULL THEN ${ownerUserId}
              ELSE owner_user_id END
        WHERE id = ${id}
        RETURNING *
      `;
      return row;
    },

    async deleteProvider(id: string): Promise<boolean> {
      // Provider deletion nulls dependent *_provider_id FKs via ON DELETE SET
      // NULL, but leaves the paired *_provider_model TEXT columns orphaned
      // (model string with no provider). Null those model columns in the SAME
      // transaction BEFORE the delete so no orphaned model can survive and
      // silently borrow the gh-CLI fallback path at resolve time.
      return sql.begin(async (_tx) => {
        const tx = _tx as unknown as postgres.Sql;

        // workspace_ai_settings: default + suggestion + enforced model columns.
        // NOTE: there is no `enforced_provider_model` column — the enforced
        // model lives in `enforced_model` (migration 011), so we null that.
        await tx`
          UPDATE workspace_ai_settings
          SET default_provider_model = NULL
          WHERE default_provider_id = ${id}
        `;
        await tx`
          UPDATE workspace_ai_settings
          SET suggestion_provider_model = NULL
          WHERE suggestion_provider_id = ${id}
        `;
        await tx`
          UPDATE workspace_ai_settings
          SET enforced_model = NULL
          WHERE enforced_provider_id = ${id}
        `;

        // user_ai_preferences: primary + suggestion model columns.
        await tx`
          UPDATE user_ai_preferences
          SET provider_model = NULL
          WHERE provider_id = ${id}
        `;
        await tx`
          UPDATE user_ai_preferences
          SET suggestion_provider_model = NULL
          WHERE suggestion_provider_id = ${id}
        `;

        const result = await tx`
          DELETE FROM ai_providers WHERE id = ${id}
        `;
        return result.count > 0;
      });
    },
  };
}