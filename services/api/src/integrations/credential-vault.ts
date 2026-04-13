import { sql } from "../db/index.js";
import type { IntegrationConnection, DecryptedConnection, OAuthApp, DecryptedOAuthApp, AuthType } from "./types.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";

export const credentialVault = {
  /**
   * Store new credentials (encrypted at rest)
   */
  async store(params: {
    workspaceId: string;
    userId: string;
    integrationId: string;
    scope: "workspace" | "project" | "user";
    projectId?: string;
    authType: AuthType;
    credentials: unknown;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<IntegrationConnection> {
    const credJson = JSON.stringify(params.credentials);
    const [row] = await sql`
      INSERT INTO integration_connections (
        workspace_id, user_id, integration_id, scope, project_id,
        auth_type, credentials_encrypted, display_name, metadata, status
      ) VALUES (
        ${params.workspaceId}, ${params.userId}, ${params.integrationId},
        ${params.scope}, ${params.projectId ?? null},
        ${params.authType},
        pgp_sym_encrypt(${credJson}, ${ENCRYPTION_KEY}),
        ${params.displayName ?? null},
        ${JSON.stringify(params.metadata ?? {})},
        'active'
      )
      RETURNING id, workspace_id, user_id, integration_id, scope, project_id,
                auth_type, credentials_encrypted, display_name, status,
                error_message, metadata, created_at, updated_at
    `;
    return row as IntegrationConnection;
  },

  /**
   * Get and decrypt credentials for an integration
   */
  async get(userId: string, integrationId: string, workspaceId: string): Promise<DecryptedConnection | null> {
    const [row] = await sql`
      SELECT ic.*,
             pgp_sym_decrypt(ic.credentials_encrypted, ${ENCRYPTION_KEY}) as credentials_decrypted
      FROM integration_connections ic
      WHERE ic.integration_id = ${integrationId}
        AND ic.workspace_id = ${workspaceId}
        AND ic.status = 'active'
        AND (ic.user_id = ${userId} OR ic.scope = 'workspace')
      ORDER BY
        CASE WHEN ic.user_id = ${userId} THEN 0 ELSE 1 END,
        ic.updated_at DESC
      LIMIT 1
    `;
    if (!row) return null;

    const { credentials_encrypted, credentials_decrypted, ...rest } = row;
    return {
      ...rest,
      credentials: JSON.parse(credentials_decrypted as string),
    } as DecryptedConnection;
  },

  /**
   * Get all effective connections for a scope (workspace + project + user)
   */
  async getEffective(workspaceId: string, projectId?: string, userId?: string): Promise<IntegrationConnection[]> {
    // Returns connections that apply: workspace-scope + project-scope (if projectId) + user-scope (if userId)
    const rows = await sql`
      SELECT * FROM integration_connections
      WHERE workspace_id = ${workspaceId}
        AND status = 'active'
        AND (
          scope = 'workspace'
          ${projectId ? sql`OR (scope = 'project' AND project_id = ${projectId})` : sql``}
          ${userId ? sql`OR (scope = 'user' AND user_id = ${userId})` : sql``}
        )
      ORDER BY integration_id, scope DESC
    `;
    return rows as unknown as IntegrationConnection[];
  },

  /**
   * Update credentials (re-encrypt)
   */
  async update(connectionId: string, credentials: unknown): Promise<void> {
    const credJson = JSON.stringify(credentials);
    await sql`
      UPDATE integration_connections
      SET credentials_encrypted = pgp_sym_encrypt(${credJson}, ${ENCRYPTION_KEY}),
          updated_at = now()
      WHERE id = ${connectionId}
    `;
  },

  /**
   * Update connection status
   */
  async updateStatus(connectionId: string, status: string, errorMessage?: string): Promise<void> {
    await sql`
      UPDATE integration_connections
      SET status = ${status},
          error_message = ${errorMessage ?? null},
          updated_at = now()
      WHERE id = ${connectionId}
    `;
  },

  /**
   * Delete a connection
   */
  async delete(connectionId: string): Promise<void> {
    await sql`DELETE FROM integration_connections WHERE id = ${connectionId}`;
  },

  /**
   * Decrypt raw credentials
   */
  async decrypt(connectionId: string): Promise<unknown> {
    const [row] = await sql`
      SELECT pgp_sym_decrypt(credentials_encrypted, ${ENCRYPTION_KEY}) as decrypted
      FROM integration_connections
      WHERE id = ${connectionId}
    `;
    if (!row) return null;
    return JSON.parse(row.decrypted as string);
  },

  /**
   * List connections for a user in a workspace
   */
  async listForUser(workspaceId: string, userId: string): Promise<IntegrationConnection[]> {
    const rows = await sql`
      SELECT * FROM integration_connections
      WHERE workspace_id = ${workspaceId}
        AND (user_id = ${userId} OR scope = 'workspace')
      ORDER BY integration_id, created_at DESC
    `;
    return rows as unknown as IntegrationConnection[];
  },
};

// ─── OAuth App Helpers ────────────────────────────────────

export const oauthApps = {
  async get(integrationId: string, workspaceId?: string): Promise<DecryptedOAuthApp | null> {
    // Resolution order: workspace-specific -> global -> env vars
    let row: any = null;

    if (workspaceId) {
      [row] = await sql`
        SELECT oa.*,
               pgp_sym_decrypt(oa.client_secret_encrypted, ${ENCRYPTION_KEY}) as client_secret_decrypted
        FROM oauth_apps oa
        WHERE oa.integration_id = ${integrationId}
          AND oa.workspace_id = ${workspaceId}
        LIMIT 1
      `;
    }

    if (!row) {
      [row] = await sql`
        SELECT oa.*,
               pgp_sym_decrypt(oa.client_secret_encrypted, ${ENCRYPTION_KEY}) as client_secret_decrypted
        FROM oauth_apps oa
        WHERE oa.integration_id = ${integrationId}
          AND oa.is_global = true
        LIMIT 1
      `;
    }

    if (!row) {
      // Fall back to env vars: OAUTH_{INTEGRATION_ID}_CLIENT_ID / OAUTH_{INTEGRATION_ID}_CLIENT_SECRET
      const envKey = integrationId.toUpperCase().replace(/-/g, "_");
      const clientId = process.env[`OAUTH_${envKey}_CLIENT_ID`];
      const clientSecret = process.env[`OAUTH_${envKey}_CLIENT_SECRET`];
      if (clientId && clientSecret) {
        return {
          id: `env-${integrationId}`,
          integration_id: integrationId,
          client_id: clientId,
          clientSecret,
          extra_config: {},
          is_global: true,
          created_at: new Date(),
          updated_at: new Date(),
        } as DecryptedOAuthApp;
      }
      return null;
    }

    const { client_secret_encrypted, client_secret_decrypted, ...rest } = row;
    return {
      ...rest,
      clientSecret: client_secret_decrypted,
    } as DecryptedOAuthApp;
  },

  async create(params: {
    workspaceId?: string;
    integrationId: string;
    clientId: string;
    clientSecret: string;
    extraConfig?: Record<string, unknown>;
    isGlobal?: boolean;
  }): Promise<OAuthApp> {
    const [row] = await sql`
      INSERT INTO oauth_apps (
        workspace_id, integration_id, client_id, client_secret_encrypted,
        extra_config, is_global
      ) VALUES (
        ${params.workspaceId ?? null}, ${params.integrationId},
        ${params.clientId},
        pgp_sym_encrypt(${params.clientSecret}, ${ENCRYPTION_KEY}),
        ${JSON.stringify(params.extraConfig ?? {})},
        ${params.isGlobal ?? false}
      )
      RETURNING *
    `;
    return row as OAuthApp;
  },

  async list(workspaceId?: string): Promise<OAuthApp[]> {
    if (workspaceId) {
      const rows = await sql`
        SELECT * FROM oauth_apps
        WHERE workspace_id = ${workspaceId} OR is_global = true
        ORDER BY integration_id
      `;
      return rows as unknown as OAuthApp[];
    }
    const rows = await sql`SELECT * FROM oauth_apps ORDER BY integration_id`;
    return rows as unknown as OAuthApp[];
  },

  async delete(id: string): Promise<void> {
    await sql`DELETE FROM oauth_apps WHERE id = ${id}`;
  },
};
