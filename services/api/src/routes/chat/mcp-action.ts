/**
 * POST /projects/:id/chat/mcp-action
 *
 * Receives a UI action from an MCP widget in the chat thread,
 * validates ownership, forwards it to the originating MCP connector,
 * and returns the result.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../../db/index.js";
import { projectQueries, workspaceQueries, connectorQueries } from "@doable/db";
import { getConnectorManager } from "../../mcp/connector-manager.js";
import type { AuthEnv } from "../../middleware/auth.js";

const mcpActionSchema = z.object({
  toolCallId: z.string().min(1).max(200),
  connectorId: z.string().min(1).max(200),
  action: z.string().min(1).max(100),
  payload: z.record(z.unknown()).optional(),
});

export function registerMcpActionRoute(app: Hono<AuthEnv>) {
  app.post(
    "/projects/:id/chat/mcp-action",
    zValidator("json", mcpActionSchema),
    async (c) => {
      const projectId = c.req.param("id");
      const userId = c.get("userId")!;
      const { toolCallId, connectorId, action, payload } = c.req.valid("json");

      // 1 — Verify project access
      const project = await projectQueries(sql).findById(projectId);
      if (!project) return c.json({ error: "Project not found" }, 404);

      const role = await workspaceQueries(sql).getMemberRole(project.workspace_id, userId);
      if (!role) {
        const [collab] = await sql<{ role: string }[]>`
          SELECT role FROM project_collaborators
          WHERE project_id = ${projectId} AND user_id = ${userId}
        `;
        if (!collab) return c.json({ error: "Access denied" }, 403);
      }

      // 2 — Verify connector belongs to this workspace (scope check)
      const connectors = connectorQueries(sql);
      const connector = await connectors.getConnector(connectorId);
      if (!connector) return c.json({ error: "Connector not found" }, 404);
      if (connector.workspace_id !== project.workspace_id) {
        return c.json({ error: "Connector does not belong to this workspace" }, 403);
      }

      // 3 — Build a McpConnectorConfig from the DB row
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

      // 4 — Forward the action to the MCP server as a tool call
      try {
        const manager = getConnectorManager();
        const client = await manager.getClient(config);

        const result = await client.callTool("ui_action", {
          toolCallId,
          action,
          payload: payload ?? {},
        });

        if (result.isError) {
          const errorText = result.content
            .filter((it) => it.type === "text")
            .map((it) => (it as { type: "text"; text: string }).text)
            .join("\n");
          return c.json({ success: false, error: errorText });
        }

        // Extract updated state (JSON envelope) AND any plain text content.
        // The plain text typically contains skill/instruction content that the
        // LLM needs to continue generating the artifact, so we forward it.
        let updatedState: Record<string, unknown> | undefined;
        const textParts: string[] = [];
        for (const item of result.content) {
          if (item.type !== "text") continue;
          const text = (item as { type: "text"; text: string }).text;
          try {
            const parsed = JSON.parse(text);
            if (parsed?.__ui_update?.state) {
              updatedState = parsed.__ui_update.state;
              continue;
            }
            // JSON but not a ui_update — skip (don't feed raw JSON back to LLM)
          } catch {
            // Plain text — keep it as instructions for the LLM
            textParts.push(text);
          }
        }

        return c.json({
          success: true,
          state: updatedState,
          instructions: textParts.join("\n\n") || undefined,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[MCP Action] Failed for connector ${connectorId}:`, msg);
        return c.json({ success: false, error: msg }, 500);
      }
    },
  );
}
