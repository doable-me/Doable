import * as jose from "jose";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  iat: number;
  exp: number;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "fallback-dev-secret-change-me"
);
const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "fallback-dev-secret-change-me") {
  console.warn("[SECURITY] JWT_SECRET is not set or is using the default fallback. Set a strong secret in production!");
}

/**
 * Sign a short-lived access token (15 minutes).
 */
export async function signAccessToken(
  userId: string,
  email: string
): Promise<string> {
  return new jose.SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ?? "15m")
    .sign(JWT_SECRET);
}

/**
 * Sign a long-lived refresh token (7 days).
 */
export async function signRefreshToken(userId: string): Promise<string> {
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_REFRESH_TOKEN_EXPIRES_IN ?? "7d")
    .sign(JWT_SECRET);
}

/**
 * Verify and decode an access token.
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
  });
  return payload as unknown as AccessTokenPayload;
}

/**
 * Verify and decode a refresh token.
 */
export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
  });
  return payload as unknown as RefreshTokenPayload;
}
