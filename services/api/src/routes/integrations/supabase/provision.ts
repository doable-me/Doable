/**
 * Supabase platform-managed provisioning routes (Phase 2A).
 *
 * Exposes the "Lovable-style one-click Supabase project" flow:
 *
 *   - GET  /api/integrations/supabase/orgs
 *         Lists orgs the user's supabase-mgmt OAuth grant can create
 *         projects in. Powers the org picker in the chat dialog.
 *
 *   - POST /api/integrations/supabase/provision
 *         SSE stream. Creates a brand-new Supabase project under the
 *         user's own organization, waits for it to become healthy,
 *         fetches API keys, optionally runs AI-authored migrations and
 *         deploys edge functions, then writes a project-scoped
 *         `integration_connection`. Phase 1's vault-bridge then picks
 *         the new connection up on the next chat turn — no further
 *         env-var wiring needed here.
 *
 * HARD RULES:
 *   - Never log credential values (db_password, api_keys, access_tokens).
 *   - Never delete a Supabase project automatically — orphaned projects
 *     keep the user's data. The user can clean up via the dashboard.
 *   - Service role key MUST NOT be VITE_-prefixed — the vault-bridge
 *     enforces this; we just hand it the raw value under the well-known
 *     `serviceRoleKey` credential field and the envKeyMap does the rest.
 *   - Reuse the `integration_connections` table — no new schema.
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { sql } from "../../../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../../../middleware/auth.js";
import { credentialVault } from "../../../integrations/credential-vault.js";
import {
  createProject,
  waitForActive,
  getApiKeys,
  listOrganizations,
} from "../../../integrations/supabase/provisioner.js";
import { runMigration } from "../../../integrations/supabase/migrate.js";
import { deployEdgeFunction } from "../../../integrations/supabase/edge-functions.js";

const workspaces = workspaceQueries(sql);

export const supabaseProvisionRoutes = new Hono<AuthEnv>();

// ─── Concurrency lock ──────────────────────────────────────
//
// Rate-limit: at most one in-flight Supabase provision per user.
// In-memory is fine for the ~100 user scale per CLAUDE.md (no Redis).
// If the API server restarts while a provision is in flight, the lock
// resets — that is acceptable: the Supabase Management API is idempotent
// on project refs, and a new request would simply create a distinct new
// project (worst case: one orphaned project, which we never auto-delete).
const activeProvisions = new Set<string>();

// ─── Helpers ──────────────────────────────────────────────

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}

/**
 * Get the user's stored `supabase-mgmt` OAuth access token (from the
 * enhanced auth flow). Returns null when the user has not yet signed in
 * with Supabase — the caller must surface `supabase_oauth_required`.
 */
async function getMgmtAccessToken(
  userId: string,
  workspaceId: string,
): Promise<string | null> {
  const conn = await credentialVault.get(userId, "supabase-mgmt", workspaceId);
  if (!conn) return null;
  const creds = conn.credentials as Record<string, unknown> | null;
  const token =
    (creds?.access_token as string | undefined) ??
    (creds?.accessToken as string | undefined);
  return token ?? null;
}

// ─── GET /api/integrations/supabase/orgs ──────────────────

supabaseProvisionRoutes.get(
  "/api/integrations/supabase/orgs",
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
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        500,
      );
    }
  },
);

// ─── POST /api/integrations/supabase/provision ────────────

const provisionSchema = z.object({
  projectId: z.string().uuid(),
  orgId: z.string().min(1),
  region: z.string().min(1),
  name: z.string().max(100).optional(),
  /**
   * Optional pre-staged migrations (AI-authored `.sql` blocks) that should
   * run right after the project becomes healthy. Kept as a simple array for
   * now; Phase 2B adds a first-class `apply_migration` tool that drops
   * files under `supabase/migrations/` for git tracking.
   */
  pendingMigrations: z
    .array(
      z.object({
        name: z.string().min(1),
        sql: z.string().min(1),
      }),
    )
    .optional(),
  /**
   * Optional pre-staged edge functions to deploy right after migrations.
   */
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

supabaseProvisionRoutes.post(
  "/api/integrations/supabase/provision",
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

    // One in-flight provision per user. Return 429 instead of queueing —
    // the chat UI can surface a friendly "already provisioning" message.
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

        // ── Store as a project-scoped `supabase` connection. Phase 1's
        //    vault-bridge picks this up on the next chat turn and exposes
        //    VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
        //    according to the registry envKeyMap. ──
        await send("storing", "Storing credentials securely...");

        const url = `https://${projectRef}.supabase.co`;

        // NOTE: if the Doable project is later deleted, we intentionally
        // leave the linked Supabase project running — the user keeps their
        // data and can reattach or clean up via the Supabase dashboard.
        await credentialVault.store({
          workspaceId,
          userId,
          integrationId: "supabase",
          scope: "project",
          projectId: body.projectId,
          authType: "custom_auth",
          credentials: {
            url,
            // `apiKey` mirrors the manual-entry path (service role gives full
            // access; @activepieces/piece-supabase reads this field).
            apiKey: serviceRole,
            anonKey: anon,
            serviceRoleKey: serviceRole,
            // dbPassword is persisted encrypted at rest so the user can
            // recover it from their connected-integrations admin UI if
            // they ever need direct psql access. It is NEVER echoed back
            // to the AI and the vault-bridge has no env mapping for it.
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
