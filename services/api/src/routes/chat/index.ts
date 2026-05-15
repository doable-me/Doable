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
import { registerMcpCallRoute } from "./mcp-call.js";
import { rateLimiter, getTrustedClientIp } from "../../middleware/rate-limit.js";

export { getChatSessionsSnapshot } from "./session-state.js";

export const chatRoutes = new Hono<AuthEnv>({ strict: false });

const shareTrackingDb = shareTrackingQueries(sql);

// Require authentication for all chat and AI routes
chatRoutes.use("/projects/:id/chat", authMiddleware);
chatRoutes.use("/projects/:id/chat/*", authMiddleware);
chatRoutes.use("/ai/*", authMiddleware);

// ─── AI chat rate limiting (per-user, in-memory) ────────
// Tunable via env so operators can raise limits for power users / load-test
// runs without a code change. Defaults below match the historical behavior
// (~10 sends/min ≈ 20/2min) but skewed friendlier for authenticated users.
//
//   CHAT_RATE_LIMIT_PER_MIN     authed cap, default 30 (was effectively 10)
//   CHAT_RATE_LIMIT_ANON_PER_MIN unauthed cap, default 5
//   SUGGEST_RATE_LIMIT_PER_MIN  suggestion cap, default 10
//   CHAT_RATE_LIMIT_BYPASS_ADMIN  "1" (default) skips limits for is_platform_admin
//
// Set any to 0 to fully disable that bucket (rateLimiter() short-circuits on max<=0).
const envInt = (name: string, fallback: number): number => {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};
const CHAT_LIMIT_AUTHED = envInt("CHAT_RATE_LIMIT_PER_MIN", 30);
const CHAT_LIMIT_ANON = envInt("CHAT_RATE_LIMIT_ANON_PER_MIN", 5);
const SUGGEST_LIMIT = envInt("SUGGEST_RATE_LIMIT_PER_MIN", 10);
const ADMIN_BYPASS = (process.env.CHAT_RATE_LIMIT_BYPASS_ADMIN ?? "1") !== "0";

// Per-userId limiter (auth runs before this — userId is set on the context).
// Falls back to IP for the anon path.
const chatSendLimiterAuthed = rateLimiter({
  windowMs: 60_000,
  max: CHAT_LIMIT_AUTHED,
  prefix: "chat-u",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyGenerator: (c: any) => {
    const userId = c.get?.("userId") ?? c.req.header("authorization")?.slice(-16) ?? "unknown";
    return `u:${userId}`;
  },
});
const chatSendLimiterAnon = rateLimiter({
  windowMs: 60_000,
  max: CHAT_LIMIT_ANON,
  prefix: "chat-ip",
  // BUG-CORPUS-SEC-001: must not trust client-supplied XFF for keying.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyGenerator: (c: any) => `ip:${getTrustedClientIp(c)}`,
});
const suggestionLimiter = rateLimiter({
  windowMs: 60_000,
  max: SUGGEST_LIMIT,
  prefix: "suggest-u",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyGenerator: (c: any) => {
    const userId = c.get?.("userId");
    if (userId && userId !== "anonymous") return `u:${userId}`;
    return `ip:${getTrustedClientIp(c)}`;
  },
});

// Cache platform-admin lookups for 60s to keep the bypass cheap on long
// conversations. Negative results are cached too so non-admin users don't
// hammer the DB on every send.
const adminBypassCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();
async function isPlatformAdminCached(userId: string): Promise<boolean> {
  if (!ADMIN_BYPASS) return false;
  const now = Date.now();
  const hit = adminBypassCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.isAdmin;
  try {
    const [row] = await sql<{ is_platform_admin: boolean }[]>`
      SELECT is_platform_admin FROM users WHERE id = ${userId}
    `;
    const isAdmin = !!row?.is_platform_admin;
    adminBypassCache.set(userId, { isAdmin, expiresAt: now + 60_000 });
    return isAdmin;
  } catch {
    return false;
  }
}

// Compose the chat limiter: bypass admins, then route to authed vs anon bucket.
// We intentionally type c/next as `any` here — Hono's Context<AuthEnv,...> is
// a strict generic that doesn't structurally match the loose Context the
// underlying rateLimiter middleware accepts. The inner limiters do the same
// thing internally; this wrapper just forwards.
/* eslint-disable @typescript-eslint/no-explicit-any */
const chatSendLimiter = async (c: any, next: any) => {
  const userId = c.get?.("userId") as string | undefined;
  if (userId && userId !== "anonymous" && await isPlatformAdminCached(userId)) {
    c.header("X-RateLimit-Bypass", "platform-admin");
    return next();
  }
  if (userId && userId !== "anonymous") {
    return chatSendLimiterAuthed(c, next);
  }
  return chatSendLimiterAnon(c, next);
};
/* eslint-enable @typescript-eslint/no-explicit-any */

// Apply rate limiters to chat send + fix-error + suggestions
chatRoutes.use("/projects/:id/chat", async (c, next) => {
  if (c.req.method === "POST") return chatSendLimiter(c, next);
  return next();
});
chatRoutes.use("/projects/:id/chat/fix-error", chatSendLimiter);
chatRoutes.use("/projects/:id/chat/suggestions", async (c, next) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (c as any).get?.("userId") as string | undefined;
  if (userId && userId !== "anonymous" && await isPlatformAdminCached(userId)) {
    c.header("X-RateLimit-Bypass", "platform-admin");
    return next();
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return suggestionLimiter(c as any, next);
});

// Credit check: require at least 1 credit before allowing AI chat
chatRoutes.use("/projects/:id/chat", async (c, next) => {
  if (c.req.method === "POST") return requireCredits(1)(c as never, next);
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
registerMcpCallRoute(chatRoutes);
