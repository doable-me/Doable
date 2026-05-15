import { sql } from "../db/index.js";
import type { IntegrationConnection, DecryptedConnection, OAuthApp, DecryptedOAuthApp, AuthType } from "./types.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";
import { encryptForWorkspace, decryptForWorkspace } from "../lib/envelope-crypto.js";

// ─── Envelope rollout flag ─────────────────────────────────
// When DOABLE_ENVELOPE_ENCRYPTION=1, new writes use per-workspace DEK envelope
// encryption (envelope_v1). Reads always auto-detect via credentials_format so
// legacy rows keep working regardless of the flag.
function useEnvelope(): boolean {
  return process.env.DOABLE_ENVELOPE_ENCRYPTION === "1";
}

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

    if (useEnvelope()) {
      const blob = await encryptForWorkspace(params.workspaceId, credJson);
      const [row] = await sql`
        INSERT INTO integration_connections (
          workspace_id, user_id, integration_id, scope, project_id,
          auth_type, credentials_encrypted, credentials_format,
          display_name, metadata, status
        ) VALUES (
          ${params.workspaceId}, ${params.userId}, ${params.integrationId},
          ${params.scope}, ${params.projectId ?? null},
          ${params.authType},
          decode(${blob}, 'base64'),
          'envelope_v1',
          ${params.displayName ?? null},
          ${JSON.stringify(params.metadata ?? {})},
          'active'
        )
        RETURNING id, workspace_id, user_id, integration_id, scope, project_id,
                  auth_type, credentials_encrypted, credentials_format,
                  display_name, status, error_message, metadata,
                  created_at, updated_at
      `;
      return row as IntegrationConnection;
    }

    const [row] = await sql`
      INSERT INTO integration_connections (
        workspace_id, user_id, integration_id, scope, project_id,
        auth_type, credentials_encrypted, credentials_format,
        display_name, metadata, status
      ) VALUES (
        ${params.workspaceId}, ${params.userId}, ${params.integrationId},
        ${params.scope}, ${params.projectId ?? null},
        ${params.authType},
        pgp_sym_encrypt(${credJson}, ${ENCRYPTION_KEY}),
        'pgp_sym',
        ${params.displayName ?? null},
        ${JSON.stringify(params.metadata ?? {})},
        'active'
      )
      RETURNING id, workspace_id, user_id, integration_id, scope, project_id,
                auth_type, credentials_encrypted, credentials_format,
                display_name, status, error_message, metadata,
                created_at, updated_at
    `;
    return row as IntegrationConnection;
  },

  /**
   * Get and decrypt credentials for an integration
   */
  async get(userId: string, integrationId: string, workspaceId: string, projectId?: string): Promise<DecryptedConnection | null> {
    const [row] = await sql`
      SELECT ic.*,
             CASE
               WHEN ic.credentials_format = 'envelope_v1'
                 THEN encode(ic.credentials_encrypted, 'base64')
               ELSE pgp_sym_decrypt(ic.credentials_encrypted, ${ENCRYPTION_KEY})
             END as credentials_decrypted
      FROM integration_connections ic
      WHERE ic.integration_id = ${integrationId}
        AND ic.workspace_id = ${workspaceId}
        AND ic.status = 'active'
        AND (
          ic.user_id = ${userId}
          OR ic.scope = 'workspace'
          ${projectId ? sql`OR (ic.scope = 'project' AND ic.project_id = ${projectId})` : sql``}
        )
      ORDER BY
        CASE WHEN ic.user_id = ${userId} THEN 0
             WHEN ic.scope = 'project' THEN 1
             ELSE 2 END,
        ic.updated_at DESC
      LIMIT 1
    `;
    if (!row) return null;

    const { credentials_encrypted, credentials_decrypted, ...rest } = row;
    const format = (rest.credentials_format ?? "pgp_sym") as "pgp_sym" | "envelope_v1";

    let credJson: string;
    if (format === "envelope_v1") {
      const plaintext = await decryptForWorkspace(workspaceId, credentials_decrypted as string);
      credJson = plaintext.toString("utf8");
    } else {
      credJson = credentials_decrypted as string;
    }

    return {
      ...rest,
      credentials: JSON.parse(credJson),
    } as DecryptedConnection;
  },

  /**
   * Get all effective connections for a scope (workspace + project + user)
   */
  async getEffective(workspaceId: string, projectId?: string, userId?: string): Promise<IntegrationConnection[]> {
    // Returns connections that apply: workspace-scope + project-scope (if projectId) + user-scope (if userId)
    // Order: integration_id groups → scope DESC (project > user > workspace) → updated_at DESC
    // so the vault-bridge dedup picks the most recently updated connection per integration.
    const rows = await sql`
      SELECT * FROM integration_connections
      WHERE workspace_id = ${workspaceId}
        AND status = 'active'
        AND (
          scope = 'workspace'
          ${projectId ? sql`OR (scope = 'project' AND project_id = ${projectId})` : sql``}
          ${userId ? sql`OR (scope = 'user' AND user_id = ${userId})` : sql``}
        )
      ORDER BY integration_id, scope DESC, updated_at DESC
    `;
    return rows as unknown as IntegrationConnection[];
  },

  /**
   * Update credentials (re-encrypt)
   */
  async update(connectionId: string, credentials: unknown): Promise<void> {
    const credJson = JSON.stringify(credentials);

    if (useEnvelope()) {
      // Need the workspace_id to derive the DEK.
      const [conn] = await sql<{ workspace_id: string }[]>`
        SELECT workspace_id FROM integration_connections WHERE id = ${connectionId}
      `;
      if (!conn) return;
      const blob = await encryptForWorkspace(conn.workspace_id, credJson);
      await sql`
        UPDATE integration_connections
        SET credentials_encrypted = decode(${blob}, 'base64'),
            credentials_format = 'envelope_v1',
            updated_at = now()
        WHERE id = ${connectionId}
      `;
      return;
    }

    await sql`
      UPDATE integration_connections
      SET credentials_encrypted = pgp_sym_encrypt(${credJson}, ${ENCRYPTION_KEY}),
          credentials_format = 'pgp_sym',
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
      SELECT workspace_id,
             credentials_format,
             CASE
               WHEN credentials_format = 'envelope_v1'
                 THEN encode(credentials_encrypted, 'base64')
               ELSE pgp_sym_decrypt(credentials_encrypted, ${ENCRYPTION_KEY})
             END as decrypted
      FROM integration_connections
      WHERE id = ${connectionId}
    `;
    if (!row) return null;

    const format = (row.credentials_format ?? "pgp_sym") as "pgp_sym" | "envelope_v1";
    if (format === "envelope_v1") {
      const plaintext = await decryptForWorkspace(row.workspace_id as string, row.decrypted as string);
      return JSON.parse(plaintext.toString("utf8"));
    }
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

  /**
   * Operator-triggered re-encryption: walks all pgp_sym rows in a workspace,
   * decrypts with the legacy key, re-encrypts with envelope_v1, and rewrites
   * the row in place. Idempotent — already-envelope rows are skipped.
   *
   * NOT auto-run. Call from an admin endpoint / CLI once envelope rollout is
   * green and you're ready to retire the legacy ENCRYPTION_KEY for that
   * workspace's data.
   */
  async rewrapAllToEnvelope(workspaceId: string): Promise<{ migrated: number; failed: number }> {
    const rows = await sql<Array<{ id: string; decrypted: string }>>`
      SELECT id,
             pgp_sym_decrypt(credentials_encrypted, ${ENCRYPTION_KEY}) as decrypted
      FROM integration_connections
      WHERE workspace_id = ${workspaceId}
        AND credentials_format = 'pgp_sym'
    `;

    let migrated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const blob = await encryptForWorkspace(workspaceId, row.decrypted);
        await sql`
          UPDATE integration_connections
          SET credentials_encrypted = decode(${blob}, 'base64'),
              credentials_format = 'envelope_v1',
              updated_at = now()
          WHERE id = ${row.id}
        `;
        migrated++;
      } catch {
        failed++;
      }
    }

    return { migrated, failed };
  },
};

// ─── Platform Integration Credentials ────────────────────
// Non-OAuth platform-scope credentials (secret_text, basic_auth, custom_auth).
// OAuth credentials remain in oauth_apps. This object handles everything else
// at the platform (global) level — no workspace_id involved.
//
// TODO: When envelope_v1 gains a platform-scope key path (a KEK-derived DEK
// not tied to any workspace), migrate writes here to envelope_v1. For now
// pgp_sym is used because envelope encryption requires a workspace_id.

export type PlatformCredentialAuthType = "secret_text" | "basic_auth" | "custom_auth";

export interface PlatformCredentialRow {
  id: string;
  integrationId: string;
  authType: PlatformCredentialAuthType;
  displayHint: string | null;
  updatedAt: Date;
}

export interface PlatformCredentialDecrypted extends PlatformCredentialRow {
  credentials: unknown;
}

export const platformCredentials = {
  /**
   * Retrieve and decrypt credentials for a single integration.
   * Returns null if no row exists.
   * NEVER expose the returned credentials in HTTP responses.
   */
  async get(integrationId: string): Promise<PlatformCredentialDecrypted | null> {
    const [row] = await sql`
      SELECT id, integration_id, auth_type, display_hint, updated_at,
             pgp_sym_decrypt(credentials_encrypted, ${ENCRYPTION_KEY}) AS credentials_json
      FROM platform_integration_credentials
      WHERE integration_id = ${integrationId}
    `;
    if (!row) return null;
    return {
      id: row.id as string,
      integrationId: row.integration_id as string,
      authType: row.auth_type as PlatformCredentialAuthType,
      displayHint: (row.display_hint ?? null) as string | null,
      updatedAt: row.updated_at as Date,
      credentials: JSON.parse(row.credentials_json as string),
    };
  },

  /**
   * List all platform credentials — metadata only, no secrets.
   */
  async list(): Promise<PlatformCredentialRow[]> {
    const rows = await sql`
      SELECT id, integration_id, auth_type, display_hint, updated_at
      FROM platform_integration_credentials
      ORDER BY integration_id
    `;
    return rows.map((r) => ({
      id: r.id as string,
      integrationId: r.integration_id as string,
      authType: r.auth_type as PlatformCredentialAuthType,
      displayHint: (r.display_hint ?? null) as string | null,
      updatedAt: r.updated_at as Date,
    }));
  },

  /**
   * Insert or update credentials for an integration.
   * Encrypts with pgp_sym (same as oauthApps.create fallback path).
   */
  async upsert(params: {
    integrationId: string;
    authType: PlatformCredentialAuthType;
    credentials: unknown;
    displayHint?: string;
    actorUserId: string;
  }): Promise<{ id: string; updatedAt: Date }> {
    const credJson = JSON.stringify(params.credentials);
    const rows = await sql`
      INSERT INTO platform_integration_credentials
        (integration_id, auth_type, credentials_encrypted, credentials_format, display_hint, created_by)
      VALUES
        (${params.integrationId},
         ${params.authType},
         pgp_sym_encrypt(${credJson}, ${ENCRYPTION_KEY}),
         'pgp_sym',
         ${params.displayHint ?? null},
         ${params.actorUserId}::uuid)
      ON CONFLICT (integration_id) DO UPDATE SET
        auth_type             = EXCLUDED.auth_type,
        credentials_encrypted = EXCLUDED.credentials_encrypted,
        credentials_format    = EXCLUDED.credentials_format,
        display_hint          = EXCLUDED.display_hint,
        updated_at            = now()
      RETURNING id, updated_at
    `;
    const row = rows[0] as { id: string; updated_at: Date };
    return { id: row.id, updatedAt: row.updated_at };
  },

  /**
   * Delete credentials for an integration.
   * Returns true if a row was deleted, false if it didn't exist.
   */
  async delete(integrationId: string): Promise<boolean> {
    const rows = await sql`
      DELETE FROM platform_integration_credentials
      WHERE integration_id = ${integrationId}
      RETURNING id
    `;
    return rows.length > 0;
  },
};

// ─── OAuth App Helpers ────────────────────────────────────

export const oauthApps = {
  async get(integrationId: string, workspaceId?: string): Promise<DecryptedOAuthApp | null> {
    // Resolution order: workspace-specific -> global -> env vars
    //
    // Auto-detects credentials_format on read: envelope_v1 rows get the
    // base64 blob piped through decryptForWorkspace; pgp_sym rows use the
    // legacy ENCRYPTION_KEY path. Global rows (is_global=true, workspace_id
    // null) are always pgp_sym — envelope requires a workspaceId to derive a
    // DEK, so global apps cannot be envelope-encrypted.
    let row: any = null;

    if (workspaceId) {
      [row] = await sql`
        SELECT oa.*,
               CASE
                 WHEN oa.credentials_format = 'envelope_v1'
                   THEN encode(oa.client_secret_encrypted, 'base64')
                 ELSE pgp_sym_decrypt(oa.client_secret_encrypted, ${ENCRYPTION_KEY})
               END as client_secret_decrypted
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
    const format = (rest.credentials_format ?? "pgp_sym") as "pgp_sym" | "envelope_v1";

    let clientSecret: string;
    if (format === "envelope_v1" && rest.workspace_id) {
      const plaintext = await decryptForWorkspace(
        rest.workspace_id as string,
        client_secret_decrypted as string,
      );
      clientSecret = plaintext.toString("utf8");
    } else {
      clientSecret = client_secret_decrypted as string;
    }

    return {
      ...rest,
      clientSecret,
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
    // Envelope requires a workspaceId to derive the DEK. Global apps
    // (is_global=true, workspace_id null) always use the legacy pgp_sym path.
    if (useEnvelope() && params.workspaceId && !params.isGlobal) {
      const blob = await encryptForWorkspace(params.workspaceId, params.clientSecret);
      const [row] = await sql`
        INSERT INTO oauth_apps (
          workspace_id, integration_id, client_id, client_secret_encrypted,
          credentials_format, extra_config, is_global
        ) VALUES (
          ${params.workspaceId}, ${params.integrationId},
          ${params.clientId},
          decode(${blob}, 'base64'),
          'envelope_v1',
          ${JSON.stringify(params.extraConfig ?? {})},
          ${params.isGlobal ?? false}
        )
        RETURNING *
      `;
      return row as OAuthApp;
    }

    const [row] = await sql`
      INSERT INTO oauth_apps (
        workspace_id, integration_id, client_id, client_secret_encrypted,
        credentials_format, extra_config, is_global
      ) VALUES (
        ${params.workspaceId ?? null}, ${params.integrationId},
        ${params.clientId},
        pgp_sym_encrypt(${params.clientSecret}, ${ENCRYPTION_KEY}),
        'pgp_sym',
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
