import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { listIntegrations, getIntegration, getCategories } from "../integrations/registry/index.js";
import { credentialVault, oauthApps } from "../integrations/credential-vault.js";
import { getIntegrationActions } from "../integrations/runner.js";
import { buildAuthorizationUrl, handleOAuthCallback } from "../integrations/oauth2.js";
import type { IntegrationCategory } from "../integrations/types.js";

const workspaces = workspaceQueries(sql);

export const integrationRoutes = new Hono<AuthEnv>();

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

// ─── Catalog (public, no auth) ─────────────────────────────

// GET /integrations/catalog
integrationRoutes.get("/integrations/catalog", async (c) => {
  const category = c.req.query("category") as IntegrationCategory | undefined;
  const search = c.req.query("search");
  const workspaceId = c.req.query("workspaceId");

  const definitions = listIntegrations({ category, search });
  const categoriesRaw = getCategories();
  // getCategories() returns { category, count }[] — frontend expects string[]
  const categories = Array.isArray(categoriesRaw) && categoriesRaw[0]?.category
    ? categoriesRaw.map((c: any) => c.category)
    : categoriesRaw;

  // If workspaceId provided, enrich with connection status
  let connectedIds = new Set<string>();
  if (workspaceId) {
    try {
      const rows = await sql`
        SELECT DISTINCT integration_id FROM integration_connections
        WHERE workspace_id = ${workspaceId} AND status = 'active'
      `;
      connectedIds = new Set(rows.map((r: any) => r.integration_id));
    } catch {
      // Table may not exist yet — ignore
    }
  }

  const data = definitions.map((def) => ({
    id: def.id,
    displayName: def.displayName,
    description: def.description,
    logoUrl: def.logoUrl,
    category: def.category,
    authType: def.authType,
    tier: def.tier,
    connected: connectedIds.has(def.id),
    actionCount: def.actions.length,
    // Include custom auth fields so the frontend can render dynamic forms
    ...(def.customAuthFields?.length ? { customAuthFields: def.customAuthFields } : {}),
  }));

  return c.json({ data, categories });
});

// GET /integrations/catalog/:id
integrationRoutes.get("/integrations/catalog/:id", async (c) => {
  const id = c.req.param("id");
  const def = getIntegration(id);

  if (!def) {
    return c.json({ error: "Integration not found" }, 404);
  }

  return c.json({ data: def });
});

// GET /integrations/catalog/:id/actions
integrationRoutes.get("/integrations/catalog/:id/actions", async (c) => {
  const id = c.req.param("id");
  const def = getIntegration(id);

  if (!def) {
    return c.json({ error: "Integration not found" }, 404);
  }

  try {
    const actions = await getIntegrationActions(id);
    return c.json({ data: actions });
  } catch (err) {
    return c.json({
      error: `Failed to load actions: ${err instanceof Error ? err.message : String(err)}`,
    }, 500);
  }
});

// ─── Connections (auth required) ───────────────────────────

// GET /integrations/connections
integrationRoutes.get("/integrations/connections", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId query parameter is required" }, 400);
  }

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const connections = await credentialVault.listForUser(workspaceId, userId);

  // Enrich with display info from registry
  const data = connections.map((conn) => {
    const def = getIntegration(conn.integration_id);
    return {
      id: conn.id,
      integrationId: conn.integration_id,
      displayName: conn.display_name ?? def?.displayName ?? conn.integration_id,
      logoUrl: def?.logoUrl,
      scope: conn.scope,
      projectId: conn.project_id,
      authType: conn.auth_type,
      status: conn.status,
      errorMessage: conn.error_message,
      createdAt: conn.created_at,
      updatedAt: conn.updated_at,
    };
  });

  return c.json({ data });
});

const connectSchema = z.object({
  workspaceId: z.string().uuid(),
  integrationId: z.string().min(1),
  scope: z.enum(["workspace", "project", "user"]),
  credentials: z.record(z.unknown()).optional().default({}),
  displayName: z.string().max(200).optional(),
  projectId: z.string().uuid().optional(),
});

// POST /integrations/connect
integrationRoutes.post(
  "/integrations/connect",
  authMiddleware,
  zValidator("json", connectSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    // Workspace-scoped connections require admin role
    if (body.scope === "workspace") {
      const err = await requireAdmin(body.workspaceId, userId);
      if (err) return c.json({ error: err }, 403);
    } else {
      const err = await requireMember(body.workspaceId, userId);
      if (err) return c.json({ error: err }, 403);
    }

    const def = getIntegration(body.integrationId);
    if (!def) {
      return c.json({ error: "Integration not found" }, 404);
    }

    // Validate auth type compatibility
    if (def.authType === "oauth2" && !body.credentials.access_token) {
      return c.json({ error: "OAuth2 integrations must be connected via the OAuth flow" }, 400);
    }

    try {
      const connection = await credentialVault.store({
        workspaceId: body.workspaceId,
        userId,
        integrationId: body.integrationId,
        scope: body.scope,
        projectId: body.projectId,
        authType: def.authType,
        credentials: body.credentials,
        displayName: body.displayName,
      });

      return c.json({
        data: {
          id: connection.id,
          integrationId: connection.integration_id,
          displayName: connection.display_name ?? def.displayName,
          scope: connection.scope,
          status: connection.status,
          createdAt: connection.created_at,
        },
      }, 201);
    } catch (err) {
      return c.json({
        error: `Failed to store credentials: ${err instanceof Error ? err.message : String(err)}`,
      }, 500);
    }
  },
);

// DELETE /integrations/connections/:id
integrationRoutes.delete("/integrations/connections/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const connectionId = c.req.param("id");

  // Look up the connection to verify ownership
  const [row] = await sql`
    SELECT * FROM integration_connections WHERE id = ${connectionId}
  `;

  if (!row) {
    return c.json({ error: "Connection not found" }, 404);
  }

  // User must be the owner of the connection, or an admin of the workspace
  if (row.user_id !== userId) {
    const err = await requireAdmin(row.workspace_id, userId);
    if (err) return c.json({ error: err }, 403);
  }

  await credentialVault.delete(connectionId);
  return c.json({ data: { id: connectionId, deleted: true } });
});

// POST /integrations/connections/:id/test
integrationRoutes.post("/integrations/connections/:id/test", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const connectionId = c.req.param("id");

  // Look up the connection
  const [row] = await sql`
    SELECT * FROM integration_connections WHERE id = ${connectionId}
  `;

  if (!row) {
    return c.json({ error: "Connection not found" }, 404);
  }

  const err = await requireMember(row.workspace_id, userId);
  if (err) return c.json({ error: err }, 403);

  const def = getIntegration(row.integration_id);
  if (!def) {
    return c.json({ error: "Integration definition not found" }, 404);
  }

  try {
    // Decrypt credentials and try to load the piece + call validate
    const credentials = await credentialVault.decrypt(connectionId);

    // Try to load the piece and check for a validate/test method
    const mod = await import(def.piecePackage);
    const firstKey = Object.keys(mod)[0];
    const piece = mod.default ?? (firstKey ? mod[firstKey] : undefined);

    let valid = true;
    let message = "Connection is active";

    if (piece?.auth?.validate) {
      try {
        const result = await piece.auth.validate({ auth: credentials });
        valid = result?.valid !== false;
        message = result?.error ?? message;
      } catch (validateErr) {
        valid = false;
        message = validateErr instanceof Error ? validateErr.message : String(validateErr);
      }
    }

    // Update status in DB
    await credentialVault.updateStatus(
      connectionId,
      valid ? "active" : "error",
      valid ? undefined : message,
    );

    return c.json({
      data: {
        success: valid,
        message,
        integrationId: row.integration_id,
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    await credentialVault.updateStatus(connectionId, "error", errorMsg);

    return c.json({
      data: {
        success: false,
        message: errorMsg,
        integrationId: row.integration_id,
      },
    });
  }
});

// ─── OAuth Flow ────────────────────────────────────────────

// GET /integrations/oauth/:id/authorize
integrationRoutes.get("/integrations/oauth/:id/authorize", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const integrationId = c.req.param("id");
  const workspaceId = c.req.query("workspaceId");
  const scope = c.req.query("scope") as "workspace" | "project" | "user" | undefined;

  if (!workspaceId) {
    return c.json({ error: "workspaceId query parameter is required" }, 400);
  }

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const def = getIntegration(integrationId);
  if (!def) {
    return c.json({ error: "Integration not found" }, 404);
  }

  if (def.authType !== "oauth2") {
    return c.json({ error: "This integration does not use OAuth2" }, 400);
  }

  try {
    const authorizationUrl = await buildAuthorizationUrl(integrationId, {
      userId,
      workspaceId,
      scope: scope ?? "user",
    });

    return c.json({ authorizationUrl });
  } catch (err) {
    return c.json({
      error: `Failed to build authorization URL: ${err instanceof Error ? err.message : String(err)}`,
    }, 500);
  }
});

// GET /integrations/oauth/callback
integrationRoutes.get("/integrations/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";

  // Handle OAuth errors (user denied, etc.)
  if (error) {
    const errorDesc = c.req.query("error_description") ?? error;
    return c.redirect(
      `${frontendUrl}/settings/integrations?error=${encodeURIComponent(errorDesc)}`,
    );
  }

  if (!code || !state) {
    return c.redirect(
      `${frontendUrl}/settings/integrations?error=${encodeURIComponent("Missing code or state parameter")}`,
    );
  }

  try {
    const result = await handleOAuthCallback(code, state);

    return c.redirect(result.redirectUrl);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.redirect(
      `${frontendUrl}/settings/integrations?error=${encodeURIComponent(errorMsg)}`,
    );
  }
});

// ─── Admin: OAuth App Management ───────────────────────────

// GET /integrations/admin/oauth-apps
integrationRoutes.get("/integrations/admin/oauth-apps", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.query("workspaceId");

  if (workspaceId) {
    const err = await requireAdmin(workspaceId, userId);
    if (err) return c.json({ error: err }, 403);
  }

  const apps = await oauthApps.list(workspaceId);

  // Strip encrypted secrets from response
  const data = apps.map((app) => ({
    id: app.id,
    integrationId: app.integration_id,
    clientId: app.client_id,
    workspaceId: app.workspace_id,
    isGlobal: app.is_global,
    extraConfig: app.extra_config,
    createdAt: app.created_at,
    updatedAt: app.updated_at,
  }));

  return c.json({ data });
});

const createOAuthAppSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  integrationId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  extraConfig: z.record(z.unknown()).optional(),
  isGlobal: z.boolean().optional(),
});

// POST /integrations/admin/oauth-apps
integrationRoutes.post(
  "/integrations/admin/oauth-apps",
  authMiddleware,
  zValidator("json", createOAuthAppSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    // Must be admin of the workspace, or platform admin for global apps
    if (body.workspaceId) {
      const err = await requireAdmin(body.workspaceId, userId);
      if (err) return c.json({ error: err }, 403);
    } else if (body.isGlobal) {
      // Global apps require platform admin — for now check against workspace membership
      // Since we don't have a workspace context, this is a global operation
      // A future iteration could use platformAdminMiddleware
      return c.json({ error: "workspaceId is required (global apps are not yet supported via API)" }, 400);
    } else {
      return c.json({ error: "workspaceId is required" }, 400);
    }

    const def = getIntegration(body.integrationId);
    if (!def) {
      return c.json({ error: "Integration not found" }, 404);
    }

    if (def.authType !== "oauth2") {
      return c.json({ error: "This integration does not use OAuth2" }, 400);
    }

    try {
      const app = await oauthApps.create({
        workspaceId: body.workspaceId,
        integrationId: body.integrationId,
        clientId: body.clientId,
        clientSecret: body.clientSecret,
        extraConfig: body.extraConfig,
        isGlobal: body.isGlobal,
      });

      return c.json({
        data: {
          id: app.id,
          integrationId: app.integration_id,
          clientId: app.client_id,
          workspaceId: app.workspace_id,
          isGlobal: app.is_global,
          createdAt: app.created_at,
        },
      }, 201);
    } catch (err) {
      return c.json({
        error: `Failed to create OAuth app: ${err instanceof Error ? err.message : String(err)}`,
      }, 500);
    }
  },
);

// DELETE /integrations/admin/oauth-apps/:id
integrationRoutes.delete("/integrations/admin/oauth-apps/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");

  // Look up the app to get workspace context
  const [app] = await sql`SELECT * FROM oauth_apps WHERE id = ${appId}`;

  if (!app) {
    return c.json({ error: "OAuth app not found" }, 404);
  }

  if (app.workspace_id) {
    const err = await requireAdmin(app.workspace_id, userId);
    if (err) return c.json({ error: err }, 403);
  }

  await oauthApps.delete(appId);
  return c.json({ data: { id: appId, deleted: true } });
});
