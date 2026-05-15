import { createMiddleware } from "hono/factory";
import { recordSpan } from "../integrations/xray.js";
import { getKVStore } from "@doable/shared/kv-store.js";

interface RateLimitOptions {
  /** Time window in milliseconds */
  windowMs: number;
  /** Max requests per window */
  max: number;
  /** Custom key extractor (defaults to trusted-source IP) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyGenerator?: (c: any) => string;
  /** Namespace prefix for KV keys (avoids collisions) */
  prefix?: string;
}

/**
 * Resolve the client IP from a trusted source.
 *
 * BUG-CORPUS-SEC-001 (rate-limit bypass): we previously keyed on
 * `x-forwarded-for`, which is client-supplied. An attacker rotating XFF
 * trivially evades the limiter. Behind Cloudflare Tunnel, the inner-most
 * XFF entry is attacker-controlled — only `cf-connecting-ip` (set by
 * Cloudflare) is trustworthy. For non-CF deployments we fall back to
 * `x-real-ip` (typical reverse-proxy convention) and finally the actual
 * connecting socket address from `c.env.incoming.socket`.
 *
 * We deliberately do NOT honour raw XFF here. Operators who run behind a
 * trusted proxy that strips XFF can plumb its address in via `x-real-ip`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTrustedClientIp(c: any): string {
  // 1. Cloudflare Tunnel (production) — set by the CF edge, cannot be spoofed
  //    upstream because cloudflared overwrites it on every request.
  const cf = c.req?.header?.("cf-connecting-ip");
  if (cf && typeof cf === "string" && cf.length > 0) return cf.trim();

  // 2. Reverse-proxy convention (nginx, Caddy in some configs)
  const real = c.req?.header?.("x-real-ip");
  if (real && typeof real === "string" && real.length > 0) return real.trim();

  // 3. Direct socket address. Hono on Node exposes the underlying request via
  //    `c.env.incoming` (see @hono/node-server). Guard everything because the
  //    runtime shape varies (Bun, Deno, edge), and never let a missing field
  //    fall back to client headers.
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming;
  const sock = incoming?.socket?.remoteAddress;
  if (sock && typeof sock === "string" && sock.length > 0) return sock;

  return "unknown";
}

// Operator-level kill switch: when RATE_LIMIT_DISABLED is truthy ("true"/"1"/"yes"),
// every rateLimiter() instance is a no-op. Used during QA campaigns so the matrix
// can hammer auth/login/chat endpoints without 429-flooding. Upstream CF Tunnel
// rate-limit + MFA + JWT verify + RLS + CSP are all independent and unaffected.
// FAIL-CLOSED in production: if RATE_LIMIT_DISABLED is set when NODE_ENV is
// production, the API refuses to start. This prevents a misconfigured .env
// from silently disabling brute-force protection on login/forgot-password/
// MFA verify in prod (architect verification P3 follow-up).
const RATE_LIMIT_DISABLED = ["true", "1", "yes"].includes(
  (process.env.RATE_LIMIT_DISABLED ?? "").toLowerCase()
);
if (RATE_LIMIT_DISABLED) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[rate-limit] RATE_LIMIT_DISABLED=true is set with NODE_ENV=production. " +
        "Refusing to start — this would disable login/forgot-password/MFA " +
        "brute-force protection in prod. Unset RATE_LIMIT_DISABLED in your .env " +
        "or set NODE_ENV=development if this is a non-prod environment."
    );
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[rate-limit] RATE_LIMIT_DISABLED=true — every rateLimiter() is a no-op. " +
      "Intended for QA on dev only. Production startup will refuse if this is set."
  );
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
  // RATE_LIMIT_DISABLED=true → all instances no-op (QA kill switch).
  if (max <= 0 || RATE_LIMIT_DISABLED) {
    return createMiddleware(async (_c, next) => { await next(); });
  }

  const kv = getKVStore();

  return createMiddleware(async (c, next) => {
    // BUG-CORPUS-SEC-001: never key on client-supplied XFF. Use the trusted
    // resolver, which prefers cf-connecting-ip → x-real-ip → socket addr.
    const key = keyGenerator?.(c) ?? getTrustedClientIp(c);

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
