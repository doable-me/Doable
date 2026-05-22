import { createMiddleware } from "hono/factory";
import type { AuthEnv } from "./auth.js";
import { sql } from "../db/index.js";
import { creditQueries } from "@doable/db/queries/credits";
import { workspaceQueries } from "@doable/db";

const credits = creditQueries(sql);
const workspacesQ = workspaceQueries(sql);

/**
 * Middleware that checks if the authenticated user has enough credits
 * before allowing an AI operation to proceed.
 *
 * Must be used AFTER authMiddleware.
 *
 * Sets `creditBalance` in context so downstream handlers can read it.
 * Returns 429 with credit info if insufficient credits.
 */
export function requireCredits(minCredits: number = 1) {
  return createMiddleware<
    AuthEnv & {
      Variables: {
        creditBalance: {
          daily_remaining: number;
          daily_total: number;
          monthly_remaining: number;
          monthly_total: number;
          rollover_credits: number;
          total_available: number;
          daily_reset_at: Date;
          monthly_reset_at: Date;
          plan_type: string;
        };
        creditWorkspaceId: string;
      };
    }
  >(async (c, next) => {
    const userId = c.get("userId");

    if (!userId || userId === "anonymous") {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Resolve workspace from query params, body, or project lookup
    let workspaceId: string | undefined;

    // Try query param first (for GET requests)
    workspaceId = c.req.query("workspaceId") ?? undefined;

    // Try to get from project ID in path (for chat routes)
    if (!workspaceId) {
      const projectId = c.req.param("id");
      if (projectId) {
        try {
          const [project] = await sql<[{ workspace_id: string }]>`
            SELECT workspace_id FROM projects WHERE id = ${projectId}
          `;
          workspaceId = project?.workspace_id;
        } catch {
          // Project not found — will fall through to user default workspace
        }
      }
    }

    // Fallback: resolve from user's default workspace (handles new/unsaved projects)
    if (!workspaceId) {
      try {
        const userWorkspaces = await workspacesQ.listByUser(userId);
        workspaceId = userWorkspaces.length > 0 ? userWorkspaces[0]!.id : undefined;
      } catch {
        // Workspace lookup failed
      }
    }

    if (!workspaceId) {
      return c.json({ error: "Could not determine workspace for credit check" }, 400);
    }

    try {
      const balance = await credits.getCreditBalance(userId, workspaceId);

      // Check if enterprise (unlimited)
      if (balance.plan_type === "enterprise") {
        c.set("creditBalance" as never, balance as never);
        c.set("creditWorkspaceId" as never, workspaceId as never);
        await next();
        return;
      }

      if (balance.total_available < minCredits) {
        return c.json(
          {
            error: "Insufficient credits",
            credits: {
              daily_remaining: balance.daily_remaining,
              daily_total: balance.daily_total,
              monthly_remaining: balance.monthly_remaining,
              monthly_total: balance.monthly_total,
              rollover_credits: balance.rollover_credits,
              total_available: balance.total_available,
              daily_reset_at: balance.daily_reset_at.toISOString(),
              monthly_reset_at: balance.monthly_reset_at.toISOString(),
              plan_type: balance.plan_type,
            },
          },
          429
        );
      }

      c.set("creditBalance" as never, balance as never);
      c.set("creditWorkspaceId" as never, workspaceId as never);
      await next();
    } catch (err) {
      console.error("[Credits] Failed to check credit balance:", err);
      // Allow request to proceed on credit system failure — don't block users
      // due to infrastructure issues
      await next();
    }
  });
}
