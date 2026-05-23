/**
 * POST /projects/:id/data-token
 *
 * Mints a short-lived (15 min) project JWT for the settings-UI Database tab.
 * The JWT carries kind="connector-proxy" so it is accepted by the existing
 * /__doable/data/* auth path without any changes to the verifier.
 *
 * Auth: standard user-session middleware applied by the parent projectRoutes
 * router (authMiddlewareWithRls). Do NOT mount this router standalone.
 *
 * Export: dataTokenRoutes — the integrator mounts it in projects.ts.
 */

import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import { signProjectJwt } from "../../auth/project-jwt.js";
import { PROJECT_JWT_SECRET } from "../../lib/secrets.js";
import { requireProjectAccess, validateProjectIdParam } from "./helpers.js";

export const dataTokenRoutes = new Hono<AuthEnv>({ strict: false });

dataTokenRoutes.use("/:id", validateProjectIdParam());
dataTokenRoutes.use("/:id/*", validateProjectIdParam());

// ─── Exported mint helper (testable without Hono) ───────────

export async function mintDataToken(
  projectId: string,
  workspaceId: string,
  userId: string,
): Promise<{ token: string; expiresIn: number }> {
  const LIFETIME_SEC = 15 * 60;
  const token = await signProjectJwt(
    {
      projectId,
      workspaceId,
      userId,
      kind: "connector-proxy",
    },
    PROJECT_JWT_SECRET,
    LIFETIME_SEC,
  );
  return { token, expiresIn: LIFETIME_SEC };
}

// ─── Route ──────────────────────────────────────────────────

dataTokenRoutes.post("/:id/data-token", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");

  const access = await requireProjectAccess(userId, id);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }

  const result = await mintDataToken(id, access.project.workspace_id, userId);
  return c.json(result);
});
