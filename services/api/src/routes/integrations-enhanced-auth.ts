import { Hono } from "hono";
import { sql } from "../db/index.js";
import type { AuthEnv } from "../middleware/auth.js";
import { credentialVault, oauthApps } from "../integrations/credential-vault.js";
import { getIntegration } from "../integrations/registry/index.js";
import { getEnhancedAuthModule, storeEnhancedAuthSession, getEnhancedAuthSession, deleteEnhancedAuthSession } from "../integrations/enhanced-auth/index.js";
import * as crypto from "node:crypto";

export const integrationEnhancedAuthRoutes = new Hono<AuthEnv>({ strict: false });

const EA_API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
const EA_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL
  ?? (EA_API_URL.startsWith("http://127.") || EA_API_URL.startsWith("http://localhost") ? null : EA_API_URL)
  ?? EA_API_URL;
const EA_REDIRECT_URI = process.env.INTEGRATIONS_ENHANCED_AUTH_REDIRECT_URI ?? `${EA_PUBLIC_API_URL}/integrations/enhanced-auth/callback`;

function computeExpiresAt(tokenData: Record<string, unknown>): string | undefined {
  if (typeof tokenData.expires_in === "number") {
    return new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
  }
  if (typeof tokenData.expires_at === "number") {
    return new Date(tokenData.expires_at * 1000).toISOString();
  }
  return undefined;
}

/** Store raw OAuth access_token as sibling row for Management-API operations (see bugs/bug-23). */
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

// ─── Enhanced Auth — Callback ────────────────────────────

// GET /integrations/enhanced-auth/callback
integrationEnhancedAuthRoutes.get("/integrations/enhanced-auth/callback", async (c) => {
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
  const pkceSession = await getEnhancedAuthSession(`pkce:${stateParam}`);
  if (pkceSession) {
    body.code_verifier = pkceSession.accessToken; // stored verifier
    await deleteEnhancedAuthSession(`pkce:${stateParam}`);
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

      await storeMgmtTokenSibling(ea.oauthIntegrationKey, {
        workspaceId, userId, scope: scope as "workspace" | "project" | "user",
        accessToken, refreshToken: tokenData.refresh_token as string | undefined,
        expiresAt: computeExpiresAt(tokenData),
        displayName: `${def.displayName} Management API`,
      });

      await deleteEnhancedAuthSession(sessionKey);
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

// ─── Enhanced Auth — Complete ────────────────────────────

// POST /integrations/enhanced-auth/:id/complete
integrationEnhancedAuthRoutes.post("/integrations/enhanced-auth/:id/complete", async (c) => {
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

  const session = await getEnhancedAuthSession(sessionKey);
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

    let selectedResource = null;
    if (resourceId) {
      const resources = await module.listResources(session.accessToken);
      selectedResource = resources.find((r) => r.id === resourceId) ?? null;
      if (!selectedResource) throw new Error("Selected resource not found");
    }

    const result = await module.extractCredentials(session.accessToken, selectedResource);

    if (module.validateCredentials) {
      const validationError = await module.validateCredentials(result.credentials);
      if (validationError) throw new Error(validationError);
    }

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

    await storeMgmtTokenSibling(def.enhancedAuth.oauthIntegrationKey, {
      workspaceId: session.workspaceId,
      userId: session.userId,
      scope: (session.scope as "workspace" | "project" | "user") ?? "user",
      accessToken: session.accessToken,
      displayName: `${def.displayName} Management API`,
    });

    await deleteEnhancedAuthSession(sessionKey);

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
        try {
          localStorage.setItem("doable_enhanced_auth_complete", JSON.stringify({
            integrationId: ${JSON.stringify(integrationId)},
            displayName: ${JSON.stringify(safeDisplayName)},
            status: "success",
            at: Date.now(),
          }));
        } catch (e) { /* ignore — storage may be blocked */ }
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
