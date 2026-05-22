import { Hono } from "hono";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { getIntegration } from "../integrations/registry/index.js";
import { oauthApps } from "../integrations/credential-vault.js";
import { buildAuthorizationUrl, handleOAuthCallback } from "../integrations/oauth2.js";
import { getEnhancedAuthModule, storeEnhancedAuthSession, getEnhancedAuthSession } from "../integrations/enhanced-auth/index.js";
import * as crypto from "node:crypto";

const workspaces = workspaceQueries(sql);

export const integrationOAuthRoutes = new Hono<AuthEnv>({ strict: false });

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

const EA_API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
// Public-facing API origin (HTTPS) — Supabase + Google reject http:// redirect
// targets that aren't localhost. Prefer NEXT_PUBLIC_API_URL on production
// installs and only fall back to API_URL for dev when no public host is set.
const EA_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL
  ?? (EA_API_URL.startsWith("http://127.") || EA_API_URL.startsWith("http://localhost") ? null : EA_API_URL)
  ?? EA_API_URL;
const EA_REDIRECT_URI = process.env.INTEGRATIONS_ENHANCED_AUTH_REDIRECT_URI ?? `${EA_PUBLIC_API_URL}/integrations/enhanced-auth/callback`;

// ─── OAuth Flow ────────────────────────────────────────────

// GET /integrations/oauth/:id/authorize
integrationOAuthRoutes.get("/integrations/oauth/:id/authorize", authMiddleware, async (c) => {
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
integrationOAuthRoutes.get("/integrations/oauth/callback", async (c) => {
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

// ─── Enhanced Auth Flow — Authorize ──────────────────────

// GET /integrations/enhanced-auth/:id/authorize
integrationOAuthRoutes.get("/integrations/enhanced-auth/:id/authorize", authMiddleware, async (c) => {
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

  let codeVerifier: string | undefined;
  const query: Record<string, string> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: EA_REDIRECT_URI,
    scope: ea.oauth2Config.scopes.join(" "),
    state,
  };

  const isGoogle = ea.oauth2Config.authUrl.includes("accounts.google.com");
  if (isGoogle) {
    query.access_type = "offline";
  }
  if (ea.oauth2Config.extraParams) {
    for (const [k, v] of Object.entries(ea.oauth2Config.extraParams)) {
      query[k] = v;
    }
  }

  if (ea.oauth2Config.pkce) {
    codeVerifier = crypto.randomBytes(32).toString("base64url").slice(0, 43);
    storeEnhancedAuthSession(`pkce:${state}`, {
      accessToken: codeVerifier,
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

// ─── Enhanced Auth — Resource Listing ────────────────────

// GET /integrations/enhanced-auth/:id/resources (JSON API for frontend resource picker)
integrationOAuthRoutes.get("/integrations/enhanced-auth/:id/resources", authMiddleware, async (c) => {
  const integrationId = c.req.param("id");
  const sessionKey = c.req.query("session");

  if (!sessionKey) return c.json({ error: "session is required" }, 400);

  const session = await getEnhancedAuthSession(sessionKey);
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
