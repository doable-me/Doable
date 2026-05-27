import type postgres from "postgres";
import type {
  WorkspaceAiSettingsRow,
  UserAiPreferencesRow,
  EffectiveAiConfigRow,
  AiSource,
} from "../types.js";

export function aiSettingsPreferenceQueries(sql: postgres.Sql) {
  return {
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
      // Workspace defaults
      defaultSource?: AiSource;
      defaultCopilotAccountId?: string | null;
      defaultCopilotModel?: string | null;
      defaultProviderId?: string | null;
      defaultProviderModel?: string | null;
      // Workspace suggestion defaults
      suggestionSource?: AiSource;
      suggestionCopilotAccountId?: string | null;
      suggestionCopilotModel?: string | null;
      suggestionProviderId?: string | null;
      suggestionProviderModel?: string | null;
      // Enforcement
      enforceAi?: boolean | null;
      enforcedCopilotAccountId?: string | null;
      enforcedProviderId?: string | null;
      enforcedModel?: string | null;
      showModelSelector?: boolean | null;
      defaultFrameworkId?: string | null;
      updatedBy: string;
    }): Promise<WorkspaceAiSettingsRow> {
      // For each updatable field, distinguish "not provided" (undefined → keep
      // existing value) from "explicit clear" (null → set to NULL). A plain
      // COALESCE(new, old) pattern can't tell these apart and silently ignores
      // intentional clears.
      //
      // This is load-bearing for the admin caller in services/api/src/routes/
      // admin.ts:472, which only sends a subset of fields and expects the rest
      // (including suggestion_*, source columns, etc.) to be untouched.
      // Paired-write invariant: never persist a non-null *_provider_model with
      // a null/empty *_provider_id. When the caller EXPLICITLY clears a
      // provider id (null or ""), force-clear the matching model in the same
      // write. `undefined` means "keep existing" and is left untouched so the
      // happy path (provider + model both set) is unaffected.
      const clearDefaultProvider = data.defaultProviderId === null || data.defaultProviderId === "";
      const clearSuggestionProvider = data.suggestionProviderId === null || data.suggestionProviderId === "";
      const defaultProviderModel = clearDefaultProvider ? null : data.defaultProviderModel;
      const suggestionProviderModel = clearSuggestionProvider ? null : data.suggestionProviderModel;

      const keepDefaultCopilot = data.defaultCopilotAccountId === undefined;
      const keepDefaultCopilotModel = data.defaultCopilotModel === undefined;
      const keepDefaultProvider = data.defaultProviderId === undefined;
      const keepDefaultProviderModel = defaultProviderModel === undefined;
      const keepSuggestionCopilot = data.suggestionCopilotAccountId === undefined;
      const keepSuggestionCopilotModel = data.suggestionCopilotModel === undefined;
      const keepSuggestionProvider = data.suggestionProviderId === undefined;
      const keepSuggestionProviderModel = suggestionProviderModel === undefined;
      const keepDefaultFrameworkId = data.defaultFrameworkId === undefined;

      const [row] = await sql<WorkspaceAiSettingsRow[]>`
        INSERT INTO workspace_ai_settings (
          workspace_id,
          default_source, default_copilot_account_id, default_copilot_model,
          default_provider_id, default_provider_model,
          suggestion_source, suggestion_copilot_account_id, suggestion_copilot_model,
          suggestion_provider_id, suggestion_provider_model,
          enforce_ai, enforced_copilot_account_id, enforced_provider_id,
          enforced_model, show_model_selector, default_framework_id, updated_by
        ) VALUES (
          ${data.workspaceId},
          ${data.defaultSource ?? "copilot"},
          ${data.defaultCopilotAccountId ?? null},
          ${data.defaultCopilotModel ?? null},
          ${data.defaultProviderId ?? null},
          ${defaultProviderModel ?? null},
          ${data.suggestionSource ?? "copilot"},
          ${data.suggestionCopilotAccountId ?? null},
          ${data.suggestionCopilotModel ?? null},
          ${data.suggestionProviderId ?? null},
          ${suggestionProviderModel ?? null},
          ${data.enforceAi ?? false},
          ${data.enforcedCopilotAccountId ?? null},
          ${data.enforcedProviderId ?? null},
          ${data.enforcedModel ?? null},
          ${data.showModelSelector ?? false},
          ${data.defaultFrameworkId ?? null},
          ${data.updatedBy}
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
          default_source = ${data.defaultSource !== undefined
            ? sql`${data.defaultSource}`
            : sql`workspace_ai_settings.default_source`},
          default_copilot_account_id = ${keepDefaultCopilot
            ? sql`workspace_ai_settings.default_copilot_account_id`
            : sql`${data.defaultCopilotAccountId ?? null}`},
          default_copilot_model = ${keepDefaultCopilotModel
            ? sql`workspace_ai_settings.default_copilot_model`
            : sql`${data.defaultCopilotModel ?? null}`},
          default_provider_id = ${keepDefaultProvider
            ? sql`workspace_ai_settings.default_provider_id`
            : sql`${data.defaultProviderId ?? null}`},
          default_provider_model = ${keepDefaultProviderModel
            ? sql`workspace_ai_settings.default_provider_model`
            : sql`${defaultProviderModel ?? null}`},
          suggestion_source = ${data.suggestionSource !== undefined
            ? sql`${data.suggestionSource}`
            : sql`workspace_ai_settings.suggestion_source`},
          suggestion_copilot_account_id = ${keepSuggestionCopilot
            ? sql`workspace_ai_settings.suggestion_copilot_account_id`
            : sql`${data.suggestionCopilotAccountId ?? null}`},
          suggestion_copilot_model = ${keepSuggestionCopilotModel
            ? sql`workspace_ai_settings.suggestion_copilot_model`
            : sql`${data.suggestionCopilotModel ?? null}`},
          suggestion_provider_id = ${keepSuggestionProvider
            ? sql`workspace_ai_settings.suggestion_provider_id`
            : sql`${data.suggestionProviderId ?? null}`},
          suggestion_provider_model = ${keepSuggestionProviderModel
            ? sql`workspace_ai_settings.suggestion_provider_model`
            : sql`${suggestionProviderModel ?? null}`},
          enforce_ai = EXCLUDED.enforce_ai,
          enforced_copilot_account_id = EXCLUDED.enforced_copilot_account_id,
          enforced_provider_id = EXCLUDED.enforced_provider_id,
          enforced_model = EXCLUDED.enforced_model,
          show_model_selector = EXCLUDED.show_model_selector,
          default_framework_id = ${keepDefaultFrameworkId
            ? sql`workspace_ai_settings.default_framework_id`
            : sql`${data.defaultFrameworkId ?? null}`},
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
      // Primary override
      source?: AiSource;
      copilotAccountId?: string | null;
      copilotModel?: string | null;
      providerId?: string | null;
      providerModel?: string | null;
      // Suggestion override
      suggestionSource?: AiSource;
      suggestionCopilotAccountId?: string | null;
      suggestionCopilotModel?: string | null;
      suggestionProviderId?: string | null;
      suggestionProviderModel?: string | null;
    }): Promise<UserAiPreferencesRow> {
      // Same partial-update semantics as upsertSettings: undefined → keep,
      // null → clear. Both copilot and custom configs can be persisted at
      // once; the active side is selected via `source` / `suggestion_source`.
      // Paired-write invariant (see upsertSettings): explicitly clearing a
      // provider id (null/"") force-clears the matching model in the same
      // write; `undefined` keeps the existing value so the happy path is intact.
      const clearProvider = data.providerId === null || data.providerId === "";
      const clearSuggestionProvider = data.suggestionProviderId === null || data.suggestionProviderId === "";
      const providerModel = clearProvider ? null : data.providerModel;
      const suggestionProviderModel = clearSuggestionProvider ? null : data.suggestionProviderModel;

      const keepCopilot = data.copilotAccountId === undefined;
      const keepCopilotModel = data.copilotModel === undefined;
      const keepProvider = data.providerId === undefined;
      const keepProviderModel = providerModel === undefined;
      const keepSuggestionCopilot = data.suggestionCopilotAccountId === undefined;
      const keepSuggestionCopilotModel = data.suggestionCopilotModel === undefined;
      const keepSuggestionProvider = data.suggestionProviderId === undefined;
      const keepSuggestionProviderModel = suggestionProviderModel === undefined;

      const [row] = await sql<UserAiPreferencesRow[]>`
        INSERT INTO user_ai_preferences (
          workspace_id, user_id,
          source, copilot_account_id, copilot_model,
          provider_id, provider_model,
          suggestion_source, suggestion_copilot_account_id, suggestion_copilot_model,
          suggestion_provider_id, suggestion_provider_model
        ) VALUES (
          ${data.workspaceId},
          ${data.userId},
          ${data.source ?? "copilot"},
          ${data.copilotAccountId ?? null},
          ${data.copilotModel ?? null},
          ${data.providerId ?? null},
          ${providerModel ?? null},
          ${data.suggestionSource ?? "copilot"},
          ${data.suggestionCopilotAccountId ?? null},
          ${data.suggestionCopilotModel ?? null},
          ${data.suggestionProviderId ?? null},
          ${suggestionProviderModel ?? null}
        )
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET
          source = ${data.source !== undefined
            ? sql`${data.source}`
            : sql`user_ai_preferences.source`},
          copilot_account_id = ${keepCopilot
            ? sql`user_ai_preferences.copilot_account_id`
            : sql`${data.copilotAccountId ?? null}`},
          copilot_model = ${keepCopilotModel
            ? sql`user_ai_preferences.copilot_model`
            : sql`${data.copilotModel ?? null}`},
          provider_id = ${keepProvider
            ? sql`user_ai_preferences.provider_id`
            : sql`${data.providerId ?? null}`},
          provider_model = ${keepProviderModel
            ? sql`user_ai_preferences.provider_model`
            : sql`${providerModel ?? null}`},
          suggestion_source = ${data.suggestionSource !== undefined
            ? sql`${data.suggestionSource}`
            : sql`user_ai_preferences.suggestion_source`},
          suggestion_copilot_account_id = ${keepSuggestionCopilot
            ? sql`user_ai_preferences.suggestion_copilot_account_id`
            : sql`${data.suggestionCopilotAccountId ?? null}`},
          suggestion_copilot_model = ${keepSuggestionCopilotModel
            ? sql`user_ai_preferences.suggestion_copilot_model`
            : sql`${data.suggestionCopilotModel ?? null}`},
          suggestion_provider_id = ${keepSuggestionProvider
            ? sql`user_ai_preferences.suggestion_provider_id`
            : sql`${data.suggestionProviderId ?? null}`},
          suggestion_provider_model = ${keepSuggestionProviderModel
            ? sql`user_ai_preferences.suggestion_provider_model`
            : sql`${suggestionProviderModel ?? null}`},
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
        source: AiSource | null;
        copilot_account_id: string | null;
        copilot_account_label: string | null;
        copilot_model: string | null;
        provider_id: string | null;
        provider_label: string | null;
        provider_type: string | null;
        provider_model: string | null;
        /** @deprecated use copilot_model / provider_model */
        model: string | null;
        preference_updated_at: Date | null;
      }[]>`
        SELECT
          wm.user_id,
          u.email,
          u.display_name,
          u.avatar_url,
          wm.role,
          uap.source,
          uap.copilot_account_id,
          gca.label AS copilot_account_label,
          uap.copilot_model,
          uap.provider_id,
          ap.label AS provider_label,
          ap.provider_type,
          uap.provider_model,
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
          -- Workspace defaults
          was.default_source,
          was.default_copilot_account_id,
          was.default_copilot_model,
          was.default_provider_id,
          was.default_provider_model,
          -- Workspace suggestion defaults
          was.suggestion_source,
          was.suggestion_copilot_account_id,
          was.suggestion_copilot_model,
          was.suggestion_provider_id,
          was.suggestion_provider_model,
          -- Per-user override
          uap.source                          AS user_source,
          uap.copilot_account_id              AS user_copilot_account_id,
          uap.copilot_model                   AS user_copilot_model,
          uap.provider_id                     AS user_provider_id,
          uap.provider_model                  AS user_provider_model,
          -- Per-user suggestion override
          uap.suggestion_source               AS user_suggestion_source,
          uap.suggestion_copilot_account_id   AS user_suggestion_copilot_account_id,
          uap.suggestion_copilot_model        AS user_suggestion_copilot_model,
          uap.suggestion_provider_id          AS user_suggestion_provider_id,
          uap.suggestion_provider_model       AS user_suggestion_provider_model
        FROM workspace_ai_settings was
        LEFT JOIN user_ai_preferences uap
          ON uap.workspace_id = was.workspace_id AND uap.user_id = ${userId}
        WHERE was.workspace_id = ${workspaceId}
      `;
      return row ?? null;
    },
  };
}