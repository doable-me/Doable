
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

// Recoverable-auth redirect. The access-token cookie was rejected (most
// commonly: it expired — they're only valid 15 min), but the user still holds
// a refresh token in localStorage. Rather than clear the session and bounce
// through /login, send them to a tiny client page that refreshes the access
// token (which re-mirrors a fresh cookie) and returns them to `next`. The
// /auth/refresh route is intentionally NOT in the middleware matcher, so it
// runs client-side without re-gating. We do NOT clear the cookie here.
function refreshRedirect(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  const next = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/auth/refresh";
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
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

type AdminAuthStatus = "admin" | "forbidden" | "expired" | "error";

/**
 * Classify the caller's access-token cookie against /auth/me:
 *   - "admin"     200 + isPlatformAdmin === true
 *   - "forbidden" 200 + authenticated but NOT a platform admin
 *   - "expired"   401/403 — token rejected (most commonly an expired access
 *                 token). Recoverable client-side via the refresh token.
 *   - "error"     network/timeout/other — fail closed (treat as not-admin).
 */
async function classifyAdminAuth(token: string): Promise<AdminAuthStatus> {
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
    // A rejected token is recoverable (the client can refresh) — distinguish
    // it from a genuine "you are not an admin" so the gate doesn't log out a
    // user whose access token merely lapsed.
    if (resp.status === 401 || resp.status === 403) return "expired";
    if (!resp.ok) return "error";
    const data = (await resp.json()) as AuthMeResponse;
    return data?.user?.isPlatformAdmin === true ? "admin" : "forbidden";
  } catch {
    // Fail closed on network/timeout — better to bounce than to accidentally
    // serve admin HTML when /auth/me is unreachable.
    return "error";
  }
}

const ADMIN_PATHS = /^\/admin(\/|$)/;
const POST_AUTH_PATHS = /^\/(dashboard|editor\/|projects\/)/;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(TOKEN_COOKIE)?.value;

  // Marketing landing (`/`): redirect authenticated visitors to /dashboard on
  // the server so a logged-in user who hits `/` (e.g. via the legal pages'
  // "Back to home" link) never sees the marketing page flash before the
  // client-side useEffect redirect fires. See doableinfo/dmca.md.
  //
  // Only cookie *presence* is checked — deliberately no /auth/me round-trip on
  // every landing hit. A stale/expired cookie is caught by the POST_AUTH_PATHS
  // gate on the very next hop (/dashboard), which recovers via the refresh
  // flow. Logged-out visitors (no cookie) fall through to the landing page
  // exactly as today, so SEO and the public marketing page are unaffected.
  if (pathname === "/") {
    if (!token) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (ADMIN_PATHS.test(pathname)) {
    // Gate: must be an authenticated platform admin.
    if (!token) return loginRedirect(req);
    const status = await classifyAdminAuth(token);
    if (status === "admin") return NextResponse.next();
    // Access token lapsed — recover via client refresh, don't log them out.
    if (status === "expired") return refreshRedirect(req);
    // Validly authenticated but not an admin — send to the dashboard WITHOUT
    // clearing their session; they're legitimately logged in, just not here.
    if (status === "forbidden") {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // "error" — /auth/me unreachable; fail closed.
    return loginRedirect(req);
  }

  // Post-auth surfaces: dashboard, editor, projects.
  // Don't redirect /setup itself — would create a redirect loop.
  if (POST_AUTH_PATHS.test(pathname)) {
    if (!token) return loginRedirect(req);
    const isAdmin = (await classifyAdminAuth(token)) === "admin";
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
    "/",
    "/admin",
    "/admin/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/editor/:path*",
    "/projects/:path*",
  ],
};
