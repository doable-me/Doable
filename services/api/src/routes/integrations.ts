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
import { getEnhancedAuthModule, storeEnhancedAuthSession, getEnhancedAuthSession, deleteEnhancedAuthSession } from "../integrations/enhanced-auth/index.js";
import type { IntegrationCategory } from "../integrations/types.js";
import * as crypto from "node:crypto";

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

// ─── Enhanced-auth helpers ─────────────────────────────────

/**
 * Compute an expires_at timestamp from an OAuth token response. Some
 * providers return `expires_in` (seconds from now), others return absolute
 * `expires_at` (seconds since epoch), and some return neither. Returns
 * undefined when the provider didn't give us a duration — callers should
 * treat the token as valid until it fails a 401 refresh.
 */
function computeExpiresAt(tokenData: Record<string, unknown>): string | undefined {
  if (typeof tokenData.expires_in === "number") {
    return new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  }
  if (typeof tokenData.expires_at === "number") {
    return new Date(tokenData.expires_at * 1000).toISOString();
  }
  return undefined;
}

/**
 * Dual-store the raw OAuth access_token from an enhanced-auth flow as a
 * sibling row under the declared `oauthIntegrationKey` (e.g.
 * "supabase-mgmt"). This is needed because `extractCredentials` typically
 * consumes the access token to pull resource-specific credentials (like
 * the Supabase anon key for a picked project) and throws the raw token
 * away, but Management-API operations (provision_supabase, etc.) need the
 * raw token preserved. The sibling row uses `auth_type = "oauth2"` and
 * `credentials = { access_token, refresh_token?, expires_at? }`.
 *
 * De-dupes by deleting any existing sibling row for the same
 * (user, integration, workspace) first, so repeat OAuth flows don't
 * accumulate stale tokens. See bugs/bug-23 for the trail.
 */
async function storeMgmtTokenSibling(
  mgmtIntegrationKey: string,
  params: {
    workspaceId: string;
    userId: string;
    scope: "workspace" | "project" | "user";
    accessToken: string;
    refreshToken?: string;
    expiresAt?: string;
    displayName: string;
  },
): Promise<void> {
  // Clean up any prior sibling row so repeated Sign-in-with-X flows don't
  // leave stale tokens in the DB.
  await sql`
    DELETE FROM integration_connections
    WHERE user_id = ${params.userId}
      AND integration_id = ${mgmtIntegrationKey}
      AND workspace_id = ${params.workspaceId}
  `;
  await credentialVault.store({
    workspaceId: params.workspaceId,
    userId: params.userId,
    integrationId: mgmtIntegrationKey,
    scope: params.scope,
    authType: "oauth2",
    credentials: {
      access_token: params.accessToken,
      ...(params.refreshToken ? { refresh_token: params.refreshToken } : {}),
      ...(params.expiresAt ? { expires_at: params.expiresAt } : {}),
    },
    displayName: params.displayName,
    metadata: { via: "enhanced_auth_sibling" },
  });
}

/**
 * Restart a project's Vite dev server so the vault-bridge re-resolves
 * env vars from the newly-stored credential. Without this, the dev
 * server keeps running with the OLD .env and `import.meta.env.VITE_*`
 * vars are undefined — crashing any code that reads them at module
 * load time (e.g. `createClient(import.meta.env.VITE_SUPABASE_URL)`
 * → "supabaseUrl is required" → white screen).
 *
 * Called after every credentialVault.store() that's scoped to a
 * project. Non-critical: if the restart fails (dev server not running,
 * project doesn't exist, etc.), we log and move on — the user can
 * always manually refresh the preview.
 */
async function restartDevServerForProject(projectId: string | null | undefined, userId?: string): Promise<void> {
  if (!projectId) return;
  try {
    const { restartDevServer, isRunning } = await import("../projects/dev-server.js");
    if (isRunning(projectId)) {
      await restartDevServer(projectId, userId ? { userId } : undefined);
      console.log(`[Integrations] Restarted dev server for ${projectId} to pick up new env vars`);
    }
  } catch (err) {
    console.warn(`[Integrations] Dev server restart failed for ${projectId}:`, err instanceof Error ? err.message : err);
  }
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
    // Include enhanced auth config (frontend-safe subset) for easy connect UX
    ...(def.enhancedAuth ? {
      enhancedAuth: {
        providerKey: def.enhancedAuth.providerKey,
        connectLabel: def.enhancedAuth.connectLabel,
        requiresResourceSelection: def.enhancedAuth.requiresResourceSelection,
        resourceLabel: def.enhancedAuth.resourceLabel,
      },
    } : {}),
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
  // Validate the shape BEFORE it hits the DB — otherwise Postgres raises
  // `invalid input syntax for type uuid` and we leak a 500 with raw error
  // text. See bugs/bug-14 for the trail.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return c.json({ error: "workspaceId must be a valid UUID" }, 400);
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

      // Restart dev server so new env vars are available immediately
      await restartDevServerForProject(body.projectId, userId);

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
    // Decrypt credentials to verify they're readable
    const credentials = await credentialVault.decrypt(connectionId) as Record<string, unknown> | null;

    if (!credentials) {
      await credentialVault.updateStatus(connectionId, "error", "Credentials not found or corrupted");
      return c.json({ data: { success: false, message: "Credentials not found", integrationId: row.integration_id } });
    }

    let valid = true;
    let message = "Connection is active";

    // Quick validation: try a lightweight API call for known providers
    if (def.authType === "oauth2") {
      if (!credentials.access_token) {
        valid = false;
        message = "No access token found. Try reconnecting.";
      } else if (row.integration_id === "gmail") {
        const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${credentials.access_token}` },
        });
        if (res.ok) {
          const profile = await res.json() as Record<string, unknown>;
          message = `Connected as ${profile.emailAddress ?? "unknown"}`;
        } else if (res.status === 401) {
          valid = false;
          message = "Access token expired. Try reconnecting.";
        } else {
          valid = false;
          message = `Gmail API returned ${res.status}`;
        }
      }
    } else if (def.authType === "custom_auth" && row.integration_id === "supabase") {
      const url = credentials.url as string;
      const apiKey = credentials.apiKey as string;
      if (!url || !apiKey) {
        valid = false;
        message = "Missing project URL or API key.";
      } else {
        try {
          const res = await fetch(`${url}/rest/v1/`, {
            headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
          });
          if (res.ok) {
            message = `Connected to ${url.replace("https://", "").replace(".supabase.co", "")}`;
          } else {
            valid = false;
            message = `Supabase API returned ${res.status}: ${res.statusText}`;
          }
        } catch (e) {
          valid = false;
          message = `Cannot reach Supabase: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    // Try piece's validate method if available
    try {
      const mod = await import(def.piecePackage);
      const firstKey = Object.keys(mod)[0];
      const piece = mod.default ?? (firstKey ? mod[firstKey] : undefined);
      if (piece?.auth?.validate) {
        const result = await piece.auth.validate({ auth: credentials });
        if (result?.valid === false) {
          valid = false;
          message = result?.error ?? "Validation failed";
        }
      }
    } catch {
      // Piece loading/validation is optional — don't fail the test
    }

    await credentialVault.updateStatus(connectionId, valid ? "active" : "error", valid ? undefined : message);

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
  // See bugs/bug-14 — validate UUID shape before hitting the DB.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    return c.json({ error: "workspaceId must be a valid UUID" }, 400);
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

    // This runs in a popup — return HTML that auto-closes the window.
    // The opener (connect-flow.tsx) polls for popup closure and refreshes connections.
    return c.html(`<!DOCTYPE html><html><head><title>Connected</title></head><body>
      <p>Connected successfully! This window will close automatically.</p>
      <script>window.close();</script>
    </body></html>`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.html(`<!DOCTYPE html><html><head><title>Error</title></head><body>
      <p>Connection failed: ${errorMsg.replace(/</g, "&lt;")}</p>
      <p><a href="javascript:window.close()">Close this window</a></p>
    </body></html>`, 400);
  }
});

// ─── Enhanced Auth Flow ──────────────────────────────────

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.PUBLIC_URL ?? "http://localhost:3000";
const EA_API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
// Enhanced auth has its own callback path (different from the regular OAuth
// flow at /integrations/oauth/callback) and therefore its own env var so the
// two flows can be registered as separate OAuth apps with the provider. Prefer
// the enhanced-auth-specific var; fall back to the default callback path (NOT
// to INTEGRATIONS_OAUTH_REDIRECT_URI, which is a path mismatch that silently
// broke the Supabase "Sign in with" flow).
const EA_REDIRECT_URI = process.env.INTEGRATIONS_ENHANCED_AUTH_REDIRECT_URI ?? `${EA_API_URL}/integrations/enhanced-auth/callback`;

// GET /integrations/enhanced-auth/:id/authorize
integrationRoutes.get("/integrations/enhanced-auth/:id/authorize", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const integrationId = c.req.param("id");
  const workspaceId = c.req.query("workspaceId");
  const scope = c.req.query("scope") ?? "user";

  if (!workspaceId) return c.json({ error: "workspaceId is required" }, 400);

  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const def = getIntegration(integrationId);
  if (!def?.enhancedAuth) return c.json({ error: "Enhanced auth not available for this integration" }, 404);

  const ea = def.enhancedAuth;

  // Resolve OAuth app for the management OAuth (e.g., "supabase-mgmt")
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  const oauthApp = await oauthApps.get(ea.oauthIntegrationKey, workspaceId);
  if (oauthApp) {
    clientId = oauthApp.client_id;
    clientSecret = oauthApp.clientSecret ?? (oauthApp as any).client_secret;
  } else {
    const envKey = ea.oauthIntegrationKey.toUpperCase().replace(/-/g, "_");
    clientId = process.env[`OAUTH_${envKey}_CLIENT_ID`];
    clientSecret = process.env[`OAUTH_${envKey}_CLIENT_SECRET`];
  }

  if (!clientId || !clientSecret) {
    return c.json({
      error: `Enhanced auth OAuth not configured for ${def.displayName}. ` +
        `Set OAUTH_${ea.oauthIntegrationKey.toUpperCase().replace(/-/g, "_")}_CLIENT_ID and _CLIENT_SECRET in .env, ` +
        `or register an OAuth app for "${ea.oauthIntegrationKey}" in admin settings.`,
    }, 500);
  }

  // Build state with enhanced auth context
  const stateKey = crypto.randomBytes(16).toString("hex");
  const state = Buffer.from(JSON.stringify({
    key: stateKey,
    integrationId,
    userId,
    workspaceId,
    scope,
    enhanced: true,
  })).toString("base64url");

  // Build PKCE if needed
  let codeVerifier: string | undefined;
  const query: Record<string, string> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: EA_REDIRECT_URI,
    scope: ea.oauth2Config.scopes.join(" "),
    state,
  };

  // `access_type=offline` is a Google-specific parameter that asks Google
  // to return a refresh token. Other providers (Supabase, GitHub, …) use
  // strict validators and REJECT the whole authorize request with
  // "Unrecognized key(s) in object: 'access_type'". Only send it when the
  // provider is Google, or when the integration has opted in via
  // `extraParams: { access_type: "offline" }`.
  const isGoogle = ea.oauth2Config.authUrl.includes("accounts.google.com");
  if (isGoogle) {
    query.access_type = "offline";
  }
  // Merge any provider-specific extra params declared on the integration's
  // oauth2Config. This also covers the Google case via data, but we keep
  // the explicit branch above so the behavior is obvious at read time.
  if (ea.oauth2Config.extraParams) {
    for (const [k, v] of Object.entries(ea.oauth2Config.extraParams)) {
      query[k] = v;
    }
  }

  if (ea.oauth2Config.pkce) {
    codeVerifier = crypto.randomBytes(32).toString("base64url").slice(0, 43);
    // Store verifier keyed by state for callback retrieval
    storeEnhancedAuthSession(`pkce:${state}`, {
      accessToken: codeVerifier, // reuse field to store verifier
      integrationId,
      userId,
      workspaceId,
      scope,
    });
    query.code_challenge = ea.oauth2Config.pkceMethod === "S256"
      ? crypto.createHash("sha256").update(codeVerifier).digest("base64url")
      : codeVerifier;
    query.code_challenge_method = ea.oauth2Config.pkceMethod ?? "S256";
  }

  if (ea.oauth2Config.prompt && ea.oauth2Config.prompt !== "omit") {
    query.prompt = ea.oauth2Config.prompt;
  }

  const authorizationUrl = `${ea.oauth2Config.authUrl}?${new URLSearchParams(query)}`;
  return c.json({ authorizationUrl });
});

// GET /integrations/enhanced-auth/callback
integrationRoutes.get("/integrations/enhanced-auth/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.html(`<!DOCTYPE html><html><head><title>Error</title></head><body>
      <p>Authorization failed: ${(c.req.query("error_description") ?? error).replace(/</g, "&lt;")}</p>
      <p><a href="javascript:window.close()">Close</a></p>
    </body></html>`, 400);
  }

  if (!code || !stateParam) {
    return c.html(`<!DOCTYPE html><html><head><title>Error</title></head><body>
      <p>Missing authorization code or state.</p>
      <p><a href="javascript:window.close()">Close</a></p>
    </body></html>`, 400);
  }

  let stateData: any;
  try {
    stateData = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return c.html(`<p>Invalid state parameter.</p>`, 400);
  }

  const { integrationId, userId, workspaceId, scope } = stateData;

  const def = getIntegration(integrationId);
  if (!def?.enhancedAuth) {
    return c.html(`<p>Integration not found.</p>`, 404);
  }

  const ea = def.enhancedAuth;

  // Resolve OAuth app again for token exchange
  const oauthApp = await oauthApps.get(ea.oauthIntegrationKey, workspaceId);
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  if (oauthApp) {
    clientId = oauthApp.client_id;
    clientSecret = oauthApp.clientSecret ?? (oauthApp as any).client_secret;
  } else {
    const envKey = ea.oauthIntegrationKey.toUpperCase().replace(/-/g, "_");
    clientId = process.env[`OAUTH_${envKey}_CLIENT_ID`];
    clientSecret = process.env[`OAUTH_${envKey}_CLIENT_SECRET`];
  }

  if (!clientId || !clientSecret) {
    return c.html(`<p>OAuth not configured.</p>`, 500);
  }

  // Exchange code for token
  const body: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: EA_REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  };

  // PKCE verifier
  const pkceSession = getEnhancedAuthSession(`pkce:${stateParam}`);
  if (pkceSession) {
    body.code_verifier = pkceSession.accessToken; // stored verifier
    deleteEnhancedAuthSession(`pkce:${stateParam}`);
  }

  const tokenRes = await fetch(ea.oauth2Config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
  });
  const tokenData = (await tokenRes.json()) as Record<string, unknown>;

  if (tokenData.error) {
    const msg = (tokenData.error_description ?? tokenData.error) as string;
    return c.html(`<!DOCTYPE html><html><head><title>Error</title></head><body>
      <p>Token exchange failed: ${String(msg).replace(/</g, "&lt;")}</p>
      <p><a href="javascript:window.close()">Close</a></p>
    </body></html>`, 400);
  }

  const accessToken = tokenData.access_token as string;

  // Store session and show resource picker or complete directly
  const sessionKey = crypto.randomBytes(16).toString("hex");
  storeEnhancedAuthSession(sessionKey, {
    accessToken,
    integrationId,
    userId,
    workspaceId,
    scope,
  });

  if (!ea.requiresResourceSelection) {
    // No resource selection needed — complete immediately
    try {
      const module = await getEnhancedAuthModule(ea.providerKey);
      if (!module) throw new Error("Enhanced auth module not found");

      const result = await module.extractCredentials(accessToken, null);
      if (module.validateCredentials) {
        const validationError = await module.validateCredentials(result.credentials);
        if (validationError) throw new Error(validationError);
      }

      await credentialVault.store({
        workspaceId, userId, integrationId,
        scope: scope as "workspace" | "project" | "user",
        authType: result.authType,
        credentials: result.credentials,
        displayName: result.displayName,
        metadata: result.metadata,
      });

      // Phase 2A bug-23 — the provisioner (and any future Management-API
      // operation) needs the raw OAuth access_token, but the step above
      // only stores whatever `extractCredentials` returned (for Supabase
      // that's project-specific url + keys, and the mgmt token is thrown
      // away). Dual-store the raw token under the declared
      // `oauthIntegrationKey` so provision.ts's `getMgmtAccessToken()`
      // can find it. See bugs/bug-23 for the full trail.
      await storeMgmtTokenSibling(ea.oauthIntegrationKey, {
        workspaceId, userId, scope: scope as "workspace" | "project" | "user",
        accessToken, refreshToken: tokenData.refresh_token as string | undefined,
        expiresAt: computeExpiresAt(tokenData),
        displayName: `${def.displayName} Management API`,
      });

      deleteEnhancedAuthSession(sessionKey);
      return c.html(`<!DOCTYPE html><html><head><title>Connected</title></head><body>
        <p>Connected successfully! This window will close automatically.</p>
        <script>
          try {
            if (window.opener) {
              window.opener.postMessage({
                type: "doable:enhanced-auth-complete",
                integrationId: ${JSON.stringify(integrationId)},
                displayName: ${JSON.stringify(result.displayName.replace(/["<>\\]/g, ""))},
                status: "success"
              }, "*");
            }
          } catch (e) {}
          try {
            localStorage.setItem("doable_enhanced_auth_complete", JSON.stringify({
              integrationId: ${JSON.stringify(integrationId)},
              status: "success",
              at: Date.now(),
            }));
          } catch (e) {}
          setTimeout(function() { window.close(); }, 500);
        </script>
      </body></html>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.html(`<p>Connection failed: ${msg.replace(/</g, "&lt;")}</p>
        <p><a href="javascript:window.close()">Close</a></p>`, 400);
    }
  }

  // Resource selection required — show server-rendered picker
  try {
    const module = await getEnhancedAuthModule(ea.providerKey);
    if (!module) throw new Error("Enhanced auth module not found");

    const resources = await module.listResources(accessToken);

    const resourceListHtml = resources.map((r) =>
      `<button type="submit" name="resourceId" value="${r.id}" style="display:block;width:100%;text-align:left;padding:12px 16px;margin:6px 0;border:1px solid #333;border-radius:8px;background:#1a1a2e;color:#eee;cursor:pointer;font-size:14px;">
        <strong>${r.name}</strong>${r.description ? `<br/><small style="color:#999">${r.description}</small>` : ""}
      </button>`
    ).join("");

    return c.html(`<!DOCTYPE html>
<html><head>
  <title>${ea.resourceLabel ?? "Select a resource"}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0d0d1a; color: #eee; padding: 24px; margin: 0; }
    h2 { margin: 0 0 4px; font-size: 18px; }
    p { color: #999; margin: 0 0 16px; font-size: 13px; }
    button:hover { border-color: #f97316; background: #1f1f3a; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
    .logo img { width: 28px; height: 28px; border-radius: 6px; }
  </style>
</head><body>
  <div class="logo">
    <img src="${def.logoUrl}" alt=""/>
    <h2>${ea.resourceLabel ?? "Select a resource"}</h2>
  </div>
  <p>Choose which ${def.displayName} resource to connect:</p>
  <form method="POST" action="/integrations/enhanced-auth/${integrationId}/complete">
    <input type="hidden" name="session" value="${sessionKey}"/>
    ${resources.length > 0 ? resourceListHtml : "<p>No resources found.</p>"}
  </form>
</body></html>`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.html(`<p>Failed to load resources: ${msg.replace(/</g, "&lt;")}</p>
      <p><a href="javascript:window.close()">Close</a></p>`, 400);
  }
});

// POST /integrations/enhanced-auth/:id/complete
integrationRoutes.post("/integrations/enhanced-auth/:id/complete", async (c) => {
  const integrationId = c.req.param("id");

  // Support both JSON body and form-encoded body (from server-rendered picker)
  let sessionKey: string;
  let resourceId: string | null;

  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await c.req.json() as { session: string; resourceId?: string };
    sessionKey = body.session;
    resourceId = body.resourceId ?? null;
  } else {
    const body = await c.req.parseBody() as { session: string; resourceId?: string };
    sessionKey = body.session;
    resourceId = body.resourceId ?? null;
  }

  const session = getEnhancedAuthSession(sessionKey);
  if (!session) {
    return c.html(`<p>Session expired. Please try connecting again.</p>
      <p><a href="javascript:window.close()">Close</a></p>`, 400);
  }

  const def = getIntegration(integrationId);
  if (!def?.enhancedAuth) {
    return c.html(`<p>Integration not found.</p>`, 404);
  }

  try {
    const module = await getEnhancedAuthModule(def.enhancedAuth.providerKey);
    if (!module) throw new Error("Enhanced auth module not found");

    // If resource selection required, find the selected resource
    let selectedResource = null;
    if (resourceId) {
      const resources = await module.listResources(session.accessToken);
      selectedResource = resources.find((r) => r.id === resourceId) ?? null;
      if (!selectedResource) throw new Error("Selected resource not found");
    }

    const result = await module.extractCredentials(session.accessToken, selectedResource);

    // Validate if module supports it
    if (module.validateCredentials) {
      const validationError = await module.validateCredentials(result.credentials);
      if (validationError) throw new Error(validationError);
    }

    // Store connection — identical to manual entry
    await credentialVault.store({
      workspaceId: session.workspaceId,
      userId: session.userId,
      integrationId,
      scope: (session.scope as "workspace" | "project" | "user") ?? "user",
      authType: result.authType,
      credentials: result.credentials,
      displayName: result.displayName,
      metadata: result.metadata,
    });

    // Phase 2A bug-23 — also store the raw OAuth access_token under the
    // declared `oauthIntegrationKey` (e.g. "supabase-mgmt"). See the
    // twin write in the no-resource-selection branch above for the full
    // reasoning — Management-API operations like provision_supabase need
    // the raw token and can't recover it from the project-specific creds
    // that extractCredentials returned.
    await storeMgmtTokenSibling(def.enhancedAuth.oauthIntegrationKey, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      scope: (session.scope as "workspace" | "project" | "user") ?? "user",
      accessToken: session.accessToken,
      displayName: `${def.displayName} Management API`,
    });

    deleteEnhancedAuthSession(sessionKey);

    // postMessage the success back to the opener BEFORE calling window.close.
    // COOP and some browsers strip the parent's popup reference after a
    // cross-origin round-trip, so the parent's setInterval(popup.closed) poll
    // can hang forever or fire after an arbitrary delay. postMessage works
    // cross-origin and lets the parent refresh its catalog immediately.
    const safeDisplayName = result.displayName.replace(/["<>\\]/g, "");
    return c.html(`<!DOCTYPE html><html><head><title>Connected</title></head><body>
      <p style="font-family:sans-serif;padding:40px;text-align:center;color:#eee;background:#0d0d1a;">
        Connected <strong>${result.displayName}</strong> successfully!<br/>
        This window will close automatically.
      </p>
      <script>
        try {
          if (window.opener) {
            window.opener.postMessage({
              type: "doable:enhanced-auth-complete",
              integrationId: ${JSON.stringify(integrationId)},
              displayName: ${JSON.stringify(safeDisplayName)},
              status: "success"
            }, "*");
          }
        } catch (e) { /* opener may be gone */ }
        // Fallback channel: write a one-time success marker to localStorage
        // and drop a cookie so the opener can detect completion even when
        // COOP has severed the window.opener reference (e.g. after
        // cross-origin navigation through Supabase's auth domain). The
        // opener listens for "storage" events OR re-runs fetchOrgs() on
        // popup close.
        try {
          localStorage.setItem("doable_enhanced_auth_complete", JSON.stringify({
            integrationId: ${JSON.stringify(integrationId)},
            displayName: ${JSON.stringify(safeDisplayName)},
            status: "success",
            at: Date.now(),
          }));
        } catch (e) { /* ignore — storage may be blocked */ }
        // Delay the close so the postMessage + storage write have a
        // chance to reach the opener's event loop BEFORE the popup tears
        // down. Without this, the opener's popup.closed poll flips true
        // before the opener processes the postMessage task, and the
        // opener rejects the whole flow as "window was closed" even
        // though the OAuth completed successfully. Empirically ~300ms is
        // plenty on Chromium — bumped to 500ms for safety.
        setTimeout(function() { window.close(); }, 500);
      </script>
    </body></html>`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.html(`<!DOCTYPE html><html><head><title>Error</title></head><body>
      <p style="font-family:sans-serif;padding:40px;color:#f87171;background:#0d0d1a;">
        Connection failed: ${msg.replace(/</g, "&lt;")}
      </p>
      <p><a href="javascript:window.close()">Close this window</a></p>
      <script>
        try {
          if (window.opener) {
            window.opener.postMessage({
              type: "doable:enhanced-auth-complete",
              integrationId: ${JSON.stringify(integrationId)},
              status: "error",
              error: ${JSON.stringify(msg.slice(0, 300))}
            }, "*");
          }
        } catch (e) { /* opener may be gone */ }
      </script>
    </body></html>`, 400);
  }
});

// GET /integrations/enhanced-auth/:id/resources (JSON API for frontend resource picker)
integrationRoutes.get("/integrations/enhanced-auth/:id/resources", authMiddleware, async (c) => {
  const integrationId = c.req.param("id");
  const sessionKey = c.req.query("session");

  if (!sessionKey) return c.json({ error: "session is required" }, 400);

  const session = getEnhancedAuthSession(sessionKey);
  if (!session) return c.json({ error: "Session expired" }, 400);

  const def = getIntegration(integrationId);
  if (!def?.enhancedAuth) return c.json({ error: "Enhanced auth not available" }, 404);

  try {
    const module = await getEnhancedAuthModule(def.enhancedAuth.providerKey);
    if (!module) throw new Error("Module not found");

    const resources = await module.listResources(session.accessToken);
    return c.json({ data: resources });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
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

// ─── X-Ray: Integration Observability Endpoints ──────────

import { xray } from "../integrations/xray.js";

/**
 * GET /integrations/xray/active
 * All in-flight integration & MCP calls right now.
 * Shows exactly what's running, which phase it's in, and how long.
 */
integrationRoutes.get("/xray/active", authMiddleware, async (c) => {
  return c.json({ data: xray.getActive() });
});

/**
 * GET /integrations/xray/stuck?threshold=30000
 * Calls that have been running longer than threshold (default 30s).
 */
integrationRoutes.get("/xray/stuck", authMiddleware, async (c) => {
  const threshold = Number(c.req.query("threshold") || 30000);
  return c.json({ data: xray.getStuck(threshold) });
});

/**
 * GET /integrations/xray/stats
 * Latency stats for ALL integrations: p50/p95/p99, error rates,
 * slowest HTTP calls, slowest phases.
 */
integrationRoutes.get("/xray/stats", authMiddleware, async (c) => {
  return c.json({ data: xray.getAllStats() });
});

/**
 * GET /integrations/xray/stats/:integrationId
 * Per-integration deep stats including slowest HTTP calls and phases.
 */
integrationRoutes.get("/xray/stats/:integrationId", authMiddleware, async (c) => {
  const id = c.req.param("integrationId");
  const stats = xray.getStats(id);
  if (!stats) return c.json({ data: null });
  return c.json({ data: stats });
});

/**
 * GET /integrations/xray/history/:integrationId?limit=20
 * Recent completed call history for an integration with full phase + HTTP breakdown.
 */
integrationRoutes.get("/xray/history/:integrationId", authMiddleware, async (c) => {
  const id = c.req.param("integrationId");
  const limit = Math.min(Number(c.req.query("limit") || 20), 100);
  return c.json({ data: xray.getHistory(id, limit) });
});

/**
 * GET /integrations/xray/call/:callId
 * Single call forensics — full phase timeline + every HTTP request.
 */
integrationRoutes.get("/xray/call/:callId", authMiddleware, async (c) => {
  const call = xray.getCall(c.req.param("callId"));
  if (!call) return c.json({ error: "Call not found" }, 404);
  return c.json({ data: call });
});
