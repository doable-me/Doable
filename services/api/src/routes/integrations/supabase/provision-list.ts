import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../../../db/index.js";
import { authMiddleware, type AuthEnv } from "../../../middleware/auth.js";
import { credentialVault } from "../../../integrations/credential-vault.js";
import { listOrganizations } from "../../../integrations/supabase/provisioner.js";
import supabaseEnhancedAuthModule from "../../../integrations/enhanced-auth/supabase.js";
import { requireMember, getMgmtAccessToken } from "./provision-helpers.js";

export const provisionListRoutes = new Hono<AuthEnv>({ strict: false });

// ─── GET /integrations/supabase/orgs ──────────────────────

provisionListRoutes.get(
  "/integrations/supabase/orgs",
  authMiddleware,
  async (c) => {
    const userId = c.get("userId");
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) {
      return c.json({ error: "workspaceId query parameter is required" }, 400);
    }
    const memberErr = await requireMember(workspaceId, userId);
    if (memberErr) return c.json({ error: memberErr }, 403);

    const token = await getMgmtAccessToken(userId, workspaceId);
    if (!token) {
      return c.json({ error: "supabase_oauth_required" }, 412);
    }

    try {
      const orgs = await listOrganizations(token);
      return c.json({ data: orgs });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 401 from Supabase = token expired/revoked → re-auth needed
      if (msg.includes("401")) {
        return c.json({ error: "supabase_oauth_required" }, 412);
      }
      return c.json({ error: msg }, 500);
    }
  },
);

// ─── GET /integrations/supabase/projects ──────────────────
//
// Lists the user's existing Supabase projects (across all their orgs)
// via the Management API. Powers the "Connect an existing project"
// branch of the provision dialog.
provisionListRoutes.get(
  "/integrations/supabase/projects",
  authMiddleware,
  async (c) => {
    const userId = c.get("userId");
    const workspaceId = c.req.query("workspaceId");
    if (!workspaceId) {
      return c.json({ error: "workspaceId query parameter is required" }, 400);
    }
    const memberErr = await requireMember(workspaceId, userId);
    if (memberErr) return c.json({ error: memberErr }, 403);

    const token = await getMgmtAccessToken(userId, workspaceId);
    if (!token) {
      return c.json({ error: "supabase_oauth_required" }, 412);
    }

    try {
      const projects = await supabaseEnhancedAuthModule.listResources(token);
      return c.json({ data: projects });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401")) {
        return c.json({ error: "supabase_oauth_required" }, 412);
      }
      return c.json({ error: msg }, 500);
    }
  },
);

// ─── POST /integrations/supabase/use-existing ─────────────
//
// Connects an existing Supabase project to a Doable project without
// provisioning a new one.
const useExistingSchema = z.object({
  projectRef: z.string().min(1),
  projectId: z.string().uuid(),
});

provisionListRoutes.post(
  "/integrations/supabase/use-existing",
  authMiddleware,
  zValidator("json", useExistingSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    // Look up the Doable project to scope the credential row correctly.
    const [project] = await sql`
      SELECT id, workspace_id, name FROM projects WHERE id = ${body.projectId}
    `;
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    const workspaceId = project.workspace_id as string;

    const memberErr = await requireMember(workspaceId, userId);
    if (memberErr) return c.json({ error: memberErr }, 403);

    const token = await getMgmtAccessToken(userId, workspaceId);
    if (!token) {
      return c.json({ error: "supabase_oauth_required" }, 412);
    }

    // Find the picked project by ref via listResources.
    let resource;
    try {
      const projects = await supabaseEnhancedAuthModule.listResources(token);
      resource = projects.find((p) => p.id === body.projectRef);
      if (!resource) {
        return c.json({ error: "Supabase project not found — it may have been deleted or is not accessible with your token" }, 404);
      }
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }

    // Pull the picked project's keys and assemble the credential row.
    let extracted;
    try {
      extracted = await supabaseEnhancedAuthModule.extractCredentials(token, resource);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }

    // Clean up any stale project-scoped supabase row for this Doable project
    await sql`
      DELETE FROM integration_connections
      WHERE user_id = ${userId}
        AND integration_id = 'supabase'
        AND workspace_id = ${workspaceId}
        AND project_id = ${body.projectId}
    `;

    const stored = await credentialVault.store({
      workspaceId,
      userId,
      integrationId: "supabase",
      scope: "project",
      projectId: body.projectId,
      authType: extracted.authType,
      credentials: extracted.credentials,
      displayName: extracted.displayName,
      metadata: {
        ...extracted.metadata,
        connectedVia: "use_existing",
      },
    });

    // Restart the project's dev server so the vault-bridge re-resolves env vars
    try {
      const { restartDevServer, isRunning } = await import("../../../projects/dev-server.js");
      if (isRunning(body.projectId)) {
        await restartDevServer(body.projectId, { userId });
        console.log(`[use-existing] Restarted dev server for ${body.projectId} to pick up new Supabase env vars`);
      }
    } catch (err) {
      console.warn(`[use-existing] Failed to restart dev server:`, err instanceof Error ? err.message : err);
    }

    return c.json({
      data: {
        connectionId: stored.id,
        projectRef: body.projectRef,
        displayName: extracted.displayName,
      },
    });
  },
);
