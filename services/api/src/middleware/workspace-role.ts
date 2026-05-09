import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.js";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import { WORKSPACE_ROLES, type WorkspaceRole } from "@doable/shared";

const workspaces = workspaceQueries(sql);

/**
 * RFC 4122 UUID shape (any version, any variant). We validate at the route
 * boundary so callers passing malformed ids get a clean 400 instead of the
 * driver throwing `invalid input syntax for type uuid` and surfacing as 500.
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Role hierarchy for workspace access.
 * Lower index = higher privilege.
 */
const ROLE_HIERARCHY: WorkspaceRole[] = [...WORKSPACE_ROLES].reverse();

/**
 * Factory that returns a Hono middleware requiring the authenticated user
 * to hold at least `minRole` on the workspace identified by `:id` in the URL.
 *
 * Must be used AFTER authMiddleware.
 *
 * Usage:
 *   workspaceRoutes.patch("/:id/members/:userId", requireRole("owner"), handler)
 */
export function requireRole(minRole: WorkspaceRole) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const userId = c.get("userId");
    const workspaceId = c.req.param("id");

    if (!userId || userId === "anonymous") {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!workspaceId) {
      return c.json({ error: "Workspace ID required" }, 400);
    }

    if (!UUID_REGEX.test(workspaceId)) {
      return c.json({ error: "Invalid workspace id" }, 400);
    }

    const role = await workspaces.getMemberRole(workspaceId, userId);

    if (!role) {
      return c.json({ error: "Not a member of this workspace" }, 403);
    }

    const userLevel = ROLE_HIERARCHY.indexOf(role);
    const requiredLevel = ROLE_HIERARCHY.indexOf(minRole);

    if (userLevel > requiredLevel) {
      return c.json(
        { error: `Requires ${minRole} role or higher` },
        403
      );
    }

    await next();
  });
}
