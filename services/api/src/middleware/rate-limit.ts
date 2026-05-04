import { createMiddleware } from "hono/factory";
import { recordSpan } from "../integrations/xray.js";
import { getKVStore } from "@doable/shared/kv-store.js";

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
  /** Custom key extractor (defaults to IP) */
  keyGenerator?: (c: { req: { header: (name: string) => string | undefined } }) => string;
  /** Namespace prefix for KV keys (avoids collisions) */
  prefix?: string;
}

/**
 * Rate limiter middleware backed by the shared KV store.
 *
 * In-memory by default; Redis-backed when REDIS_URL is set.
 */
export function rateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyGenerator, prefix = "rl" } = options;

  // max=0 → middleware is a no-op. Lets operators disable rate limiting via
  // RATE_LIMIT_MAX=0 when an upstream limiter (Cloudflare, nginx, ALB) is
  // already in place.
  if (max <= 0) {
    return createMiddleware(async (_c, next) => { await next(); });
  }

  const kv = getKVStore();

  return createMiddleware(async (c, next) => {
    const key =
      keyGenerator?.(c) ??
      c.req.header("x-forwarded-for") ??
      c.req.header("x-real-ip") ??
      "unknown";

    const kvKey = `${prefix}:${key}`;
    const count = await kv.incr(kvKey, windowMs);

    const remaining = Math.max(0, max - count);
    const resetSeconds = Math.ceil(windowMs / 1000);

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(resetSeconds));

    if (count > max) {
      c.header("Retry-After", String(resetSeconds));
      recordSpan({
        source: "docore",
        id: crypto.randomUUID(),
        name: "rate_limit.blocked",
        startedAt: Date.now(),
        endedAt: Date.now(),
        durationMs: 0,
        status: "error",
        error: "rate_limited",
        attributes: { key, path: c.req.path, method: c.req.method, count, max },
      });
      return c.json(
        { error: "Too many requests, please try again later." },
        429
      );
    }

    await next();
  });
}
