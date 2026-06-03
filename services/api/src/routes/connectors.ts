import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { connectorQueries, workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { getConnectorManager } from "../mcp/connector-manager.js";
import { discoverMcpServer } from "../mcp/discovery.js";
import {
  buildMcpOAuthUrl,
  decryptState,
  getCodeVerifier,
  exchangeCodeForToken,
} from "../mcp/oauth.js";
import type { McpConnectorConfig } from "../mcp/types.js";

const connectors = connectorQueries(sql);
const workspaces = workspaceQueries(sql);

export const connectorRoutes = new Hono<AuthEnv>({ strict: false });

connectorRoutes.use("*", authMiddleware);

// ─── Path-param guards ─────────────────────────────────────
//
// BUG-CORPUS-MCP-001: malformed/non-UUID `:id` (e.g. `notacid`) reached the
// `connectors.getConnector(id)` call which threw `invalid input syntax for
// type uuid` and surfaced as 500. We now validate path params up-front and
// return 400 — the SQL layer never sees a malformed UUID.
//
// Helper used inline in every handler that takes a `:id` (connector id) or
// `:workspaceId` path param. Returns a JSON 400 response when the value is
// not a UUID, otherwise null.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ensureUuidParam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any,
  paramName: string,
): Response | null {
  const value = c.req.param(paramName);
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    return c.json({ error: `Invalid ${paramName}: must be a UUID` }, 400);
  }
  return null;
}

// ─── Role helpers ──────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

async function requireAdmin(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  if (role !== "owner" && role !== "admin") return "Admin or owner role required";
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

// ─── Discovery ─────────────────────────────────────────────

const discoverSchema = z.object({
  url: z.string().url(),
});

// POST /:workspaceId/connectors/discover — probe a URL for MCP server card & tools
connectorRoutes.post(
  "/:workspaceId/connectors/discover",
  zValidator("json", discoverSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const { url } = c.req.valid("json");

    try {
      const result = await discoverMcpServer(url);
      return c.json({ data: result });
    } catch (err) {
      return c.json({
        data: {
          success: false,
          method: "none" as const,
          error: err instanceof Error ? err.message : "Discovery failed",
        },
      });
    }
  },
);

// ─── Connector CRUD ────────────────────────────────────────

// GET /:workspaceId/connectors
connectorRoutes.get("/:workspaceId/connectors", async (c) => {
  // BUG-CORPUS-MCP-001: reject non-UUID workspaceId before SQL lookup.
  const wsErr = ensureUuidParam(c, "workspaceId");
  if (wsErr) return wsErr;
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const projectId = c.req.query("projectId");

  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return c.json({ error: "Not a member of this workspace" }, 403);

  const rows = await connectors.listConnectors(workspaceId, { projectId });
  // The per-app database connector (builtin:data) is provisioned PER PROJECT —
  // one mcp_connectors row per project (scope='project'), by design, because
  // each project owns its own PGlite database. This settings list is a
  // per-server display, so without de-duplication "Doable Per-App Database"
  // shows up once per project (4 projects -> 4 identical rows). Collapse those
  // built-in per-project rows to a single representative entry. When a
  // projectId is in scope, prefer that project's own row.
  const preferredBuiltinData = projectId
    ? rows.find((r) => r.server_command === "builtin:data" && r.project_id === projectId)
    : undefined;
  let builtinDataEmitted = false;
  const data = rows.filter((row) => {
    if (row.server_command !== "builtin:data") return true;
    if (builtinDataEmitted) return false;
    builtinDataEmitted = true;
    return true;
  }).map((row) =>
    row.server_command === "builtin:data" && preferredBuiltinData
      ? preferredBuiltinData
      : row,
  );
  return c.json({ data, role });
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
  // Opaque credentials object — shape depends on authType
  // (e.g. { token } for bearer_token, { apiKey, header } for api_key,
  // { access_token } for oauth2). Encrypted at rest in credentials_encrypted.
  credentials: z.record(z.string(), z.unknown()).optional(),
  // Env vars passed to stdio MCP servers — encrypted at rest.
  serverEnv: z.record(z.string(), z.string()).optional(),
});

// POST /:workspaceId/connectors
connectorRoutes.post(
  "/:workspaceId/connectors",
  zValidator("json", createConnectorSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    // Workspace-scoped integrations require admin/owner role
    if (body.scope === "workspace") {
      const err = await requireAdmin(workspaceId, userId);
      if (err) return c.json({ error: err }, 403);
    } else {
      const err = await requireMember(workspaceId, userId);
      if (err) return c.json({ error: err }, 403);
    }

    // Validate transport config
    if (body.transportType !== "stdio" && !body.serverUrl) {
      return c.json({ error: "serverUrl is required for HTTP transports" }, 400);
    }
    // BUG-MCP-007: HTTP-based MCP connectors carry user/workspace credentials
    // (bearer tokens, API keys, OAuth tokens). Plaintext http:// URLs would
    // expose them to network attackers. Require https:// for both streamable
    // HTTP and SSE transports — except for explicit localhost/127.0.0.1 dev.
    if (
      (body.transportType === "streamable_http" || body.transportType === "http_sse") &&
      body.serverUrl
    ) {
      try {
        const u = new URL(body.serverUrl);
        const isLocal =
          u.hostname === "localhost" ||
          u.hostname === "127.0.0.1" ||
          u.hostname === "::1";
        if (u.protocol !== "https:" && !isLocal) {
          return c.json({ error: "MCP server URL must use HTTPS" }, 400);
        }
      } catch {
        return c.json({ error: "Invalid serverUrl" }, 400);
      }
    }
    // SECURITY: stdio connectors spawn arbitrary processes on the server.
    // Only server-provisioned builtins (via ensureBuiltinConnectorsForWorkspace)
    // may use stdio transport. User-created connectors are limited to HTTP.
    if (body.transportType === "stdio") {
      return c.json({ error: "stdio transport is not available for user-created connectors. Use an HTTP-based transport instead." }, 403);
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
      credentials: body.credentials,
      serverEnv: body.serverEnv,
    });

    // Auto-test the connector after creation to discover tools immediately.
    // Non-blocking — don't fail the create if test fails.
    if (row?.id) {
      const config = rowToConfig(row);
      const manager = getConnectorManager();
      manager.testConnection(config).then(async (result) => {
        if (result.success && result.tools) {
          await connectors.updateConnectorStatus(row.id, "active", {
            capabilities: {
              tools: {
                count: result.tools.length,
                list: result.tools.map((t) => ({ name: t.name, description: t.description })),
              },
            },
          });
        } else if (!result.success) {
          await connectors.updateConnectorStatus(row.id, "error", {
            errorMessage: result.error,
          });
        }
      }).catch((e) => {
        console.warn(`[Connectors] Auto-test failed for ${row.id}:`, e);
      });
    }

    return c.json({ data: row }, 201);
  },
);

// GET /:workspaceId/connectors/:id
connectorRoutes.get("/:workspaceId/connectors/:id", async (c) => {
  // BUG-CORPUS-MCP-001: reject non-UUID path params before SQL lookup.
  const wsErr = ensureUuidParam(c, "workspaceId");
  if (wsErr) return wsErr;
  const idErr = ensureUuidParam(c, "id");
  if (idErr) return idErr;
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
  // serverCommand and serverArgs intentionally excluded — stdio connectors
  // are server-provisioned only and their commands must not be user-editable.
  authType: z.enum(["none", "api_key", "oauth2", "bearer_token"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  serverEnv: z.record(z.string(), z.string()).optional(),
});

// PATCH /:workspaceId/connectors/:id
connectorRoutes.patch(
  "/:workspaceId/connectors/:id",
  zValidator("json", updateConnectorSchema),
  async (c) => {
    // BUG-CORPUS-MCP-001: reject non-UUID path params before SQL lookup.
    const wsErr = ensureUuidParam(c, "workspaceId");
    if (wsErr) return wsErr;
    const idErr = ensureUuidParam(c, "id");
    if (idErr) return idErr;
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
  // BUG-CORPUS-MCP-001: reject non-UUID path params before SQL lookup.
  const wsErr = ensureUuidParam(c, "workspaceId");
  if (wsErr) return wsErr;
  const idErr = ensureUuidParam(c, "id");
  if (idErr) return idErr;
  const workspaceId = c.req.param("workspaceId");
  const connectorId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  // BUG-MCP-002: Built-in MCP Apps (Markdown Builder, PDF Builder, etc.)
  // are platform-provisioned and must remain immutable. Deletion would
  // also break `ensureBuiltinConnectorsForWorkspace` invariants. Reject
  // deletes on any connector whose name matches a builtin provisioned
  // for this workspace.
  const existing = await connectors.getConnector(connectorId);
  if (!existing || existing.workspace_id !== workspaceId) {
    return c.json({ error: "Connector not found" }, 404);
  }
  const [builtinMarker] = await sql<Array<{ builtin_id: string }>>`
    SELECT wbp.builtin_id
    FROM workspace_builtin_provisioned wbp
    JOIN mcp_connectors mc
      ON mc.workspace_id = wbp.workspace_id
     AND mc.scope = 'workspace'
     AND mc.name = ANY(${[
       "Presentation Builder",
       "Spreadsheet Builder",
       "Markdown Builder",
       "PDF Builder",
     ]})
    WHERE mc.id = ${connectorId}
      AND wbp.workspace_id = ${workspaceId}
    LIMIT 1
  `;
  if (builtinMarker) {
    return c.json(
      { error: "Cannot delete built-in connector" },
      403
    );
  }

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
  // BUG-CORPUS-MCP-001: reject non-UUID :id BEFORE the SQL lookup that
  // would otherwise throw `invalid input syntax for type uuid` → 500.
  const wsErr = ensureUuidParam(c, "workspaceId");
  if (wsErr) return wsErr;
  const idErr = ensureUuidParam(c, "id");
  if (idErr) return idErr;
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
      capabilities: result.tools
        ? {
            tools: {
              count: result.tools.length,
              list: result.tools.map((t) => ({ name: t.name, description: t.description })),
            },
          }
        : undefined,
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
  // BUG-CORPUS-MCP-001: reject non-UUID path params before SQL lookup.
  const wsErr = ensureUuidParam(c, "workspaceId");
  if (wsErr) return wsErr;
  const idErr = ensureUuidParam(c, "id");
  if (idErr) return idErr;
  const workspaceId = c.req.param("workspaceId");
  const connectorId = c.req.param("id");
  const userId = c.get("userId");

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const row = await connectors.getConnector(connectorId);
  if (!row || row.workspace_id !== workspaceId) {
    return c.json({ error: "Connector not found" }, 404);
  }

  // BUG-MCP-008: an inactive/errored HTTP connector previously surfaced an
  // unhandled 500 here when the remote server was unreachable. Prefer the
  // cached tool list (populated by the auto-test on create) and otherwise
  // return a structured 503 with `tools: []` so clients can render an empty
  // state instead of a generic "Internal Server Error".
  if (row.status !== "active") {
    const cache = row.capabilities_cache as { tools?: { list?: Array<{ name: string; description?: string }> } } | null;
    const cached = cache?.tools?.list ?? [];
    return c.json(
      {
        data: cached,
        status: row.status,
        message: `Connector is ${row.status}; returning ${cached.length} cached tool(s).`,
        ...(row.error_message ? { error: row.error_message } : {}),
      },
      cached.length > 0 ? 200 : 503,
    );
  }

  try {
    const config = rowToConfig(row);
    const manager = getConnectorManager();
    const tools = await manager.getTools(config);
    return c.json({ data: tools });
  } catch (err) {
    // BUG-MCP-008: even for "active" connectors, a runtime fetch failure
    // must be reported as a structured 503 ("connector unreachable"), not 500.
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        data: [],
        error: "Connector unreachable",
        message: msg,
      },
      503,
    );
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

// ─── MCP OAuth Flow ────────────────────────────────────────

const mcpOAuthAuthorizeSchema = z.object({
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  mcpServerUrl: z.string().url(),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  registrationEndpoint: z.string().url().optional(),
  connectorId: z.string().uuid().optional(),
  connectorName: z.string().optional(),
});

// POST /:workspaceId/connectors/mcp-oauth/authorize
// Returns the authorization URL that the frontend opens in a popup
connectorRoutes.post(
  "/:workspaceId/connectors/mcp-oauth/authorize",
  authMiddleware,
  zValidator("json", mcpOAuthAuthorizeSchema),
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireMember(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    try {
      const authorizationUrl = await buildMcpOAuthUrl({
        authorizationEndpoint: body.authorizationEndpoint,
        tokenEndpoint: body.tokenEndpoint,
        mcpServerUrl: body.mcpServerUrl,
        scopes: body.scopes,
        clientId: body.clientId,
        registrationEndpoint: body.registrationEndpoint,
        userId,
        workspaceId,
        connectorId: body.connectorId,
        connectorName: body.connectorName,
      });

      return c.json({ data: { authorizationUrl } });
    } catch (err) {
      return c.json({
        error: `Failed to build OAuth URL: ${err instanceof Error ? err.message : String(err)}`,
      }, 500);
    }
  },
);

// ─── MCP OAuth Callback (no auth middleware — browser redirect) ──────

export const mcpOAuthCallbackRoute = new Hono({ strict: false });

// GET /connectors/mcp-oauth/callback — OAuth redirect target
mcpOAuthCallbackRoute.get("/connectors/mcp-oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  const frontendUrl = process.env.FRONTEND_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (error) {
    const errorDesc = c.req.query("error_description") ?? error;
    return c.html(renderMcpOAuthResult({
      success: false,
      error: errorDesc,
      frontendUrl,
    }));
  }

  if (!code || !state) {
    return c.html(renderMcpOAuthResult({
      success: false,
      error: "Missing authorization code or state",
      frontendUrl,
    }));
  }

  try {
    // Decrypt state to get context
    const stateData = decryptState(state);
    if (stateData.type !== "mcp-oauth") {
      throw new Error("Invalid state type");
    }

    const tokenEndpoint = stateData.tokenEndpoint as string;
    const clientId = stateData.clientId as string | undefined;
    const connectorId = stateData.connectorId as string | undefined;
    const connectorName = stateData.connectorName as string | undefined;
    const mcpServerUrl = stateData.mcpServerUrl as string;
    const workspaceId = stateData.workspaceId as string;
    const userId = stateData.userId as string;

    // Retrieve PKCE code verifier
    const codeVerifier = await getCodeVerifier(state);
    if (!codeVerifier) {
      throw new Error("PKCE code verifier expired or not found. Please try again.");
    }

    // Exchange code for token
    const tokenResult = await exchangeCodeForToken(tokenEndpoint, code, codeVerifier, clientId);

    // Store the token in the connector
    if (connectorId) {
      // Update existing connector with the new OAuth token
      await connectors.updateConnector(connectorId, {
        authType: "oauth2",
        credentials: {
          access_token: tokenResult.access_token,
          refresh_token: tokenResult.refresh_token,
          token_type: tokenResult.token_type,
          expires_in: tokenResult.expires_in,
          scope: tokenResult.scope,
          obtained_at: Date.now(),
        },
      });
    } else {
      // Create a new connector with the OAuth token
      await connectors.createConnector({
        workspaceId,
        createdBy: userId,
        scope: "workspace",
        name: connectorName ?? "MCP Server",
        transportType: "streamable_http",
        serverUrl: mcpServerUrl,
        authType: "oauth2",
        credentials: {
          access_token: tokenResult.access_token,
          refresh_token: tokenResult.refresh_token,
          token_type: tokenResult.token_type,
          expires_in: tokenResult.expires_in,
          scope: tokenResult.scope,
          obtained_at: Date.now(),
        },
      });
    }

    return c.html(renderMcpOAuthResult({
      success: true,
      frontendUrl,
      connectorName: connectorName ?? "MCP Server",
    }));
  } catch (err) {
    console.error("[MCP OAuth] Callback error:", err);
    return c.html(renderMcpOAuthResult({
      success: false,
      error: err instanceof Error ? err.message : "OAuth callback failed",
      frontendUrl,
    }));
  }
});

/** Render the OAuth callback result page (auto-closes popup) */
function renderMcpOAuthResult(opts: {
  success: boolean;
  error?: string;
  frontendUrl: string;
  connectorName?: string;
}): string {
  const message = opts.success
    ? `Connected to ${opts.connectorName ?? "MCP Server"} successfully!`
    : `Connection failed: ${opts.error ?? "Unknown error"}`;

  return `<!DOCTYPE html>
<html>
<head><title>MCP OAuth</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0a0a0a; color: #e5e5e5; }
  .card { text-align: center; padding: 2rem; max-width: 400px; }
  .icon { font-size: 3rem; margin-bottom: 1rem; }
  .msg { font-size: 1.1rem; margin-bottom: 0.5rem; }
  .sub { font-size: 0.85rem; color: #888; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">${opts.success ? "✅" : "❌"}</div>
    <p class="msg">${message}</p>
    <p class="sub">This window will close automatically.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({
        type: "doable:mcp-oauth-complete",
        success: ${opts.success},
        error: ${opts.error ? JSON.stringify(opts.error) : "null"},
        connectorName: ${opts.connectorName ? JSON.stringify(opts.connectorName) : "null"}
      }, "${opts.frontendUrl}");
    }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;
}
