import type postgres from "postgres";

// ─── Row Types ────────────────────────────────────────────

export interface EnvVarRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  scope: "workspace" | "project";
  key: string;
  is_secret: boolean;
  target: "development" | "preview" | "production" | "all";
  description: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/** Returned when we need the decrypted value (internal only) */
export interface EnvVarDecryptedRow extends EnvVarRow {
  decrypted_value: string;
}

// ─── Queries ──────────────────────────────────────────────

export function envVarQueries(sql: postgres.Sql) {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "doable-dev-encryption-key";

  return {
    // ── List (never returns decrypted values) ──────────────
    async listForWorkspace(workspaceId: string): Promise<EnvVarRow[]> {
      return sql<EnvVarRow[]>`
        SELECT id, workspace_id, project_id, scope, key, is_secret, target, description, created_by, created_at, updated_at
        FROM env_vars
        WHERE workspace_id = ${workspaceId} AND scope = 'workspace'
        ORDER BY key, target
      `;
    },

    async listForProject(projectId: string): Promise<EnvVarRow[]> {
      return sql<EnvVarRow[]>`
        SELECT id, workspace_id, project_id, scope, key, is_secret, target, description, created_by, created_at, updated_at
        FROM env_vars
        WHERE project_id = ${projectId} AND scope = 'project'
        ORDER BY key, target
      `;
    },

    // ── Create ────────────────────────────────────────────
    async create(params: {
      workspaceId: string;
      projectId?: string;
      scope: "workspace" | "project";
      key: string;
      value: string;
      isSecret?: boolean;
      target?: "development" | "preview" | "production" | "all";
      description?: string;
      createdBy: string;
    }): Promise<EnvVarRow> {
      const [row] = await sql<EnvVarRow[]>`
        INSERT INTO env_vars (workspace_id, project_id, scope, key, value_encrypted, is_secret, target, description, created_by)
        VALUES (
          ${params.workspaceId},
          ${params.projectId ?? null},
          ${params.scope},
          ${params.key},
          pgp_sym_encrypt(${params.value}, ${ENCRYPTION_KEY}),
          ${params.isSecret ?? true},
          ${params.target ?? "all"},
          ${params.description ?? ""},
          ${params.createdBy}
        )
        RETURNING id, workspace_id, project_id, scope, key, is_secret, target, description, created_by, created_at, updated_at
      `;
      return row!;
    },

    // ── Update value ──────────────────────────────────────
    async update(id: string, params: {
      key?: string;
      value?: string;
      isSecret?: boolean;
      target?: "development" | "preview" | "production" | "all";
      description?: string;
    }): Promise<EnvVarRow | null> {
      // Build update dynamically — if value is provided, re-encrypt
      if (params.value !== undefined) {
        const [row] = await sql<EnvVarRow[]>`
          UPDATE env_vars SET
            key = COALESCE(${params.key ?? null}, key),
            value_encrypted = pgp_sym_encrypt(${params.value}, ${ENCRYPTION_KEY}),
            is_secret = COALESCE(${params.isSecret ?? null}, is_secret),
            target = COALESCE(${params.target ?? null}, target),
            description = COALESCE(${params.description ?? null}, description),
            updated_at = now()
          WHERE id = ${id}
          RETURNING id, workspace_id, project_id, scope, key, is_secret, target, description, created_by, created_at, updated_at
        `;
        return row ?? null;
      }
      // Update metadata only (no value change)
      const [row] = await sql<EnvVarRow[]>`
        UPDATE env_vars SET
          key = COALESCE(${params.key ?? null}, key),
          is_secret = COALESCE(${params.isSecret ?? null}, is_secret),
          target = COALESCE(${params.target ?? null}, target),
          description = COALESCE(${params.description ?? null}, description),
          updated_at = now()
        WHERE id = ${id}
        RETURNING id, workspace_id, project_id, scope, key, is_secret, target, description, created_by, created_at, updated_at
      `;
      return row ?? null;
    },

    // ── Delete ────────────────────────────────────────────
    async remove(id: string): Promise<boolean> {
      const result = await sql`DELETE FROM env_vars WHERE id = ${id}`;
      return result.count > 0;
    },

    // ── Resolve merged vars for a project + target ────────
    // Returns decrypted values — INTERNAL USE ONLY (dev server, build, deploy)
    async resolveForProject(
      workspaceId: string,
      projectId: string,
      target: "development" | "preview" | "production",
    ): Promise<Record<string, string>> {
      // Get all matching vars (workspace + project), project overrides workspace for same key+target
      const rows = await sql<EnvVarDecryptedRow[]>`
        SELECT DISTINCT ON (key)
          key,
          pgp_sym_decrypt(value_encrypted, ${ENCRYPTION_KEY}) as decrypted_value
        FROM env_vars
        WHERE workspace_id = ${workspaceId}
          AND (project_id IS NULL OR project_id = ${projectId})
          AND (target = ${target} OR target = 'all')
        ORDER BY key, project_id NULLS LAST
      `;
      // project_id NULLS LAST means project-scoped vars come first in DISTINCT ON, overriding workspace vars
      const result: Record<string, string> = {};
      for (const r of rows) {
        result[r.key] = r.decrypted_value;
      }
      return result;
    },

    // ── Get single var's decrypted value (for non-secret reveal) ──
    async getDecryptedValue(id: string): Promise<string | null> {
      const [row] = await sql<{ val: string }[]>`
        SELECT pgp_sym_decrypt(value_encrypted, ${ENCRYPTION_KEY}) as val
        FROM env_vars WHERE id = ${id}
      `;
      return row?.val ?? null;
    },
  };
}
