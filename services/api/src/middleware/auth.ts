import { createMiddleware } from "hono/factory";
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

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-me"
);
const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";

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
    const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
    });

    const jwtPayload = payload as unknown as JwtPayload;

    if (!jwtPayload.sub || !jwtPayload.email) {
      return c.json({ error: "Invalid token payload" }, 401);
    }

    c.set("userId", jwtPayload.sub);
    c.set("userEmail", jwtPayload.email);
    c.set("jwtPayload", jwtPayload);

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
      const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
        issuer: JWT_ISSUER,
      });

      const jwtPayload = payload as unknown as JwtPayload;

      if (jwtPayload.sub && jwtPayload.email) {
        c.set("userId", jwtPayload.sub);
        c.set("userEmail", jwtPayload.email);
        c.set("jwtPayload", jwtPayload);
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

/**
 * Sign a new JWT access token for a user.
 */
export async function signAccessToken(
  userId: string,
  email: string
): Promise<string> {
  const expiresIn = process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ?? "15m";

  return new jose.SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

/**
 * Sign a new JWT refresh token for a user.
 */
export async function signRefreshToken(userId: string): Promise<string> {
  const expiresIn = process.env.JWT_REFRESH_TOKEN_EXPIRES_IN ?? "7d";

  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a token without middleware context.
 */
export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
  });
  return payload as unknown as JwtPayload;
}
