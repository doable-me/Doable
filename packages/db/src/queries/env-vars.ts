import type postgres from "postgres";
// Envelope-encryption helpers live in the API package. Importing across
// workspaces keeps the same wire format used by integration_connections (070)
// and oauth_apps (074). When DOABLE_ENVELOPE_ENCRYPTION=1, workspace-scoped
// env_vars write via envelope_v1; project-scoped vars currently lack a
// workspace_id on the insert path and stay on pgp_sym.
import { encryptForWorkspace, decryptForWorkspace } from "../../../../services/api/src/lib/envelope-crypto.js";
import { getEncryptionKey } from "../secrets.js";

function useEnvelope(): boolean {
  return process.env.DOABLE_ENVELOPE_ENCRYPTION === "1";
}

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
  const ENCRYPTION_KEY = getEncryptionKey();

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
      // Envelope path: workspace-scoped only (DEK derived per workspaceId).
      // Project-scoped vars still use pgp_sym until they get a stable workspaceId
      // resolver.
      if (useEnvelope() && params.scope === "workspace") {
        const blob = await encryptForWorkspace(params.workspaceId, params.value);
        const [row] = await sql<EnvVarRow[]>`
          INSERT INTO env_vars (workspace_id, project_id, scope, key, value_encrypted, credentials_format, is_secret, target, description, created_by)
          VALUES (
            ${params.workspaceId},
            ${params.projectId ?? null},
            ${params.scope},
            ${params.key},
            decode(${blob}, 'base64'),
            'envelope_v1',
            ${params.isSecret ?? true},
            ${params.target ?? "all"},
            ${params.description ?? ""},
            ${params.createdBy}
          )
          RETURNING id, workspace_id, project_id, scope, key, is_secret, target, description, created_by, created_at, updated_at
        `;
        return row!;
      }
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
        if (useEnvelope()) {
          const [existing] = await sql<{ workspace_id: string; scope: string }[]>`
            SELECT workspace_id, scope FROM env_vars WHERE id = ${id}
          `;
          if (existing && existing.scope === "workspace") {
            const blob = await encryptForWorkspace(existing.workspace_id, params.value);
            const [row] = await sql<EnvVarRow[]>`
              UPDATE env_vars SET
                key = COALESCE(${params.key ?? null}, key),
                value_encrypted = decode(${blob}, 'base64'),
                credentials_format = 'envelope_v1',
                is_secret = COALESCE(${params.isSecret ?? null}, is_secret),
                target = COALESCE(${params.target ?? null}, target),
                description = COALESCE(${params.description ?? null}, description),
                updated_at = now()
              WHERE id = ${id}
              RETURNING id, workspace_id, project_id, scope, key, is_secret, target, description, created_by, created_at, updated_at
            `;
            return row ?? null;
          }
        }
        const [row] = await sql<EnvVarRow[]>`
          UPDATE env_vars SET
            key = COALESCE(${params.key ?? null}, key),
            value_encrypted = pgp_sym_encrypt(${params.value}, ${ENCRYPTION_KEY}),
            credentials_format = 'pgp_sym',
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
      // Auto-detect format on read. envelope_v1 rows decrypt via workspace DEK,
      // pgp_sym rows via the legacy ENCRYPTION_KEY.
      const rows = await sql<Array<{
        key: string;
        credentials_format: string;
        envelope_blob: string | null;
        pgp_value: string | null;
      }>>`
        SELECT DISTINCT ON (key)
          key,
          credentials_format,
          CASE WHEN credentials_format = 'envelope_v1'
               THEN encode(value_encrypted, 'base64') ELSE NULL END AS envelope_blob,
          CASE WHEN credentials_format = 'envelope_v1'
               THEN NULL
               ELSE pgp_sym_decrypt(value_encrypted, ${ENCRYPTION_KEY}) END AS pgp_value
        FROM env_vars
        WHERE workspace_id = ${workspaceId}
          AND (project_id IS NULL OR project_id = ${projectId})
          AND (target = ${target} OR target = 'all')
        ORDER BY key, project_id NULLS LAST
      `;
      const result: Record<string, string> = {};
      for (const r of rows) {
        if (r.credentials_format === "envelope_v1" && r.envelope_blob) {
          result[r.key] = (await decryptForWorkspace(workspaceId, r.envelope_blob)).toString("utf8");
        } else if (r.pgp_value !== null) {
          result[r.key] = r.pgp_value;
        }
      }
      return result;
    },

    // ── Get single var's decrypted value (for non-secret reveal) ──
    async getDecryptedValue(id: string): Promise<string | null> {
      const [row] = await sql<Array<{
        credentials_format: string;
        workspace_id: string;
        envelope_blob: string | null;
        pgp_value: string | null;
      }>>`
        SELECT
          credentials_format,
          workspace_id,
          CASE WHEN credentials_format = 'envelope_v1'
               THEN encode(value_encrypted, 'base64') ELSE NULL END AS envelope_blob,
          CASE WHEN credentials_format = 'envelope_v1'
               THEN NULL
               ELSE pgp_sym_decrypt(value_encrypted, ${ENCRYPTION_KEY}) END AS pgp_value
        FROM env_vars WHERE id = ${id}
      `;
      if (!row) return null;
      if (row.credentials_format === "envelope_v1" && row.envelope_blob) {
        return (await decryptForWorkspace(row.workspace_id, row.envelope_blob)).toString("utf8");
      }
      return row.pgp_value;
    },
  };
}
