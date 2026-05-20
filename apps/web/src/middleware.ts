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

interface SetupStatusResponse {
  setupCompleted?: boolean;
  isPlatformAdmin?: boolean;
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

// Aligns with /setup/page.tsx: the canonical "needs setup" signal is
// `setup_completed_at IS NULL`. We deliberately do NOT key off "no AI
// providers" — once an admin has finished the wizard, deleting a provider
// (e.g. after an ENCRYPTION_KEY rotation) should send them to
// /admin/ai-providers to re-add it, not bounce them back through the whole
// wizard. Disagreeing on that predicate (middleware = "no provider",
// /setup = "setup_completed_at sealed") produced an infinite /setup ↔ /
// loop in R27 — both checks now share the single source of truth.
async function checkNeedsSetup(token: string): Promise<boolean> {
  const apiUrl =
    process.env.API_INTERNAL_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:4000";
  const base = apiUrl.replace(/\/+$/, "");
  try {
    const resp = await fetch(`${base}/setup/status`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!resp.ok) return false;
    const data = (await resp.json()) as SetupStatusResponse;
    if (data?.isPlatformAdmin !== true) return false;
    return data?.setupCompleted !== true;
  } catch {
    return false;
  }
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

const ADMIN_PATHS = /^\/admin(\/|$)/;
const POST_AUTH_PATHS = /^\/(dashboard|editor\/|projects\/)/;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(TOKEN_COOKIE)?.value;

  if (ADMIN_PATHS.test(pathname)) {
    // Existing gate: must be authenticated platform admin.
    if (!token) return loginRedirect(req);
    const isAdmin = await verifyPlatformAdmin(req, token);
    if (!isAdmin) return loginRedirect(req);
    return NextResponse.next();
  }

  // Post-auth surfaces: dashboard, editor, projects.
  // Don't redirect /setup itself — would create a redirect loop.
  if (POST_AUTH_PATHS.test(pathname)) {
    if (!token) return loginRedirect(req);
    const isAdmin = await verifyPlatformAdmin(req, token);
    if (isAdmin) {
      const needsSetup = await checkNeedsSetup(token);
      if (needsSetup) {
        const url = req.nextUrl.clone();
        url.pathname = "/setup";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/editor/:path*",
    "/projects/:path*",
  ],
};
