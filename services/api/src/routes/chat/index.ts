/**
 * Chat route index — thin router that mounts all sub-modules.
 * Re-exports chatRoutes and getChatSessionsSnapshot for external consumers.
 */
import { Hono } from "hono";
import { authMiddleware, type AuthEnv } from "../../middleware/auth.js";
import { requireCredits } from "../../middleware/credits.js";
import { shareTrackingQueries } from "@doable/db";
import { sql } from "../../db/index.js";
import { registerSendHandler } from "./send-handler.js";
import { registerFixErrorRoute } from "./fix-error.js";
import { registerSuggestionsRoute } from "./suggestions.js";
import { registerQueueRoutes } from "./queue.js";
import { registerTraceRoutes } from "./traces.js";
import { registerMiscRoutes } from "./misc-routes.js";
import { rateLimiter } from "../../middleware/rate-limit.js";

export { getChatSessionsSnapshot } from "./session-state.js";

export const chatRoutes = new Hono<AuthEnv>();

const shareTrackingDb = shareTrackingQueries(sql);

// Require authentication for all chat and AI routes
chatRoutes.use("/projects/:id/chat", authMiddleware);
chatRoutes.use("/projects/:id/chat/*", authMiddleware);
chatRoutes.use("/ai/*", authMiddleware);

// ─── AI chat rate limiting (per-user, in-memory) ────────
// 20 chat sends per 2-minute window — prevents runaway compute usage.
// Uses userId from auth context for accurate per-user tracking.
const chatSendLimiter = rateLimiter({
  windowMs: 2 * 60_000,
  max: 20,
  keyGenerator: (c) => {
    const auth = c.req.header("authorization");
    return auth ? `chat:${auth.slice(-16)}` : `chat:${c.req.header("x-forwarded-for") ?? "unknown"}`;
  },
});
// 5 suggestion requests per minute
const suggestionLimiter = rateLimiter({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (c) => {
    const auth = c.req.header("authorization");
    return auth ? `suggest:${auth.slice(-16)}` : `suggest:${c.req.header("x-forwarded-for") ?? "unknown"}`;
  },
});
// Apply rate limiters to chat send + fix-error + suggestions
chatRoutes.use("/projects/:id/chat", async (c, next) => {
  if (c.req.method === "POST") return chatSendLimiter(c, next);
  return next();
});
chatRoutes.use("/projects/:id/chat/fix-error", chatSendLimiter);
chatRoutes.use("/projects/:id/chat/suggestions", suggestionLimiter);

// Credit check: require at least 1 credit before allowing AI chat
chatRoutes.use("/projects/:id/chat", async (c, next) => {
  if (c.req.method === "POST") return requireCredits(1)(c, next);
  return next();
});
chatRoutes.use("/projects/:id/chat/fix-error", requireCredits(1));

// Auto-join: when a user accesses chat, add as collaborator ONLY if link sharing enabled
chatRoutes.use("/projects/:id/chat", async (c, next) => {
  const projectId = c.req.param("id");
  const userId = c.get("userId");
  if (projectId && userId) {
    try {
      const [project] = await sql`SELECT visibility, workspace_id FROM projects WHERE id = ${projectId}`;
      if (project?.visibility === 'public') {
        await sql`
          INSERT INTO project_collaborators (project_id, user_id, role)
          VALUES (${projectId}, ${userId}, 'editor')
          ON CONFLICT DO NOTHING
        `;
        const [isMember] = await sql`
          SELECT 1 FROM workspace_members
          WHERE workspace_id = ${project.workspace_id} AND user_id = ${userId}
        `;
        if (!isMember) {
          await shareTrackingDb.recordVisit(projectId, userId);
          await sql`
            UPDATE public_projects SET view_count = view_count + 1
            WHERE project_id = ${projectId}
          `;
        }
      }
    } catch { /* non-critical */ }
  }
  await next();
});

// Mount all route modules
registerSendHandler(chatRoutes);
registerFixErrorRoute(chatRoutes);
registerSuggestionsRoute(chatRoutes);
registerQueueRoutes(chatRoutes);
registerTraceRoutes(chatRoutes);
registerMiscRoutes(chatRoutes);
