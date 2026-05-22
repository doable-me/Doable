import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { oauthApps, platformCredentials } from "../integrations/credential-vault.js";
import { recordAdminAction } from "../admin/audit-log.js";
import { getIntegration, listIntegrations } from "../integrations/registry/index.js";
import { xray } from "../integrations/xray.js";

/**
 * Detect integrations that have OAuth credentials configured via environment variables.
 * These work without any admin DB configuration.
 */
function getEnvConfiguredIntegrations(): Map<string, { source: string; clientId?: string }> {
  const result = new Map<string, { source: string; clientId?: string }>();
  const allDefs = listIntegrations({});

  for (const def of allDefs) {
    if (def.authType !== "oauth2" || !def.oauth2Config) continue;

    const envKey = def.id.toUpperCase().replace(/-/g, "_");
    const envClientId = process.env[`OAUTH_${envKey}_CLIENT_ID`];
    const envClientSecret = process.env[`OAUTH_${envKey}_CLIENT_SECRET`];

    if (envClientId && envClientSecret) {
      result.set(def.id, { source: `OAUTH_${envKey}_*`, clientId: envClientId });
      continue;
    }

    // Google services share GOOGLE_CLIENT_ID
    const isGoogle = def.oauth2Config.authUrl?.includes("accounts.google.com");
    if (isGoogle) {
      const gClientId = process.env.GOOGLE_INTEGRATIONS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
      const gClientSecret = process.env.GOOGLE_INTEGRATIONS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
      if (gClientId && gClientSecret) {
        result.set(def.id, { source: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", clientId: gClientId });
        continue;
      }
    }

    // GitHub services share GITHUB_CLIENT_ID
    const isGitHub = def.oauth2Config.authUrl?.includes("github.com");
    if (isGitHub) {
      const ghClientId = process.env.GITHUB_CLIENT_ID;
      const ghClientSecret = process.env.GITHUB_CLIENT_SECRET;
      if (ghClientId && ghClientSecret) {
        result.set(def.id, { source: "GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET", clientId: ghClientId });
        continue;
      }
    }
  }

  return result;
}

const workspaces = workspaceQueries(sql);

export const integrationAdminRoutes = new Hono<AuthEnv>({ strict: false });

async function requireAdmin(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  if (role !== "owner" && role !== "admin") return "Admin or owner role required";
  return null;
}

// ─── Admin: OAuth App Management ───────────────────────────

// GET /integrations/admin/oauth-apps
integrationAdminRoutes.get("/integrations/admin/oauth-apps", authMiddleware, async (c) => {
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
integrationAdminRoutes.post(
  "/integrations/admin/oauth-apps",
  authMiddleware,
  zValidator("json", createOAuthAppSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    if (body.workspaceId) {
      const err = await requireAdmin(body.workspaceId, userId);
      if (err) return c.json({ error: err }, 403);
    } else if (body.isGlobal) {
      // Platform admins can create global OAuth apps (no workspace)
      // Platform admin check handled by the calling frontend (/admin page)
      // Still verify via DB for safety
      const { featureFlagQueries } = await import("@doable/db");
      const ff = featureFlagQueries(sql);
      const isPlatformAdmin = await ff.isPlatformAdmin(userId);
      if (!isPlatformAdmin) {
        return c.json({ error: "Platform admin access required for global apps" }, 403);
      }
    } else {
      return c.json({ error: "workspaceId or isGlobal is required" }, 400);
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

      await recordAdminAction(c, {
        action: "integrations.oauth_app.upsert",
        resourceType: "integration",
        resourceId: body.integrationId,
        details: {
          isGlobal: !!body.isGlobal,
          workspaceId: body.workspaceId ?? null,
          clientIdTail: body.clientId.slice(-4),
        },
      }).catch(() => { /* audit failures must not block the operation */ });

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
    } catch {
      // Opaque error — never reflect err.message for credential operations, even
      // sanitized. The detailed failure is captured in API logs; the response is
      // a generic 500 so no token-shaped string can leak via the network.
      return c.json({
        error: "Failed to create OAuth app. Check API logs for details.",
      }, 500);
    }
  },
);

// DELETE /integrations/admin/oauth-apps/:id
//
// Authorization model:
//   - Workspace-scoped row (workspace_id NOT NULL): caller must be admin of that workspace
//   - Global row (workspace_id IS NULL): caller must be a platform admin
// Pre-existing audit gap from the original implementation: global rows previously
// only required authMiddleware (any logged-in user could delete the platform's
// OAuth apps if they knew an id). Fixed here.
integrationAdminRoutes.delete("/integrations/admin/oauth-apps/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");

  const [app] = await sql`SELECT * FROM oauth_apps WHERE id = ${appId}`;

  if (!app) {
    // Audit even the 404 — captures "tried to delete unknown OAuth app id X" for forensics.
    await recordAdminAction(c, {
      action: "integrations.oauth_app.delete_attempt_not_found",
      resourceType: "integration",
      resourceId: appId,
    }).catch(() => { /* audit best-effort */ });
    return c.json({ error: "OAuth app not found" }, 404);
  }

  if (app.workspace_id) {
    const err = await requireAdmin(app.workspace_id as string, userId);
    if (err) return c.json({ error: err }, 403);
  } else {
    // Global row: require platform admin. Pre-existing DELETE behavior allowed
    // any authenticated user to delete global OAuth apps if they knew the id.
    const { featureFlagQueries } = await import("@doable/db");
    const ff = featureFlagQueries(sql);
    const isPlatformAdmin = await ff.isPlatformAdmin(userId);
    if (!isPlatformAdmin) {
      return c.json({ error: "Platform admin access required to delete global OAuth apps" }, 403);
    }
  }

  await oauthApps.delete(appId);

  await recordAdminAction(c, {
    action: "integrations.oauth_app.delete",
    resourceType: "integration",
    resourceId: (app.integration_id as string) ?? appId,
    details: {
      oauthAppId: appId,
      isGlobal: !!app.is_global,
      workspaceId: app.workspace_id ?? null,
    },
  }).catch(() => { /* audit failures must not block the operation */ });

  return c.json({ data: { id: appId, deleted: true } });
});

// ─── Admin: Enabled Integrations Management ────────────────

// GET /integrations/admin/enabled — List enabled integrations for a workspace
integrationAdminRoutes.get("/integrations/admin/enabled", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId is required" }, 400);

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const rows = await sql`
    SELECT wei.*, oa.id AS oauth_app_id, oa.client_id AS oauth_client_id
    FROM workspace_enabled_integrations wei
    LEFT JOIN oauth_apps oa ON oa.workspace_id = wei.workspace_id AND oa.integration_id = wei.integration_id
    WHERE wei.workspace_id = ${workspaceId}
    ORDER BY wei.integration_id
  `;

  return c.json({ data: rows });
});

// POST /integrations/admin/enabled — Enable an integration
integrationAdminRoutes.post(
  "/integrations/admin/enabled",
  authMiddleware,
  zValidator("json", z.object({
    workspaceId: z.string().uuid(),
    integrationId: z.string().min(1),
    enabled: z.boolean().default(true),
  })),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(body.workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const def = getIntegration(body.integrationId);
    if (!def) return c.json({ error: "Integration not found in registry" }, 404);

    // Check if OAuth credentials exist (for oauth2 types)
    let configured = true;
    if (def.authType === "oauth2" && def.requiresOAuthApp) {
      const [oauthApp] = await sql`
        SELECT id FROM oauth_apps
        WHERE (workspace_id = ${body.workspaceId} OR is_global = true)
          AND integration_id = ${body.integrationId}
        LIMIT 1
      `;
      configured = !!oauthApp;
    }

    const [row] = await sql`
      INSERT INTO workspace_enabled_integrations (workspace_id, integration_id, enabled, configured, enabled_by)
      VALUES (${body.workspaceId}, ${body.integrationId}, ${body.enabled}, ${configured}, ${userId})
      ON CONFLICT (workspace_id, integration_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        configured = ${configured},
        enabled_by = EXCLUDED.enabled_by,
        updated_at = now()
      RETURNING *
    `;

    return c.json({ data: row }, 201);
  },
);

// DELETE /integrations/admin/enabled/:integrationId — Disable/remove an integration
integrationAdminRoutes.delete("/integrations/admin/enabled/:integrationId", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const integrationId = c.req.param("integrationId");
  const workspaceId = c.req.query("workspaceId");
  if (!workspaceId) return c.json({ error: "workspaceId is required" }, 400);

  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  await sql`
    DELETE FROM workspace_enabled_integrations
    WHERE workspace_id = ${workspaceId} AND integration_id = ${integrationId}
  `;

  return c.json({ data: { integrationId, disabled: true } });
});

// POST /integrations/admin/enabled/bulk — Enable multiple integrations at once
integrationAdminRoutes.post(
  "/integrations/admin/enabled/bulk",
  authMiddleware,
  zValidator("json", z.object({
    workspaceId: z.string().uuid(),
    integrationIds: z.array(z.string().min(1)).min(1).max(50),
    enabled: z.boolean().default(true),
  })),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const err = await requireAdmin(body.workspaceId, userId);
    if (err) return c.json({ error: err }, 403);

    const results = [];
    for (const integrationId of body.integrationIds) {
      const def = getIntegration(integrationId);
      if (!def) continue;

      let configured = true;
      if (def.authType === "oauth2" && def.requiresOAuthApp) {
        const [oauthApp] = await sql`
          SELECT id FROM oauth_apps
          WHERE (workspace_id = ${body.workspaceId} OR is_global = true)
            AND integration_id = ${integrationId}
          LIMIT 1
        `;
        configured = !!oauthApp;
      }

      const [row] = await sql`
        INSERT INTO workspace_enabled_integrations (workspace_id, integration_id, enabled, configured, enabled_by)
        VALUES (${body.workspaceId}, ${integrationId}, ${body.enabled}, ${configured}, ${userId})
        ON CONFLICT (workspace_id, integration_id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          configured = ${configured},
          enabled_by = EXCLUDED.enabled_by,
          updated_at = now()
        RETURNING *
      `;
      results.push(row);
    }

    return c.json({ data: results }, 201);
  },
);

// ─── Platform Admin: Global Enabled Integrations ─────────────
// These apply to ALL workspaces (existing and future).

// GET /integrations/admin/platform-enabled — List globally enabled integrations
integrationAdminRoutes.get("/integrations/admin/platform-enabled", authMiddleware, platformAdminMiddleware, async (c) => {
  const rows = await sql`
    SELECT pei.*, oa.id AS oauth_app_id, oa.client_id AS oauth_client_id
    FROM platform_enabled_integrations pei
    LEFT JOIN oauth_apps oa ON oa.integration_id = pei.integration_id AND oa.is_global = true
    ORDER BY pei.integration_id
  `;

  // Enrich with env-var configuration info
  const envConfigured = getEnvConfiguredIntegrations();
  const enrichedRows = rows.map((row: any) => ({
    ...row,
    env_configured: envConfigured.has(row.integration_id),
    env_source: envConfigured.get(row.integration_id)?.source ?? null,
  }));

  // Also include env-configured integrations not in DB as "implicitly configured"
  const envOnlyIntegrations = [...envConfigured.entries()]
    .filter(([id]) => !rows.some((r: any) => r.integration_id === id))
    .map(([id, info]) => ({
      integration_id: id,
      enabled: false,
      configured: true,
      env_configured: true,
      env_source: info.source,
      oauth_app_id: null,
      oauth_client_id: info.clientId ?? null,
      enabled_by: null,
      notes: null,
      created_at: null,
      updated_at: null,
    }));

  return c.json({ data: enrichedRows, envConfigured: envOnlyIntegrations });
});

// POST /integrations/admin/platform-enabled — Enable an integration globally
integrationAdminRoutes.post(
  "/integrations/admin/platform-enabled",
  authMiddleware,
  platformAdminMiddleware,
  zValidator("json", z.object({
    integrationId: z.string().min(1),
    enabled: z.boolean().default(true),
  })),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const def = getIntegration(body.integrationId);
    if (!def) return c.json({ error: "Integration not found in registry" }, 404);

    // Check if credentials exist for this integration
    let configured = true;
    if (def.authType === "oauth2" && def.requiresOAuthApp) {
      const [oauthApp] = await sql`
        SELECT id FROM oauth_apps WHERE integration_id = ${body.integrationId} AND is_global = true LIMIT 1
      `;
      configured = !!oauthApp;
    } else if (def.authType === "secret_text" || def.authType === "basic_auth" || def.authType === "custom_auth") {
      const [credRow] = await sql`
        SELECT id FROM platform_integration_credentials WHERE integration_id = ${body.integrationId} LIMIT 1
      `;
      configured = !!credRow;
    }

    const [row] = await sql`
      INSERT INTO platform_enabled_integrations (integration_id, enabled, configured, enabled_by)
      VALUES (${body.integrationId}, ${body.enabled}, ${configured}, ${userId})
      ON CONFLICT (integration_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        configured = ${configured},
        enabled_by = EXCLUDED.enabled_by,
        updated_at = now()
      RETURNING *
    `;

    return c.json({ data: row }, 201);
  },
);

// DELETE /integrations/admin/platform-enabled/:integrationId — Disable globally
integrationAdminRoutes.delete("/integrations/admin/platform-enabled/:integrationId", authMiddleware, platformAdminMiddleware, async (c) => {
  const integrationId = c.req.param("integrationId");
  await sql`DELETE FROM platform_enabled_integrations WHERE integration_id = ${integrationId}`;
  return c.json({ data: { integrationId, disabled: true } });
});

// POST /integrations/admin/platform-enabled/bulk — Bulk enable globally
integrationAdminRoutes.post(
  "/integrations/admin/platform-enabled/bulk",
  authMiddleware,
  platformAdminMiddleware,
  zValidator("json", z.object({
    integrationIds: z.array(z.string().min(1)).min(1).max(50),
    enabled: z.boolean().default(true),
  })),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const results = [];
    for (const integrationId of body.integrationIds) {
      const def = getIntegration(integrationId);
      if (!def) continue;

      let configured = true;
      if (def.authType === "oauth2" && def.requiresOAuthApp) {
        const [oauthApp] = await sql`
          SELECT id FROM oauth_apps WHERE integration_id = ${integrationId} AND is_global = true LIMIT 1
        `;
        configured = !!oauthApp;
      } else if (def.authType === "secret_text" || def.authType === "basic_auth" || def.authType === "custom_auth") {
        const [credRow] = await sql`
          SELECT id FROM platform_integration_credentials WHERE integration_id = ${integrationId} LIMIT 1
        `;
        configured = !!credRow;
      }

      const [row] = await sql`
        INSERT INTO platform_enabled_integrations (integration_id, enabled, configured, enabled_by)
        VALUES (${integrationId}, ${body.enabled}, ${configured}, ${userId})
        ON CONFLICT (integration_id) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          configured = ${configured},
          enabled_by = EXCLUDED.enabled_by,
          updated_at = now()
        RETURNING *
      `;
      results.push(row);
    }

    return c.json({ data: results }, 201);
  },
);

// ─── Platform Admin: Env-Configured Integrations ─────────────

// GET /integrations/admin/env-configured — List integrations configured via env vars
integrationAdminRoutes.get("/integrations/admin/env-configured", authMiddleware, platformAdminMiddleware, async (c) => {
  const envConfigured = getEnvConfiguredIntegrations();
  const data = [...envConfigured.entries()].map(([id, info]) => ({
    integrationId: id,
    source: info.source,
    clientId: info.clientId,
    displayName: getIntegration(id)?.displayName ?? id,
  }));
  return c.json({ data });
});

// ─── Platform Admin: Non-OAuth Credential Storage ─────────────────────────
// Handles secret_text, basic_auth, custom_auth at the platform (global) scope.
// OAuth credentials remain in /admin/oauth-apps.

// GET /integrations/admin/credentials
integrationAdminRoutes.get(
  "/integrations/admin/credentials",
  authMiddleware,
  platformAdminMiddleware,
  async (c) => {
    const rows = await platformCredentials.list();
    return c.json({
      data: rows.map((r) => ({
        integrationId: r.integrationId,
        authType: r.authType,
        displayHint: r.displayHint,
        updatedAt: r.updatedAt,
      })),
    });
  },
);

const createCredentialSchema = z.object({
  integrationId: z.string().min(1),
  authType: z.enum(["secret_text", "basic_auth", "custom_auth"]),
  credentials: z.record(z.unknown()),
  displayHint: z.string().optional(),
});

// POST /integrations/admin/credentials
integrationAdminRoutes.post(
  "/integrations/admin/credentials",
  authMiddleware,
  platformAdminMiddleware,
  zValidator("json", createCredentialSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    const def = getIntegration(body.integrationId);
    if (!def) {
      return c.json({ error: "Integration not found in registry" }, 404);
    }

    if (def.authType !== body.authType) {
      return c.json(
        { error: `Integration declares authType '${def.authType}', got '${body.authType}'` },
        400,
      );
    }

    const result = await platformCredentials.upsert({
      integrationId: body.integrationId,
      authType: body.authType,
      credentials: body.credentials,
      displayHint: body.displayHint,
      actorUserId: userId,
    });

    await recordAdminAction(c, {
      action: "integrations.platform_credentials.upsert",
      resourceType: "integration",
      resourceId: body.integrationId,
      details: { authType: body.authType },
    });

    return c.json(
      {
        data: {
          id: result.id,
          integrationId: body.integrationId,
          authType: body.authType,
          updatedAt: result.updatedAt,
        },
      },
      201,
    );
  },
);

// DELETE /integrations/admin/credentials/:integrationId
integrationAdminRoutes.delete(
  "/integrations/admin/credentials/:integrationId",
  authMiddleware,
  platformAdminMiddleware,
  async (c) => {
    const integrationId = c.req.param("integrationId");
    const deleted = await platformCredentials.delete(integrationId);

    if (!deleted) {
      return c.json({ error: "No credentials found for this integration" }, 404);
    }

    await recordAdminAction(c, {
      action: "integrations.platform_credentials.delete",
      resourceType: "integration",
      resourceId: integrationId,
    });

    return c.json({ data: { integrationId, deleted: true } });
  },
);

// ─── Platform Admin: Test Connection ──────────────────────
// Lightweight "are credentials configured and reachable" probe. Does NOT
// decrypt or transmit secrets. For OAuth integrations it checks reachability
// of the provider's tokenUrl. For non-OAuth, it returns ok if a row exists.
// Real upstream API calls (which would require decrypting + transmitting
// credentials) are intentionally out of scope for v1.

integrationAdminRoutes.post(
  "/integrations/admin/test",
  authMiddleware,
  platformAdminMiddleware,
  zValidator("json", z.object({ integrationId: z.string().min(1) })),
  async (c) => {
    const { integrationId } = c.req.valid("json");

    const def = getIntegration(integrationId);
    if (!def) {
      return c.json({ ok: false, error: "Integration not found in registry" }, 404);
    }

    // OAuth: verify (a) we have a stored client_id or env vars, and (b) the
    // tokenUrl resolves. We DO NOT POST to the token endpoint here — that
    // would require the encrypted secret and bind us to provider quirks.
    if (def.authType === "oauth2") {
      const [row] = await sql<Array<{ id: string }>>`
        SELECT id FROM oauth_apps
        WHERE integration_id = ${integrationId}
          AND (is_global = true OR workspace_id IS NULL)
        LIMIT 1
      `;
      const envKey = integrationId.toUpperCase().replace(/-/g, "_");
      const hasEnv = !!(process.env[`OAUTH_${envKey}_CLIENT_ID`] && process.env[`OAUTH_${envKey}_CLIENT_SECRET`]);
      if (!row && !hasEnv) {
        return c.json({ ok: false, error: "No OAuth credentials configured" }, 200);
      }
      const tokenUrl = def.oauth2Config?.tokenUrl;
      if (!tokenUrl) {
        return c.json({ ok: true, message: "Credentials present (no tokenUrl declared)" });
      }
      try {
        // HEAD avoids transmitting a body. 405 is fine — the URL is reachable.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(tokenUrl, { method: "HEAD", signal: ctrl.signal });
        clearTimeout(t);
        return c.json({
          ok: res.status < 500,
          message: `tokenUrl reachable (HTTP ${res.status})`,
        });
      } catch (err) {
        return c.json({
          ok: false,
          error: `tokenUrl unreachable: ${err instanceof Error ? err.message : "unknown"}`,
        }, 200);
      }
    }

    // Non-OAuth: ok if a platform credential row exists.
    if (def.authType === "secret_text" || def.authType === "basic_auth" || def.authType === "custom_auth") {
      const cred = await platformCredentials.list().then((rows) => rows.find((r) => r.integrationId === integrationId));
      if (!cred) {
        return c.json({ ok: false, error: "No credentials configured" }, 200);
      }
      return c.json({ ok: true, message: `Configured (${cred.authType})` });
    }

    return c.json({ ok: true, message: "Nothing to test" });
  },
);

// ─── X-Ray: Integration Observability Endpoints ──────────

integrationAdminRoutes.get("/xray/active", authMiddleware, async (c) => {
  return c.json({ data: xray.getActive() });
});

integrationAdminRoutes.get("/xray/stuck", authMiddleware, async (c) => {
  const threshold = Number(c.req.query("threshold") || 30000);
  return c.json({ data: xray.getStuck(threshold) });
});

integrationAdminRoutes.get("/xray/stats", authMiddleware, async (c) => {
  return c.json({ data: xray.getAllStats() });
});

integrationAdminRoutes.get("/xray/stats/:integrationId", authMiddleware, async (c) => {
  const id = c.req.param("integrationId");
  const stats = xray.getStats(id);
  if (!stats) return c.json({ data: null });
  return c.json({ data: stats });
});

integrationAdminRoutes.get("/xray/history/:integrationId", authMiddleware, async (c) => {
  const id = c.req.param("integrationId");
  const limit = Math.min(Number(c.req.query("limit") || 20), 100);
  return c.json({ data: xray.getHistory(id, limit) });
});

integrationAdminRoutes.get("/xray/call/:callId", authMiddleware, async (c) => {
  const call = xray.getCall(c.req.param("callId"));
  if (!call) return c.json({ error: "Call not found" }, 404);
  return c.json({ data: call });
});

// ─── X-Ray: Span Tracing (docore + dovault) ──────────────

integrationAdminRoutes.get("/xray/spans", authMiddleware, async (c) => {
  const source = c.req.query("source") as "docore" | "dovault" | undefined;
  const name = c.req.query("name");
  const limit = Math.min(Number(c.req.query("limit") || 50), 200);
  return c.json({ data: xray.getSpans({ source, name: name || undefined, limit }) });
});

integrationAdminRoutes.get("/xray/spans/stats", authMiddleware, async (c) => {
  return c.json({ data: xray.getSpanStats() });
});
