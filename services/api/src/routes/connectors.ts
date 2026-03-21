import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { connectorQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { getConnectorManager } from "../mcp/connector-manager.js";
import type { McpConnectorConfig } from "../mcp/types.js";

const connectors = connectorQueries(sql);
const workspaces = workspaceQueries(sql);

export const connectorRoutes = new Hono<AuthEnv>();

connectorRoutes.use("*", authMiddleware);

// ─── Role helpers ──────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

/** Convert DB row to McpConnectorConfig for the runtime */
function rowToConfig(row: Awaited<ReturnType<typeof connectors.getConnector>>): McpConnectorConfig {
  return {
    id: row!.id,
    workspaceId: row!.workspace_id,
    projectId: row!.project_id ?? undefined,
    scope: row!.scope,
    name: row!.name,
    description: row!.description ?? undefined,
    transportType: row!.transport_type,
    serverUrl: row!.server_url ?? undefined,
    serverCommand: row!.server_command ?? undefined,
    serverArgs: row!.server_args ?? [],
    authType: row!.auth_type,
    status: row!.status as McpConnectorConfig["status"],
    capabilitiesCache: (row!.capabilities_cache as McpConnectorConfig["capabilitiesCache"]) ?? undefined,
    lastConnectedAt: row!.last_connected_at ?? undefined,
    errorMessage: row!.error_message ?? undefined,
    createdBy: row!.created_by,
    createdAt: row!.created_at,
    updatedAt: row!.updated_at,
  };
}

// ─── Connector CRUD ────────────────────────────────────────

// GET /:workspaceId/connectors
connectorRoutes.get("/:workspaceId/connectors", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const data = await connectors.listConnectors(workspaceId, { projectId });
  return c.json({ data });
});

const createConnectorSchema = z.object({
  scope: z.enum(["workspace", "project", "user"]),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  transportType: z.enum(["streamable_http", "http_sse", "stdio"]),
  serverUrl: z.string().url().optional(),
  serverCommand: z.string().optional(),
  serverArgs: z.array(z.string()).optional(),
  authType: z.enum(["none", "api_key", "oauth2", "bearer_token"]).default("none"),
  projectId: z.string().uuid().optional(),
});

// POST /:workspaceId/connectors
connectorRoutes.post(
  "/:workspaceId/connectors",
  zValidator("json", createConnectorSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    // Validate transport config
    if (body.transportType !== "stdio" && !body.serverUrl) {
      return c.json({ error: "serverUrl is required for HTTP transports" }, 400);
    }
    if (body.transportType === "stdio" && !body.serverCommand) {
      return c.json({ error: "serverCommand is required for stdio transport" }, 400);
    }

    const row = await connectors.createConnector({
      workspaceId,
      createdBy: userId,
      scope: body.scope,
      name: body.name,
      description: body.description,
      transportType: body.transportType,
      serverUrl: body.serverUrl,
      serverCommand: body.serverCommand,
      serverArgs: body.serverArgs,
      authType: body.authType,
      projectId: body.projectId,
    });

    return c.json({ data: row }, 201);
  },
);

// GET /:workspaceId/connectors/:id
connectorRoutes.get("/:workspaceId/connectors/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const connectorId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const row = await connectors.getConnector(connectorId);
  if (!row || row.workspace_id !== workspaceId) {
    return c.json({ error: "Connector not found" }, 404);
  }

  return c.json({ data: row });
});

const updateConnectorSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  serverUrl: z.string().url().optional(),
  serverCommand: z.string().optional(),
  serverArgs: z.array(z.string()).optional(),
  authType: z.enum(["none", "api_key", "oauth2", "bearer_token"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

// PATCH /:workspaceId/connectors/:id
connectorRoutes.patch(
  "/:workspaceId/connectors/:id",
  zValidator("json", updateConnectorSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const connectorId = c.req.param("id");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const existing = await connectors.getConnector(connectorId);
    if (!existing || existing.workspace_id !== workspaceId) {
      return c.json({ error: "Connector not found" }, 404);
    }

    const row = await connectors.updateConnector(connectorId, body);
    return c.json({ data: row });
  },
);

// DELETE /:workspaceId/connectors/:id
connectorRoutes.delete("/:workspaceId/connectors/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const connectorId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  // Disconnect from runtime if connected
  const manager = getConnectorManager();
  await manager.disconnect(connectorId);

  const deleted = await connectors.deleteConnector(connectorId);
  if (!deleted) return c.json({ error: "Connector not found" }, 404);

  return c.json({ data: { id: connectorId, deleted: true } });
});

// ─── Test & Tools ──────────────────────────────────────────

// POST /:workspaceId/connectors/:id/test — test a connector connection
connectorRoutes.post("/:workspaceId/connectors/:id/test", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const connectorId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const row = await connectors.getConnector(connectorId);
  if (!row || row.workspace_id !== workspaceId) {
    return c.json({ error: "Connector not found" }, 404);
  }

  const config = rowToConfig(row);
  const manager = getConnectorManager();
  const result = await manager.testConnection(config);

  // Update connector status in DB
  if (result.success) {
    await connectors.updateConnectorStatus(connectorId, "active", {
      capabilities: result.tools ? { tools: { count: result.tools.length } } : undefined,
    });
  } else {
    await connectors.updateConnectorStatus(connectorId, "error", {
      errorMessage: result.error,
    });
  }

  return c.json({
    data: {
      success: result.success,
      toolCount: result.tools?.length ?? 0,
      tools: result.tools?.map((t) => ({ name: t.name, description: t.description })),
      error: result.error,
    },
  });
});

// GET /:workspaceId/connectors/:id/tools — list discovered tools
connectorRoutes.get("/:workspaceId/connectors/:id/tools", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const connectorId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const row = await connectors.getConnector(connectorId);
  if (!row || row.workspace_id !== workspaceId) {
    return c.json({ error: "Connector not found" }, 404);
  }

  try {
    const config = rowToConfig(row);
    const manager = getConnectorManager();
    const tools = await manager.getTools(config);
    return c.json({ data: tools });
  } catch (err) {
    return c.json({
      error: `Failed to list tools: ${err instanceof Error ? err.message : String(err)}`,
    }, 500);
  }
});

// GET /:workspaceId/connectors/effective — resolved set for a project
connectorRoutes.get("/:workspaceId/connectors-effective", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const data = await connectors.getEffectiveConnectors(
    workspaceId,
    projectId,
    userId,
  );
  return c.json({ data });
});
