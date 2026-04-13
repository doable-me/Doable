import { createMiddleware } from "hono/factory";
import { recordSpan } from "../integrations/xray.js";

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
  /** Custom key extractor (defaults to IP) */
  keyGenerator?: (c: { req: { header: (name: string) => string | undefined } }) => string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limiter middleware.
 *
 * For production with multiple instances, swap this with a Redis-backed
 * implementation using INCR + EXPIRE.
 */
export function rateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyGenerator } = options;
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }, windowMs * 2);

  // Allow the timer to not keep the process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return createMiddleware(async (c, next) => {
    const key =
      keyGenerator?.(c) ??
      c.req.header("x-forwarded-for") ??
      c.req.header("x-real-ip") ??
      "unknown";

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetSeconds));

    if (entry.count > max) {
      c.header("Retry-After", String(resetSeconds));
      recordSpan({
        source: "docore",
        id: crypto.randomUUID(),
        name: "rate_limit.blocked",
        startedAt: now,
        endedAt: now,
        durationMs: 0,
        status: "error",
        error: "rate_limited",
        attributes: { key, path: c.req.path, method: c.req.method, count: entry.count, max },
      });
      return c.json(
        { error: "Too many requests, please try again later." },
        429
      );
    }

    await next();
  });
}
