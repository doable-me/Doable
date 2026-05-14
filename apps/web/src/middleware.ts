/**
 * BUG-ADMIN-009: server-side gate for /admin/* pages.
 *
 * The original /admin page was a `"use client"` component that fetched
 * /auth/me on mount and conditionally rendered an "Access Denied" stub when
 * the user wasn't a platform admin. That meant the full admin HTML (panel
 * scaffold, role lists, internal links, framework names, plan-defaults UI)
 * was shipped to every visitor — anyone could GET https://dev.doable.me/admin
 * and read the markup directly with `curl`, no token required.
 *
 * This middleware runs on the Next.js edge before any admin page renders.
 * For /admin and /admin/*:
 *   1. Read the `doable_access_token` cookie (mirrored from localStorage at
 *      sign-in time by storeTokens() in lib/api-core.ts).
 *   2. Call the API /auth/me endpoint with that bearer token.
 *   3. Allow the request only when /auth/me returns isPlatformAdmin: true.
 *   4. Otherwise redirect to /login with ?next=<original-path>.
 *
 * We intentionally do not decode the JWT locally — the JWT_SECRET lives in
 * the API process, not the Next.js edge runtime, and the platform-admin bit
 * isn't in the JWT payload anyway (it's a DB column, see /auth/me handler).
 */

import { NextResponse, type NextRequest } from "next/server";

const TOKEN_COOKIE = "doable_access_token";

interface AuthMeResponse {
  user?: { id?: string; email?: string; isPlatformAdmin?: boolean };
}

function loginRedirect(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(next)}`;
  const res = NextResponse.redirect(url);
  // Defense in depth: clear any stale cookie on the client so a refresh
  // doesn't loop through the same failed check.
  res.cookies.set({
    name: TOKEN_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
    sameSite: "lax",
  });
  return res;
}

async function verifyPlatformAdmin(req: NextRequest, token: string): Promise<boolean> {
  // Prefer an explicit server-side API URL when set (lets the edge talk to a
  // private hostname different from NEXT_PUBLIC_API_URL). Fall back to the
  // public URL so single-host dev/prod setups Just Work.
  const apiUrl =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:4000";
  try {
    const resp = await fetch(`${apiUrl.replace(/\/+$/, "")}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        // The edge runtime needs an explicit accept header for some upstreams.
        Accept: "application/json",
      },
      // Edge runtime fetch doesn't support keepalive in middleware; let it
      // open a fresh connection each time. Caching is handled per-request.
      cache: "no-store",
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as AuthMeResponse;
    return data?.user?.isPlatformAdmin === true;
  } catch {
    // Fail closed on network/timeout — better to bounce to login than to
    // accidentally serve admin HTML when /auth/me is unreachable.
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(TOKEN_COOKIE)?.value;
  if (!token) {
    return loginRedirect(req);
  }
  const isAdmin = await verifyPlatformAdmin(req, token);
  if (!isAdmin) {
    return loginRedirect(req);
  }
  return NextResponse.next();
}

export const config = {
  // Run on /admin and every /admin/* subpath. Exclude Next.js internals and
  // static files implicitly — they don't match this pattern.
  matcher: ["/admin", "/admin/:path*"],
};
