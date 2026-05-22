import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.js";
import { sql } from "../db/index.js";
import { featureFlagQueries } from "@doable/db";

const featureFlags = featureFlagQueries(sql);

/**
 * Middleware that requires the authenticated user to be a platform admin.
 * Must be used AFTER authMiddleware.
 */
export const platformAdminMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const userId = c.get("userId");

  if (!userId || userId === "anonymous") {
    return c.json({ error: "Authentication required" }, 401);
  }

  const isAdmin = await featureFlags.isPlatformAdmin(userId);

  if (!isAdmin) {
    return c.json({ error: "Platform admin access required" }, 403);
  }

  await next();
});
