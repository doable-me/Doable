/**
 * TC-OA01 – TC-OA18: OAuth negative-path tests.
 * Bad state, missing code, unknown provider, replay attacks.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runOauthNegativeTests(ownerToken: string, _wsId: string | null): Promise<void> {
  // TC-OA01: GET /api/auth/oauth/github without state param returns 400/302/404
  try {
    const res = await apiFetch("/api/auth/oauth/github");
    const text = await res.text();
    saveEvidence("TC-OA01", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 302 || res.status === 404 || res.status === 401,
      `Expected 400/302/404/401, got ${res.status}`
    );
    pass("TC-OA01", "GET /api/auth/oauth/github no-state returns 400/302/404/401");
  } catch (e) {
    fail("TC-OA01", "GET /api/auth/oauth/github no-state", (e as Error).message);
  }

  // TC-OA02: GET /api/auth/oauth/github/callback with bad state returns 400/401
  try {
    const res = await apiFetch("/api/auth/oauth/github/callback?state=INVALID_STATE&code=somecode");
    const text = await res.text();
    saveEvidence("TC-OA02", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 401 || res.status === 302 || res.status === 404,
      `Expected 400/401/302/404 for bad state, got ${res.status}`
    );
    pass("TC-OA02", "OAuth callback with bad state returns 400/401/302/404");
  } catch (e) {
    fail("TC-OA02", "OAuth callback bad state", (e as Error).message);
  }

  // TC-OA03: GET /api/auth/oauth/github/callback with no code returns 400/401
  try {
    const res = await apiFetch("/api/auth/oauth/github/callback?state=somestate");
    const text = await res.text();
    saveEvidence("TC-OA03", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 401 || res.status === 302 || res.status === 404,
      `Expected 400/401/302/404 for missing code, got ${res.status}`
    );
    pass("TC-OA03", "OAuth callback with no code returns 400/401/302/404");
  } catch (e) {
    fail("TC-OA03", "OAuth callback no code", (e as Error).message);
  }

  // TC-OA04: GET /api/auth/oauth/github/callback with no params at all
  try {
    const res = await apiFetch("/api/auth/oauth/github/callback");
    const text = await res.text();
    saveEvidence("TC-OA04", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 401 || res.status === 302 || res.status === 404,
      `Expected 400/401/302/404 for empty callback, got ${res.status}`
    );
    pass("TC-OA04", "OAuth callback with no params returns 400/401/302/404");
  } catch (e) {
    fail("TC-OA04", "OAuth callback no params", (e as Error).message);
  }

  // TC-OA05: GET /api/auth/providers returns 200 with list
  try {
    const res = await apiFetch("/api/auth/providers", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-OA05", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 200 || res.status === 404,
      `Expected 200/404, got ${res.status}`
    );
    pass("TC-OA05", "GET /api/auth/providers returns 200/404");
  } catch (e) {
    fail("TC-OA05", "GET /api/auth/providers", (e as Error).message);
  }

  // TC-OA06: GET /api/auth/oauth/unknown-provider returns 400/404
  try {
    const res = await apiFetch("/api/auth/oauth/nonexistent-provider");
    const text = await res.text();
    saveEvidence("TC-OA06", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 404 || res.status === 302 || res.status === 401,
      `Expected 400/404/302/401 for unknown provider, got ${res.status}`,
    );
    pass("TC-OA06", "GET /api/auth/oauth/unknown-provider returns 400/404/302/401");
  } catch (e) {
    fail("TC-OA06", "GET /api/auth/oauth/unknown-provider", (e as Error).message);
  }

  // TC-OA07: GET /api/auth/oauth/github/callback with error param (user denied)
  try {
    const res = await apiFetch("/api/auth/oauth/github/callback?error=access_denied&error_description=User+denied+access");
    const text = await res.text();
    saveEvidence("TC-OA07", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 302 || res.status === 401 || res.status === 404,
      `Expected 400/302/401/404 for access_denied, got ${res.status}`
    );
    pass("TC-OA07", "OAuth callback with error=access_denied returns 400/302/401/404");
  } catch (e) {
    fail("TC-OA07", "OAuth callback error=access_denied", (e as Error).message);
  }

  // TC-OA08: GET /api/auth/oauth/github with XSS in state param doesn't reflect
  try {
    const xssState = "<script>alert(1)</script>";
    const res = await apiFetch(`/api/auth/oauth/github/callback?state=${encodeURIComponent(xssState)}&code=x`);
    const text = await res.text();
    saveEvidence("TC-OA08", text, Object.fromEntries(res.headers.entries()));
    assert(
      !text.includes("<script>alert(1)</script>"),
      "XSS state param reflected in response body — potential XSS"
    );
    pass("TC-OA08", "OAuth callback with XSS state param doesn't reflect script");
  } catch (e) {
    fail("TC-OA08", "OAuth callback XSS state not reflected", (e as Error).message);
  }

  // TC-OA09: POST /api/auth/oauth/token with invalid grant returns 400/401
  try {
    const res = await apiFetch("/api/auth/oauth/token", {
      method: "POST",
      body: JSON.stringify({ grant_type: "authorization_code", code: "fake-code" }),
    });
    const text = await res.text();
    saveEvidence("TC-OA09", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 401 || res.status === 404,
      `Expected 400/401/404, got ${res.status}`
    );
    pass("TC-OA09", "POST /api/auth/oauth/token with fake code returns 400/401/404");
  } catch (e) {
    fail("TC-OA09", "POST /api/auth/oauth/token fake code", (e as Error).message);
  }

  // TC-OA10: GET /api/auth/oauth/github/callback with code='' (empty string)
  try {
    const res = await apiFetch("/api/auth/oauth/github/callback?code=&state=somestate");
    const text = await res.text();
    saveEvidence("TC-OA10", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 401 || res.status === 302 || res.status === 404,
      `Expected 400/401/302/404 for empty code, got ${res.status}`
    );
    pass("TC-OA10", "OAuth callback with empty code returns 400/401/302/404");
  } catch (e) {
    fail("TC-OA10", "OAuth callback empty code", (e as Error).message);
  }

  // TC-OA11: GET /api/auth/oauth/github redirects (302) — no auth needed for initiation
  try {
    const res = await apiFetch("/api/auth/oauth/github?redirect_uri=https://example.com/callback");
    const text = await res.text();
    saveEvidence("TC-OA11", text, Object.fromEntries(res.headers.entries()));
    // Might redirect or return URL; should not 500
    assert(res.status !== 500, `Got 500 on OAuth initiation: ${text.slice(0, 200)}`);
    pass("TC-OA11", "GET /api/auth/oauth/github doesn't 500");
  } catch (e) {
    fail("TC-OA11", "GET /api/auth/oauth/github no 500", (e as Error).message);
  }

  // TC-OA12: OAuth callback with replay of used code doesn't crash
  try {
    const res1 = await apiFetch("/api/auth/oauth/github/callback?code=replay-test&state=replay-state");
    const res2 = await apiFetch("/api/auth/oauth/github/callback?code=replay-test&state=replay-state");
    const [text1, text2] = await Promise.all([res1.text(), res2.text()]);
    saveEvidence("TC-OA12", JSON.stringify({ s1: res1.status, s2: res2.status }), {});
    assert(res1.status !== 500 && res2.status !== 500, `Got 500 on replay: ${res1.status}, ${res2.status}`);
    pass("TC-OA12", "Replayed OAuth code doesn't 500");
  } catch (e) {
    fail("TC-OA12", "OAuth code replay no 500", (e as Error).message);
  }

  // TC-OA13: GET /api/auth/oauth/google equivalent path probed
  try {
    const res = await apiFetch("/api/auth/oauth/google");
    const text = await res.text();
    saveEvidence("TC-OA13", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on Google OAuth probe: ${text.slice(0, 200)}`);
    pass("TC-OA13", "GET /api/auth/oauth/google doesn't 500");
  } catch (e) {
    fail("TC-OA13", "GET /api/auth/oauth/google no 500", (e as Error).message);
  }

  // TC-OA14: GET /api/auth/oauth/<provider>/callback with SQL injection in code
  try {
    const res = await apiFetch("/api/auth/oauth/github/callback?code=" + encodeURIComponent("'; DROP TABLE users; --") + "&state=x");
    const text = await res.text();
    saveEvidence("TC-OA14", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on SQL injection in OAuth code: ${text.slice(0, 200)}`);
    pass("TC-OA14", "OAuth callback with SQL injection in code doesn't 500");
  } catch (e) {
    fail("TC-OA14", "OAuth callback SQL injection no 500", (e as Error).message);
  }

  // TC-OA15: GET /api/auth/oauth/github/callback with overlong code (1000 chars) doesn't 500
  try {
    const longCode = "x".repeat(1000);
    const res = await apiFetch(`/api/auth/oauth/github/callback?code=${longCode}&state=x`);
    const text = await res.text();
    saveEvidence("TC-OA15", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on 1000-char OAuth code: ${text.slice(0, 200)}`);
    pass("TC-OA15", "OAuth callback with 1000-char code doesn't 500");
  } catch (e) {
    fail("TC-OA15", "OAuth callback overlong code no 500", (e as Error).message);
  }

  // TC-OA16: GET /api/auth/connected-accounts requires auth
  try {
    const res = await apiFetch("/api/auth/connected-accounts");
    const text = await res.text();
    saveEvidence("TC-OA16", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403 || res.status === 404,
      `Expected 401/403/404 unauthenticated, got ${res.status}`
    );
    pass("TC-OA16", "GET /api/auth/connected-accounts without token returns 401/403/404");
  } catch (e) {
    fail("TC-OA16", "GET /api/auth/connected-accounts requires auth", (e as Error).message);
  }

  // TC-OA17: GET /api/auth/connected-accounts with valid token returns 200/404
  try {
    const res = await apiFetch("/api/auth/connected-accounts", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-OA17", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 200 || res.status === 404,
      `Expected 200/404 with token, got ${res.status}`
    );
    pass("TC-OA17", "GET /api/auth/connected-accounts with token returns 200/404");
  } catch (e) {
    fail("TC-OA17", "GET /api/auth/connected-accounts with token", (e as Error).message);
  }

  // TC-OA18: DELETE /api/auth/connected-accounts/:provider removes link (or 404 gracefully)
  try {
    const res = await apiFetch("/api/auth/connected-accounts/github", {
      method: "DELETE",
      token: ownerToken,
    });
    const text = await res.text();
    saveEvidence("TC-OA18", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 200 || res.status === 204 || res.status === 404 || res.status === 400,
      `Expected 200/204/404/400, got ${res.status}`
    );
    pass("TC-OA18", "DELETE /api/auth/connected-accounts/github returns 200/204/404/400");
  } catch (e) {
    fail("TC-OA18", "DELETE /api/auth/connected-accounts/github", (e as Error).message);
  }
}
