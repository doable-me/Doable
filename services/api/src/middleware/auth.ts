import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../lib/jwt.js";
import * as jose from "jose";

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  iat: number;
  exp: number;
}

export interface AuthEnv {
  Variables: {
    userId: string;
    userEmail: string;
    jwtPayload: JwtPayload;
  };
}

/**
 * Middleware that verifies a JWT Bearer token and injects user info into context.
 */
export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token);

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!payload.sub || !payload.email || !UUID_RE.test(payload.sub)) {
      return c.json({ error: "Invalid token payload" }, 401);
    }

    c.set("userId", payload.sub);
    c.set("userEmail", payload.email);
    c.set("jwtPayload", payload as unknown as JwtPayload);

    await next();
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      return c.json({ error: "Token expired" }, 401);
    }
    return c.json({ error: "Invalid token" }, 401);
  }
});

/**
 * Optional auth middleware — extracts user info from JWT if present,
 * but allows the request to proceed even without authentication.
 * Sets userId to "anonymous" when no valid token is provided.
 */
export const optionalAuthMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const payload = await verifyAccessToken(token);

      if (payload.sub && payload.email) {
        c.set("userId", payload.sub);
        c.set("userEmail", payload.email);
        c.set("jwtPayload", payload as unknown as JwtPayload);
        await next();
        return;
      }
    } catch {
      // Token invalid or expired — fall through to anonymous
    }
  }

  // No auth or invalid auth — proceed as anonymous
  c.set("userId", "anonymous");
  c.set("userEmail", "");
  c.set("jwtPayload", { sub: "anonymous", email: "", iat: 0, exp: 0 } as JwtPayload);
  await next();
});
