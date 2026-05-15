import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import { oauthApps } from "../integrations/credential-vault.js";
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
integrationAdminRoutes.delete("/integrations/admin/oauth-apps/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const appId = c.req.param("id");

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

    // Check if global OAuth credentials exist
    let configured = true;
    if (def.authType === "oauth2" && def.requiresOAuthApp) {
      const [oauthApp] = await sql`
        SELECT id FROM oauth_apps WHERE integration_id = ${body.integrationId} AND is_global = true LIMIT 1
      `;
      configured = !!oauthApp;
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
