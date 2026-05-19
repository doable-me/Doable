import * as jose from "jose";
import { JWT_SECRET as JWT_SECRET_RAW, JWT_ISSUER } from "./secrets.js";

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

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

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
 *
 * Pins the accepted JWS algorithm to HS256. Without this, `jose.jwtVerify`
 * accepts any symmetric HMAC algorithm (HS384/HS512) when handed a symmetric
 * key — letting an attacker who knows JWT_SECRET present a token under an
 * algorithm we never signed with. We always sign with HS256 (see
 * `signAccessToken`), so tightening verify to HS256-only closes the
 * algorithm-confusion vector surfaced by R14 bulk TC sweep (TC-SEC-JWT-005).
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    algorithms: ["HS256"],
  });
  return payload as unknown as AccessTokenPayload;
}

/**
 * Verify and decode a refresh token. See `verifyAccessToken` for the
 * algorithm pin rationale.
 */
export async function verifyRefreshToken(
  token: string
): Promise<RefreshTokenPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    algorithms: ["HS256"],
  });
  return payload as unknown as RefreshTokenPayload;
}

// ─── MFA challenge token ────────────────────────────────────────────
//
// Issued by /auth/login (and the OAuth callback) when the user has a
// verified MFA factor. The frontend exchanges it for a real session by
// calling /auth/mfa/verify with the TOTP code or a recovery code.
// Short-lived (5 min) and scope-locked via the `purpose` claim so a
// stolen mfa challenge can't be used as a session.

export interface MfaChallengeTokenPayload {
  sub: string;
  purpose: "mfa_challenge";
  email: string;
  iat: number;
  exp: number;
}

export async function signMfaChallengeToken(
  userId: string,
  email: string,
): Promise<string> {
  return new jose.SignJWT({ email, purpose: "mfa_challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(JWT_SECRET);
}

export async function verifyMfaChallengeToken(
  token: string,
): Promise<MfaChallengeTokenPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    issuer: JWT_ISSUER,
    algorithms: ["HS256"],
  });
  const p = payload as unknown as MfaChallengeTokenPayload;
  if (p.purpose !== "mfa_challenge") {
    throw new Error("Not an MFA challenge token");
  }
  return p;
}
