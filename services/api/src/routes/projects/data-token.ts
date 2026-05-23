/**
 * POST /projects/:id/data-token
 *
 * Mints a short-lived (15 min) project JWT for the settings-UI Database tab.
 * The JWT carries kind="connector-proxy" so it is accepted by the existing
 * /__doable/data/* auth path without any changes to the verifier.
 *
 * Auth: this router is mounted standalone at `/projects` (gated behind
 * DOABLE_APP_DB_ENABLED in routes.ts), separate from the main projectRoutes
 * router, so it must apply the session/RLS auth middleware itself —
 * otherwise c.get("userId") is undefined and requireProjectAccess() blows up
 * with a postgres UNDEFINED_VALUE error.
 *
 * Export: dataTokenRoutes — mounted at app.route("/projects", ...) in routes.ts.
 */

import { Hono } from "hono";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls } from "../../middleware/rls.js";
import { signProjectJwt } from "../../auth/project-jwt.js";
import { PROJECT_JWT_SECRET } from "../../lib/secrets.js";
import { requireProjectAccess, validateProjectIdParam } from "./helpers.js";

export const dataTokenRoutes = new Hono<AuthEnv>({ strict: false });

// Resolve the session → userId (+ RLS context) before any handler runs. This
// router is NOT a child of projectRoutes, so it does not inherit that auth.
dataTokenRoutes.use("*", authMiddlewareWithRls);
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
