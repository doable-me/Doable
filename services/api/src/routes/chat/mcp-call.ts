/**
 * POST /projects/:id/chat/mcp-call
 *
 * Generic, standards-compliant proxy of MCP `tools/call`. Used by sandboxed
 * MCP App iframes (mcp-ui / MCP Apps spec) to invoke any tool on a connector.
 * The host adds NO routing or special-casing per tool — it just verifies
 * project + workspace + connector access and forwards the call.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../../db/index.js";
import { projectQueries, workspaceQueries, connectorQueries } from "@doable/db";
import { getConnectorManager } from "../../mcp/connector-manager.js";
import type { AuthEnv } from "../../middleware/auth.js";

const mcpCallSchema = z.object({
  connectorId: z.string().min(1).max(200),
  toolName: z.string().min(1).max(200),
  params: z.record(z.unknown()).optional(),
});

export function registerMcpCallRoute(app: Hono<AuthEnv>) {
  app.post(
    "/projects/:id/chat/mcp-call",
    zValidator("json", mcpCallSchema),
    async (c) => {
      const projectId = c.req.param("id");
      const userId = c.get("userId")!;
      const { connectorId, toolName, params } = c.req.valid("json");

      const project = await projectQueries(sql).findById(projectId);
      if (!project) return c.json({ error: "Project not found" }, 404);

      const role = await workspaceQueries(sql).getMemberRole(project.workspace_id, userId);
      if (!role) {
        const [collab] = await sql<{ role: string }[]>`
          SELECT role FROM project_collaborators
          WHERE project_id = ${projectId} AND user_id = ${userId}
        `;
        if (!collab) {
          const [adminCheck] = await sql<{ is_platform_admin: boolean }[]>`
            SELECT is_platform_admin FROM users WHERE id = ${userId}
          `;
          if (!adminCheck?.is_platform_admin) return c.json({ error: "Access denied" }, 403);
        }
      }

      const connectors = connectorQueries(sql);
      const connector = await connectors.getConnector(connectorId);
      if (!connector) return c.json({ error: "Connector not found" }, 404);
      if (connector.workspace_id !== project.workspace_id) {
        return c.json({ error: "Connector does not belong to this workspace" }, 403);
      }

      const config = {
        id: connector.id,
        workspaceId: connector.workspace_id,
        projectId: connector.project_id ?? undefined,
        scope: connector.scope as "workspace" | "project" | "user",
        name: connector.name,
        description: connector.description ?? undefined,
        transportType: connector.transport_type as "streamable_http" | "http_sse" | "stdio",
        serverUrl: connector.server_url ?? undefined,
        serverCommand: connector.server_command ?? undefined,
        serverArgs: connector.server_args ?? undefined,
        authType: (connector.auth_type ?? "none") as "none" | "api_key" | "oauth2" | "bearer_token",
        status: connector.status as "active" | "inactive" | "error" | "connecting",
        createdBy: connector.created_by,
        createdAt: new Date(connector.created_at),
        updatedAt: new Date(connector.updated_at),
      };

      if (config.status !== "active") {
        return c.json({ error: "Connector is not active" }, 400);
      }

      try {
        const manager = getConnectorManager();
        const client = await manager.getClient(config);
        const result = await client.callTool(toolName, params ?? {});
        if (result.isError) {
          const text = result.content
            .filter((it) => it.type === "text")
            .map((it) => (it as { type: "text"; text: string }).text)
            .join("\n");
          return c.json({ success: false, error: text || "Tool error", content: result.content });
        }
        return c.json({ success: true, content: result.content });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[MCP Call] ${connectorId}/${toolName} failed:`, msg);
        return c.json({ success: false, error: msg }, 500);
      }
    },
  );

  // GET /projects/:id/chat/mcp-tools — list available MCP tools for the project
  // Returns connector IDs, names, and their tools so the frontend MCP bridge
  // can resolve AI-prefixed tool names (mcp_connector_name_tool_name) back to
  // the real connectorId + toolName.
  app.get(
    "/projects/:id/chat/mcp-tools",
    async (c) => {
      const projectId = c.req.param("id");
      const userId = c.get("userId")!;

      const project = await projectQueries(sql).findById(projectId);
      if (!project) return c.json({ data: [] });

      const role = await workspaceQueries(sql).getMemberRole(project.workspace_id, userId);
      if (!role) {
        const [collab] = await sql<{ role: string }[]>`
          SELECT role FROM project_collaborators
          WHERE project_id = ${projectId} AND user_id = ${userId}
        `;
        if (!collab) {
          const [adminCheck] = await sql<{ is_platform_admin: boolean }[]>`
            SELECT is_platform_admin FROM users WHERE id = ${userId}
          `;
          if (!adminCheck?.is_platform_admin) return c.json({ data: [] });
        }
      }

      // Get all active connectors for this workspace
      const connectors = connectorQueries(sql);
      const rows = await connectors.listConnectors(project.workspace_id);
      const activeRows = rows.filter((r) => r.status === "active");

      const data = activeRows.map((row) => {
        const cache = row.capabilities_cache as { tools?: { list?: Array<{ name: string; description?: string }> } } | null;
        return {
          connectorId: row.id,
          connectorName: row.name,
          tools: cache?.tools?.list ?? [],
        };
      });

      return c.json({ data });
    },
  );
}
