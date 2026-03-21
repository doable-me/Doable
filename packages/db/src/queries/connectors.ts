import type postgres from "postgres";

// ─── Row Types ────────────────────────────────────────────

export interface McpConnectorRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  created_by: string;
  scope: "workspace" | "project" | "user";
  name: string;
  description: string | null;
  transport_type: "streamable_http" | "http_sse" | "stdio";
  server_url: string | null;
  server_command: string | null;
  server_args: string[];
  auth_type: "none" | "api_key" | "oauth2" | "bearer_token";
  status: string;
  capabilities_cache: Record<string, unknown> | null;
  last_connected_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface McpToolOverrideRow {
  id: string;
  connector_id: string;
  tool_name: string;
  enabled: boolean;
  workspace_id: string;
  project_id: string | null;
  user_id: string | null;
  created_at: Date;
}

// ─── Queries ──────────────────────────────────────────────

export function connectorQueries(sql: postgres.Sql) {
  return {
    /** List connectors for a workspace, optionally filtered by scope/project */
    async listConnectors(
      workspaceId: string,
      opts?: { scope?: string; projectId?: string },
    ): Promise<McpConnectorRow[]> {
      if (opts?.scope && opts?.projectId) {
        return sql<McpConnectorRow[]>`
          SELECT * FROM mcp_connectors
          WHERE workspace_id = ${workspaceId}
            AND scope = ${opts.scope}
            AND (project_id IS NULL OR project_id = ${opts.projectId})
          ORDER BY name
        `;
      }
      if (opts?.projectId) {
        return sql<McpConnectorRow[]>`
          SELECT * FROM mcp_connectors
          WHERE workspace_id = ${workspaceId}
            AND (project_id IS NULL OR project_id = ${opts.projectId})
          ORDER BY scope, name
        `;
      }
      return sql<McpConnectorRow[]>`
        SELECT * FROM mcp_connectors
        WHERE workspace_id = ${workspaceId}
        ORDER BY scope, name
      `;
    },

    /** Get a single connector by ID */
    async getConnector(id: string): Promise<McpConnectorRow | null> {
      const [row] = await sql<McpConnectorRow[]>`
        SELECT * FROM mcp_connectors WHERE id = ${id}
      `;
      return row ?? null;
    },

    /** Create a new MCP connector */
    async createConnector(params: {
      workspaceId: string;
      createdBy: string;
      scope: string;
      name: string;
      description?: string;
      transportType: string;
      serverUrl?: string;
      serverCommand?: string;
      serverArgs?: string[];
      authType?: string;
      projectId?: string;
    }): Promise<McpConnectorRow> {
      const [row] = await sql<McpConnectorRow[]>`
        INSERT INTO mcp_connectors (
          workspace_id, created_by, scope, name, description,
          transport_type, server_url, server_command, server_args,
          auth_type, project_id
        ) VALUES (
          ${params.workspaceId}, ${params.createdBy}, ${params.scope},
          ${params.name}, ${params.description ?? null},
          ${params.transportType}, ${params.serverUrl ?? null},
          ${params.serverCommand ?? null}, ${JSON.stringify(params.serverArgs ?? [])},
          ${params.authType ?? "none"}, ${params.projectId ?? null}
        )
        RETURNING *
      `;
      return row!;
    },

    /** Update a connector */
    async updateConnector(
      id: string,
      updates: {
        name?: string;
        description?: string;
        serverUrl?: string;
        serverCommand?: string;
        serverArgs?: string[];
        authType?: string;
        status?: string;
        capabilitiesCache?: Record<string, unknown>;
        lastConnectedAt?: Date;
        errorMessage?: string | null;
      },
    ): Promise<McpConnectorRow | null> {
      // Build dynamic update — only set provided fields
      const sets: string[] = [];
      const vals: unknown[] = [];

      if (updates.name !== undefined) { sets.push("name"); vals.push(updates.name); }
      if (updates.description !== undefined) { sets.push("description"); vals.push(updates.description); }
      if (updates.serverUrl !== undefined) { sets.push("server_url"); vals.push(updates.serverUrl); }
      if (updates.serverCommand !== undefined) { sets.push("server_command"); vals.push(updates.serverCommand); }
      if (updates.serverArgs !== undefined) { sets.push("server_args"); vals.push(JSON.stringify(updates.serverArgs)); }
      if (updates.authType !== undefined) { sets.push("auth_type"); vals.push(updates.authType); }
      if (updates.status !== undefined) { sets.push("status"); vals.push(updates.status); }
      if (updates.errorMessage !== undefined) { sets.push("error_message"); vals.push(updates.errorMessage); }
      if (updates.lastConnectedAt !== undefined) { sets.push("last_connected_at"); vals.push(updates.lastConnectedAt); }
      if (updates.capabilitiesCache !== undefined) { sets.push("capabilities_cache"); vals.push(JSON.stringify(updates.capabilitiesCache)); }

      if (sets.length === 0) return this.getConnector(id);

      // Use a simple update with all fields
      const [row] = await sql<McpConnectorRow[]>`
        UPDATE mcp_connectors SET
          name = COALESCE(${updates.name ?? null}, name),
          description = COALESCE(${updates.description ?? null}, description),
          server_url = COALESCE(${updates.serverUrl ?? null}, server_url),
          server_command = COALESCE(${updates.serverCommand ?? null}, server_command),
          status = COALESCE(${updates.status ?? null}, status),
          error_message = ${updates.errorMessage !== undefined ? updates.errorMessage : null},
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      return row ?? null;
    },

    /** Delete a connector */
    async deleteConnector(id: string): Promise<boolean> {
      const result = await sql`DELETE FROM mcp_connectors WHERE id = ${id}`;
      return result.count > 0;
    },

    /**
     * Get effective connectors for a given scope context.
     * Returns workspace + project + user connectors, merged.
     */
    async getEffectiveConnectors(
      workspaceId: string,
      projectId?: string,
      userId?: string,
    ): Promise<McpConnectorRow[]> {
      return sql<McpConnectorRow[]>`
        SELECT * FROM mcp_connectors
        WHERE workspace_id = ${workspaceId}
          AND status = 'active'
          AND (
            scope = 'workspace'
            OR (scope = 'project' AND project_id = ${projectId ?? null})
            OR (scope = 'user' AND created_by = ${userId ?? null})
          )
        ORDER BY scope, name
      `;
    },

    /** Update connector status after a test/connection attempt */
    async updateConnectorStatus(
      id: string,
      status: string,
      opts?: { errorMessage?: string; capabilities?: Record<string, unknown> },
    ): Promise<void> {
      await sql`
        UPDATE mcp_connectors SET
          status = ${status},
          error_message = ${opts?.errorMessage ?? null},
          capabilities_cache = ${opts?.capabilities ? JSON.stringify(opts.capabilities) : null},
          last_connected_at = CASE WHEN ${status} = 'active' THEN now() ELSE last_connected_at END,
          updated_at = now()
        WHERE id = ${id}
      `;
    },
  };
}
