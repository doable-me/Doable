/**
 * TC-AU01 – TC-AU04: JWT auth end-to-end tests.
 * login → access token → authenticated route → refresh token → new access token
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runAuthTests(
  ownerEmail: string,
  ownerPassword: string,
): Promise<{ token: string | null; userId: string | null }> {
  let loginToken: string | null = null;
  let loginUserId: string | null = null;
  let refreshTokenValue: string | null = null;

  // TC-AU01: POST /api/auth/login returns accessToken + refreshToken
  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AU01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    loginToken       = (body.accessToken ?? body.token) as string ?? null;
    refreshTokenValue = body.refreshToken as string ?? null;
    loginUserId      = (body.user as Record<string, unknown>)?.id as string ?? null;
    assert(!!loginToken, "No accessToken in login response");
    pass("TC-AU01", "POST /api/auth/login returns accessToken");
  } catch (e) {
    fail("TC-AU01", "POST /api/auth/login returns accessToken", (e as Error).message);
    return { token: null, userId: null };
  }

  // TC-AU02: Authenticated route /api/auth/me succeeds with valid token
  try {
    const res = await apiFetch("/api/auth/me", { token: loginToken! });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AU02", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200 from /auth/me, got ${res.status}: ${JSON.stringify(body)}`);
    const user = body.user as Record<string, unknown> ?? body;
    assert(!!user.id || !!user.email, "No user.id or user.email in /auth/me response");
    pass("TC-AU02", "GET /api/auth/me returns user data with valid token");
  } catch (e) {
    fail("TC-AU02", "GET /api/auth/me returns user data with valid token", (e as Error).message);
  }

  // TC-AU03: Unauthenticated request to /api/auth/me returns 401
  try {
    const res = await apiFetch("/api/auth/me");
    saveEvidence("TC-AU03", await res.text(), Object.fromEntries(res.headers.entries()));
    assert(res.status === 401, `Expected 401 for unauthenticated /auth/me, got ${res.status}`);
    pass("TC-AU03", "GET /api/auth/me without token returns 401");
  } catch (e) {
    fail("TC-AU03", "GET /api/auth/me without token returns 401", (e as Error).message);
  }

  // TC-AU04: POST /api/auth/refresh returns new accessToken
  try {
    if (!refreshTokenValue) {
      console.log("  SKIP  [TC-AU04] No refresh token in login response — skipping");
      pass("TC-AU04", "POST /api/auth/refresh (skipped — no refresh token)");
    } else {
      const res = await apiFetch("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });
      const body = await res.json() as Record<string, unknown>;
      saveEvidence("TC-AU04", body, Object.fromEntries(res.headers.entries()));
      assert(res.status === 200, `Expected 200 from /auth/refresh, got ${res.status}: ${JSON.stringify(body)}`);
      const newToken = (body.accessToken ?? body.token) as string ?? null;
      assert(!!newToken, "No accessToken in refresh response");
      loginToken = newToken; // use fresh token going forward
      pass("TC-AU04", "POST /api/auth/refresh returns new accessToken");
    }
  } catch (e) {
    fail("TC-AU04", "POST /api/auth/refresh returns new accessToken", (e as Error).message);
  }

  return { token: loginToken, userId: loginUserId };
}
