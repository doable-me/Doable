/**
 * Shared auth helpers for app-runtime HTTP routes.
 */

import type { Context } from "hono";
import {
  resolveAuth,
  rateLimitOk,
  getEffectiveRateLimit,
  type ResolvedAuth,
} from "../../routes/connector-proxy.js";
import { verifyAppSession, readAppSessionToken } from "../../routes/app-auth.js";

export function jsonError(c: Context, status: number, code: string, message?: string) {
  return c.json({ ok: false, error: { code, message: message ?? code } }, status as 400);
}

export async function requireRuntimeAuth(
  c: Context,
): Promise<ResolvedAuth | Response> {
  if (c.req.header("x-doable-data-api") !== "1") {
    return jsonError(c, 400, "PARAMS_INVALID", "Missing X-Doable-Data-Api: 1");
  }
  const auth = await resolveAuth(c);
  if (auth instanceof Response) return auth;
  let max: number | null = auth.rateLimit;
  try {
    max = await getEffectiveRateLimit(auth.projectId, auth.rateLimit);
  } catch {
    /* use default */
  }
  if (!rateLimitOk(auth.projectId, max)) {
    return jsonError(c, 429, "RATE_LIMITED");
  }
  return auth;
}

export async function resolveAppUserId(
  c: Context,
  auth: ResolvedAuth,
): Promise<string> {
  const sessionToken = readAppSessionToken(c);
  if (sessionToken) {
    const claims = await verifyAppSession(sessionToken, auth.projectId);
    if (claims) return claims.sub;
  }
  const trustedBackend = auth.authMode === "api-key" && auth.tier === "server";
  if (trustedBackend) {
    return c.req.header("x-doable-app-user") ?? auth.userId ?? "";
  }
  return auth.userId ?? "";
}

export function resolveCaller(
  auth: ResolvedAuth,
): "end_user" | "workflow" | "api_key" {
  if (auth.authMode === "api-key") return "api_key";
  return "end_user";
}

export type { ResolvedAuth };
