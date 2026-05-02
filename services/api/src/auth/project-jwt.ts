// PRD 10 (connector bridge): short-lived per-project JWTs that generated apps
// present to the connector proxy. Distinct from the user-facing access/refresh
// tokens in ../lib/jwt.ts (those carry sub=userId and are issued by the auth
// flow). These claim kind="connector-proxy" and bind to project + workspace.
//
// Library choice: services/api already depends on `jose` (^5.9.6) and the
// existing JWT helper at ../lib/jwt.ts uses jose with HS256. Reuse jose here
// for consistency rather than rolling a hand-written HMAC.

import * as jose from "jose";

export interface ProjectJwtClaims {
  projectId: string;
  workspaceId: string;
  userId?: string | undefined;
  kind: "connector-proxy";
  iat: number;
  exp: number;
}

const DEFAULT_LIFETIME_SEC = 15 * 60; // 15 min

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signProjectJwt(
  claims: Omit<ProjectJwtClaims, "iat" | "exp">,
  secret: string,
  lifetimeSec: number = DEFAULT_LIFETIME_SEC,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    projectId: claims.projectId,
    workspaceId: claims.workspaceId,
    kind: claims.kind,
  };
  if (claims.userId !== undefined) {
    payload["userId"] = claims.userId;
  }
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + lifetimeSec)
    .sign(secretKey(secret));
}

export async function verifyProjectJwt(
  token: string,
  secret: string,
): Promise<ProjectJwtClaims> {
  const { payload } = await jose.jwtVerify(token, secretKey(secret), {
    algorithms: ["HS256"],
  });
  const projectId = payload["projectId"];
  const workspaceId = payload["workspaceId"];
  const kind = payload["kind"];
  const userId = payload["userId"];
  const iat = payload.iat;
  const exp = payload.exp;
  if (
    typeof projectId !== "string" ||
    typeof workspaceId !== "string" ||
    kind !== "connector-proxy" ||
    typeof iat !== "number" ||
    typeof exp !== "number"
  ) {
    throw new Error("invalid project jwt claims");
  }
  return {
    projectId,
    workspaceId,
    kind,
    userId: typeof userId === "string" ? userId : undefined,
    iat,
    exp,
  };
}
