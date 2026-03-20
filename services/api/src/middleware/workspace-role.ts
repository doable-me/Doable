import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.js";
import { sql } from "../db/index.js";
import { workspaceQueries } from "@doable/db";
import type { WorkspaceRole } from "@doable/shared";

const workspaces = workspaceQueries(sql);

/**
 * Role hierarchy for workspace access.
 * Lower index = higher privilege.
 */
const ROLE_HIERARCHY: WorkspaceRole[] = ["owner", "admin", "member", "viewer"];

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
