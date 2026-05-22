import { NextRequest, NextResponse } from "next/server";

/**
 * Redirect 127.0.0.1 → localhost so OAuth tokens (stored in localStorage on the
 * localhost origin) are always accessible.  Google/GitHub OAuth callbacks redirect
 * to localhost, so that's the canonical origin.
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (host.startsWith("127.0.0.1")) {
    const url = req.nextUrl.clone();
    url.hostname = "localhost";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  // Run on all routes except static assets and Next.js internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
