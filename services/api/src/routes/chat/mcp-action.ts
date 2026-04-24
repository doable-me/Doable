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
import { writeFile as fsWriteFile, mkdir as fsMkdir } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "../../db/index.js";
import { projectQueries, workspaceQueries, connectorQueries } from "@doable/db";
import { getConnectorManager } from "../../mcp/connector-manager.js";
import { getProjectPath } from "../../ai/project-files.js";
import { buildPptx } from "../../integrations/presentation/pptx-builder.js";
import type { AuthEnv } from "../../middleware/auth.js";

const mcpActionSchema = z.object({
  toolCallId: z.string().min(1).max(200),
  connectorId: z.string().min(1).max(200),
  action: z.string().min(1).max(100),
  payload: z.record(z.unknown()).optional(),
});

/**
 * When the presentation-builder picker resolves to PPTX, we bypass the MCP
 * server entirely and build the .pptx in-process. The MCP server's PPTX path
 * only ever returned skill instructions for the LLM to write a script — that
 * "DIY" detour produced no download link in chat. Building server-side gives
 * the user a real binary they can click.
 */
async function maybeBuildPptxLocally(
  payload: Record<string, unknown> | undefined,
  projectId: string,
): Promise<{ downloadWidget: Record<string, unknown> } | null> {
  if (!payload) return null;
  if (payload.selected !== "pptx") return null;

  const state = (payload.state ?? {}) as Record<string, unknown>;
  const topic = String(state.topic ?? payload.topic ?? "").trim();
  if (!topic) return null;

  const slideCount = state.slideCount ?? payload.slideCount;
  const audience = state.audience ? String(state.audience) : undefined;
  const tone = state.tone ? String(state.tone) : undefined;

  const built = await buildPptx({
    topic,
    slideCount: typeof slideCount === "number" ? slideCount : undefined,
    audience,
    tone,
  });

  // Save under the project root so the standard download endpoint can serve it.
  const projectPath = getProjectPath(projectId);
  await fsMkdir(projectPath, { recursive: true });
  const outPath = join(projectPath, built.fileName);
  await fsWriteFile(outPath, built.buffer);

  console.log(
    `[MCP Action] PPTX built locally projectId=${projectId.slice(0, 8)} ` +
      `file=${built.fileName} bytes=${built.buffer.length} slides=${built.slideCount}`,
  );

  return {
    downloadWidget: {
      uiType: "download",
      title: "Your presentation is ready",
      schema: {
        fileName: built.fileName,
        url: `/projects/${projectId}/download/${encodeURIComponent(built.fileName)}`,
        sizeBytes: built.buffer.length,
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        message: `${built.slideCount} slides on "${topic}"`,
      },
      state: {},
    },
  };
}

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
        // 4a — Special case: PPTX picker click. Build server-side and skip MCP.
        // The MCP server's PPTX path returned skill-content for the LLM to write
        // a Node script — that produced no download link in chat. Building here
        // gives a real binary the user can click.
        if (action !== "cancel") {
          try {
            const local = await maybeBuildPptxLocally(payload, projectId);
            if (local) {
              return c.json({
                success: true,
                state: { selected: "pptx", done: true },
                downloadWidget: local.downloadWidget,
              });
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[MCP Action] Local PPTX build failed: ${msg}`);
            return c.json(
              { success: false, error: `PPTX generation failed: ${msg}` },
              500,
            );
          }
        }

        const manager = getConnectorManager();
        const client = await manager.getClient(config);

        const result = await client.callTool("ui_action", {
          toolCallId,
          action,
          payload: payload ?? {},
        });

        if (result.isError) {
          const errorText = result.content
            .filter((c) => c.type === "text")
            .map((c) => (c as { type: "text"; text: string }).text)
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
