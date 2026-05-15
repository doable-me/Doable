import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { type AuthEnv } from "../middleware/auth.js";
import { authMiddlewareWithRls as authMiddleware } from "../middleware/rls.js";
import { credentialVault } from "../integrations/credential-vault.js";
import { getIntegration } from "../integrations/registry/index.js";
import { resolveAuth } from "../integrations/runner-helpers.js";

const workspaces = workspaceQueries(sql);

export const integrationConnectionRoutes = new Hono<AuthEnv>({ strict: false });

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

// ─── Connections (auth required) ───────────────────────────

// GET /integrations/connections
integrationConnectionRoutes.get("/integrations/connections", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const workspaceId = c.req.query("workspaceId");

  if (!workspaceId) {
    return c.json({ error: "workspaceId query parameter is required" }, 400);
  }
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
integrationConnectionRoutes.post(
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
integrationConnectionRoutes.delete("/integrations/connections/:id", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const connectionId = c.req.param("id");

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
integrationConnectionRoutes.post("/integrations/connections/:id/test", authMiddleware, async (c) => {
  const userId = c.get("userId");
  const connectionId = c.req.param("id");

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
    } else if (def.authType === "secret_text" && row.integration_id === "google_gemini") {
      // Explicit validation for Google Gemini API keys
      const apiKey = (credentials.apiKey ?? credentials.auth ?? credentials.token) as string | undefined;
      if (!apiKey) {
        valid = false;
        message = "Missing API key.";
      } else {
        try {
          const res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey),
            { headers: { "Accept": "application/json" } },
          );
          if (res.ok) {
            message = "Gemini API key is valid";
          } else if (res.status === 400 || res.status === 401 || res.status === 403) {
            valid = false;
            const body = await res.text().catch(() => "");
            message = `Invalid or unauthorized Gemini API key (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ""}`;
          } else {
            valid = false;
            message = `Gemini API returned HTTP ${res.status}`;
          }
        } catch (e) {
          valid = false;
          message = `Cannot reach Gemini API: ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    // Try piece's validate method if available
    try {
      const mod = await import(def.piecePackage);
      const firstKey = Object.keys(mod)[0];
      const piece = mod.default ?? (firstKey ? mod[firstKey] : undefined);
      if (piece?.auth?.validate) {
        const resolved = resolveAuth(def.authType, credentials);
        const result = await piece.auth.validate({ auth: resolved });
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
