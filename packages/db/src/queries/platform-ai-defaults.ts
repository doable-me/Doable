import type postgres from "postgres";

export interface PlatformAiDefaultRow {
  plan: string;
  source: string;
  copilot_account_id: string | null;
  copilot_model: string | null;
  provider_id: string | null;
  provider_model: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function platformAiDefaultsQueries(sql: postgres.Sql) {
  return {
    /** Get the platform AI default for a specific plan tier. */
    async getForPlan(plan: string): Promise<PlatformAiDefaultRow | null> {
      const [row] = await sql<PlatformAiDefaultRow[]>`
        SELECT * FROM platform_ai_defaults WHERE plan = ${plan}
      `;
      return row ?? null;
    },

    /** Get all platform AI defaults (one per plan tier). */
    async listAll(): Promise<PlatformAiDefaultRow[]> {
      return sql<PlatformAiDefaultRow[]>`
        SELECT pad.*,
               gca.label  AS copilot_account_label,
               gca.github_login AS copilot_github_login,
               ap.label   AS provider_label,
               ap.provider_type
        FROM platform_ai_defaults pad
        LEFT JOIN github_copilot_accounts gca ON gca.id = pad.copilot_account_id
        LEFT JOIN ai_providers ap ON ap.id = pad.provider_id
        ORDER BY CASE pad.plan
          WHEN 'free' THEN 1
          WHEN 'pro' THEN 2
          WHEN 'business' THEN 3
          WHEN 'enterprise' THEN 4
          ELSE 5
        END
      `;
    },

    /** Update the platform AI default for a plan tier. */
    async upsert(data: {
      plan: string;
      source?: string;
      copilotAccountId?: string | null;
      copilotModel?: string | null;
      providerId?: string | null;
      providerModel?: string | null;
      updatedBy: string;
    }): Promise<PlatformAiDefaultRow> {
      const [row] = await sql<PlatformAiDefaultRow[]>`
        INSERT INTO platform_ai_defaults (plan, source, copilot_account_id, copilot_model, provider_id, provider_model, updated_by, updated_at)
        VALUES (
          ${data.plan},
          ${data.source ?? "copilot"},
          ${data.copilotAccountId ?? null},
          ${data.copilotModel ?? null},
          ${data.providerId ?? null},
          ${data.providerModel ?? null},
          ${data.updatedBy},
          now()
        )
        ON CONFLICT (plan) DO UPDATE SET
          source = COALESCE(${data.source ?? null}, platform_ai_defaults.source),
          copilot_account_id = ${data.copilotAccountId ?? null},
          copilot_model = ${data.copilotModel ?? null},
          provider_id = ${data.providerId ?? null},
          provider_model = ${data.providerModel ?? null},
          updated_by = ${data.updatedBy},
          updated_at = now()
        RETURNING *
      `;
      return row!;
    },
  };
}
