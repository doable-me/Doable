"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { refreshAccessToken } from "@/lib/api";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Recovery landing for the SSR middleware. When a platform admin's access-token
 * cookie has expired, the middleware can't verify them server-side and would
 * otherwise clear the session and bounce through /login. It redirects here
 * instead. We refresh the access token client-side using the refresh token in
 * localStorage — which also re-mirrors a fresh access-token cookie — then send
 * the user back to where they were headed (`next`). If the refresh fails (the
 * refresh token is genuinely gone/revoked), we fall through to /login.
 */

// Loop breaker for the (middleware /admin) <-> (/auth/refresh) hop. In the
// pathological case where a freshly-refreshed token is still rejected by
// /auth/me (severe clock skew, or a JWT-secret mismatch between mint and
// verify) this page would redirect to /admin, get bounced back, and flicker
// forever. We count consecutive recovery hops within a short window; after the
// cap we bail to /login. A normal recovery is a single hop, after which the
// fresh 15-min token keeps the user on their destination and the record ages
// out on its own (so we deliberately do NOT clear it on success — clearing
// would reset the counter every hop and defeat the breaker).
const LOOP_KEY = "doable_refresh_recover";
const LOOP_MAX = 3;
const LOOP_WINDOW_MS = 10_000;

function bumpHopCount(): number {
  try {
    const prev = JSON.parse(sessionStorage.getItem(LOOP_KEY) ?? "null") as
      | { n: number; t: number }
      | null;
    const n = prev && Date.now() - prev.t < LOOP_WINDOW_MS ? prev.n + 1 : 1;
    sessionStorage.setItem(LOOP_KEY, JSON.stringify({ n, t: Date.now() }));
    return n;
  } catch {
    // sessionStorage unavailable (some private-mode configs) — skip the
    // breaker rather than crash; worst case is the rare unbounded loop.
    return 1;
  }
}

function clearHopCount(): void {
  try {
    sessionStorage.removeItem(LOOP_KEY);
  } catch {
    /* ignore */
  }
}

function RefreshAndReturn() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = safeNextPath(params.get("next"));
    const toLogin = () => router.replace(`/login?next=${encodeURIComponent(next)}`);

    if (bumpHopCount() > LOOP_MAX) {
      clearHopCount();
      toLogin();
      return;
    }

    let cancelled = false;
    void (async () => {
      const tokens = await refreshAccessToken();
      if (cancelled) return;
      if (tokens) {
        router.replace(next);
      } else {
        clearHopCount();
        toLogin();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />
        <p className="text-sm text-gray-500">Signing you back in…</p>
      </div>
    </div>
  );
}

export default function RefreshPage() {
  return (
    <Suspense fallback={null}>
      <RefreshAndReturn />
    </Suspense>
  );
}
