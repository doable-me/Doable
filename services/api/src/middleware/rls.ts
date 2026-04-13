/**
 * RLS Context Middleware — sets the PostgreSQL session variable
 * `doable.current_user_id` so Row-Level Security policies can
 * enforce per-user data isolation at the database level.
 *
 * Must run AFTER authMiddleware (which sets userId on the context).
 * Uses SET LOCAL inside a transaction for request-scoped isolation.
 */
import { createMiddleware } from "hono/factory";
import { sql } from "../db/index.js";
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
