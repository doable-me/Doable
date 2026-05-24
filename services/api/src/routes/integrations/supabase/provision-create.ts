import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { streamSSE } from "hono/streaming";
import { sql } from "../../../db/index.js";
import { authMiddleware, type AuthEnv } from "../../../middleware/auth.js";
import { credentialVault } from "../../../integrations/credential-vault.js";
import {
  createProject,
  waitForActive,
  getApiKeys,
} from "../../../integrations/supabase/provisioner.js";
import { runMigration } from "../../../integrations/supabase/migrate.js";
import { deployEdgeFunction } from "../../../integrations/supabase/edge-functions.js";
import { requireMember, getMgmtAccessToken, activeProvisions } from "./provision-helpers.js";

export const provisionCreateRoutes = new Hono<AuthEnv>({ strict: false });

// ─── POST /integrations/supabase/provision ────────────────

const provisionSchema = z.object({
  projectId: z.string().uuid(),
  orgId: z.string().min(1),
  region: z.string().min(1),
  name: z.string().max(100).optional(),
  pendingMigrations: z
    .array(
      z.object({
        name: z.string().min(1),
        sql: z.string().min(1),
      }),
    )
    .optional(),
  pendingEdgeFunctions: z
    .array(
      z.object({
        slug: z.string().min(1),
        entrypointSource: z.string().min(1),
        importMap: z.string().optional(),
      }),
    )
    .optional(),
});

provisionCreateRoutes.post(
  "/integrations/supabase/provision",
  authMiddleware,
  zValidator("json", provisionSchema),
  async (c) => {
    const userId = c.get("userId");
    const body = c.req.valid("json");

    // Look up the Doable project's workspace so we can enforce membership
    // and scope the credential-vault entry correctly.
    const [project] = await sql`
      SELECT id, workspace_id, name FROM projects WHERE id = ${body.projectId}
    `;
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }
    const workspaceId = project.workspace_id as string;
    const projectName = (project.name as string | null) ?? "Doable project";

    const memberErr = await requireMember(workspaceId, userId);
    if (memberErr) return c.json({ error: memberErr }, 403);

    // Fetch the user's management OAuth access token before starting the
    // stream so we can return a clean 412 if missing.
    const accessToken = await getMgmtAccessToken(userId, workspaceId);
    if (!accessToken) {
      return c.json({ error: "supabase_oauth_required" }, 412);
    }

    // One in-flight provision per user. Return 429 instead of queueing.
    if (activeProvisions.has(userId)) {
      return c.json(
        { error: "A Supabase project is already being provisioned for your account. Please wait for it to complete." },
        429,
      );
    }
    activeProvisions.add(userId);

    const finalName = body.name?.trim() || projectName;

    c.header("X-Accel-Buffering", "no");
    return streamSSE(c, async (stream) => {
      const send = (phase: string, message: string) =>
        stream.writeSSE({
          data: JSON.stringify({
            type: "provision_progress",
            data: { phase, message },
          }),
        });

      try {
        await send("creating", `Creating Supabase project "${finalName}"...`);
        const { projectRef, dbPassword } = await createProject({
          accessToken,
          name: finalName,
          orgId: body.orgId,
          region: body.region,
        });

        await send("waiting", "Waiting for project to become healthy (this can take up to 2 minutes)...");
        await waitForActive({ accessToken, projectRef });

        await send("fetching_keys", "Fetching project API keys...");
        const { anon, serviceRole } = await getApiKeys(accessToken, projectRef);

        // ── Optional: run AI-authored migrations ──
        if (body.pendingMigrations?.length) {
          await send(
            "migrating",
            `Running ${body.pendingMigrations.length} migration${body.pendingMigrations.length === 1 ? "" : "s"}...`,
          );
          for (const migration of body.pendingMigrations) {
            const result = await runMigration({
              accessToken,
              projectRef,
              sql: migration.sql,
            });
            if (!result.ok) {
              throw new Error(
                `Migration "${migration.name}" failed: ${result.error ?? "unknown error"}`,
              );
            }
          }
        }

        // ── Optional: deploy AI-authored edge functions ──
        if (body.pendingEdgeFunctions?.length) {
          await send(
            "deploying_functions",
            `Deploying ${body.pendingEdgeFunctions.length} edge function${body.pendingEdgeFunctions.length === 1 ? "" : "s"}...`,
          );
          for (const fn of body.pendingEdgeFunctions) {
            const result = await deployEdgeFunction({
              accessToken,
              projectRef,
              slug: fn.slug,
              entrypointSource: fn.entrypointSource,
              importMap: fn.importMap,
            });
            if (!result.ok) {
              throw new Error(
                `Edge function "${fn.slug}" failed to deploy: ${result.error ?? "unknown error"}`,
              );
            }
          }
        }

        await send("storing", "Storing credentials securely...");

        const url = `https://${projectRef}.supabase.co`;

        await credentialVault.store({
          workspaceId,
          userId,
          integrationId: "supabase",
          scope: "project",
          projectId: body.projectId,
          authType: "custom_auth",
          credentials: {
            url,
            apiKey: serviceRole,
            anonKey: anon,
            serviceRoleKey: serviceRole,
            dbPassword,
          },
          displayName: `Supabase: ${finalName}`,
          metadata: {
            projectRef,
            region: body.region,
            orgId: body.orgId,
            connectedVia: "provisioner",
            provisionedAt: new Date().toISOString(),
          },
        });

        // Restart the dev server so the vault-bridge picks up the new credentials.
        try {
          const { restartDevServer, isRunning } = await import("../../../projects/dev-server.js");
          if (isRunning(body.projectId)) {
            await restartDevServer(body.projectId, { userId });
          }
        } catch { /* non-critical */ }

        await send("done", `Supabase project "${finalName}" is ready.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await stream.writeSSE({
          data: JSON.stringify({
            type: "provision_progress",
            data: { phase: "error", message: msg },
          }),
        });
      } finally {
        activeProvisions.delete(userId);
        await stream.writeSSE({ data: "[DONE]" });
      }
    });
  },
);
