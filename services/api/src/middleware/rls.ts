/**
 * RLS Context Middleware — sets the PostgreSQL session variable
 * `doable.current_user_id` so Row-Level Security policies can
 * enforce per-user data isolation at the database level.
 *
 * Must run AFTER authMiddleware (which sets userId on the context).
 * Uses SET LOCAL inside a transaction for request-scoped isolation.
 */
import type postgres from "postgres";
import { createMiddleware } from "hono/factory";
import { sql, txAls } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "./auth.js";
import { recordSpan } from "../integrations/xray.js";

/**
 * Sets the RLS user context for the current request.
 * Call this in routes where RLS should be enforced.
 *
 * Note: Only effective inside sql.begin() transactions.
 * For standalone queries, call setRlsContext() directly.
 */
export const rlsMiddleware = createMiddleware(async (c, next) => {
  const userId = c.get("userId") as string | undefined;
  if (userId && userId !== "anonymous") {
    // Store for use by downstream transaction blocks
    c.set("rlsUserId", userId);
  }
  await next();
});

/**
 * Execute a callback inside a transaction with RLS context set.
 * Use this when you need RLS-enforced queries.
 *
 * @example
 * const rows = await withRls(userId, async (tx) => {
 *   return tx`SELECT * FROM projects`;
 * });
 */
export async function withRls<T>(
  userId: string | null | undefined,
  fn: (tx: typeof sql) => Promise<T>,
): Promise<T> {
  if (!userId) return fn(sql);

  const start = Date.now();
  try {
    const result = await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL "doable.current_user_id" = '${userId.replace(/'/g, "''")}'`);
      return fn(tx as unknown as typeof sql);
    }) as T;
    recordSpan({
      source: "docore",
      id: crypto.randomUUID(),
      name: "rls.transaction",
      startedAt: start,
      endedAt: Date.now(),
      durationMs: Date.now() - start,
      status: "ok",
      attributes: { userId },
    });
    return result;
  } catch (err) {
    recordSpan({
      source: "docore",
      id: crypto.randomUUID(),
      name: "rls.transaction",
      startedAt: start,
      endedAt: Date.now(),
      durationMs: Date.now() - start,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      attributes: { userId },
    });
    throw err;
  }
}

/**
 * Combined auth + RLS middleware. Verifies the JWT (via `authMiddleware`)
 * and then opens a request-scoped Postgres transaction with
 * `SET LOCAL "doable.current_user_id" = '<uuid>'` so the RLS policies
 * defined in migration 045 take effect for every `sql\`...\`` call
 * executed during the request. The tx is stashed in `txAls` and the
 * `sql` Proxy in db/index.ts dispatches to it transparently — callsites
 * don't need to change.
 *
 * Mount this in place of `authMiddleware` on route groups whose tables
 * are covered by RLS policies (workspaces, projects, integrations,
 * github). DO NOT mount on streaming endpoints (chat/AI/SSE) — each
 * request holds a DB connection for its full duration, and a streamed
 * response can run for minutes, which would exhaust the pool.
 *
 * Anonymous requests (`userId === "anonymous"`) skip the tx — the RLS
 * policies fall through their "current user unset → all rows visible"
 * branch, preserving backward compatibility.
 */
export const authMiddlewareWithRls = createMiddleware<AuthEnv>(async (c, next) => {
  return authMiddleware(c, async () => {
    const userId = c.get("userId");
    if (!userId || userId === "anonymous") {
      await next();
      return;
    }
    // userId is a UUID from a verified JWT (authMiddleware checked it). We
    // still single-quote-escape as defense-in-depth — `SET LOCAL` does not
    // support bound parameters in postgres.js.
    const escapedUserId = userId.replace(/'/g, "''");
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL "doable.current_user_id" = '${escapedUserId}'`);
      await txAls.run(tx as unknown as postgres.Sql, async () => {
        await next();
      });
    });
  });
});
