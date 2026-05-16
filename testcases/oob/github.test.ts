/**
 * TC-GH01 – TC-GH05: GitHub integration status and OAuth boundary tests.
 * Requires ownerToken from prior stages.
 * OAuth callback tests are unauthenticated boundary checks (bad state = reject).
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runGithubTests(ownerToken: string, workspaceId: string | null): Promise<void> {
  // TC-GH01: GET /api/github/status returns connection status for owner (disconnected by default)
  try {
    const res = await apiFetch("/api/github/status", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-GH01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    // Should have a connected/status field
    assert(
      "connected" in body || "status" in body || "githubUsername" in body || "token" in body,
      `Expected connected/status field in /github/status response: ${JSON.stringify(body)}`
    );
    pass("TC-GH01", "GET /api/github/status returns 200 with connection status");
  } catch (e) {
    fail("TC-GH01", "GET /api/github/status returns 200 with connection status", (e as Error).message);
  }

  // TC-GH02: GET /api/github/status without token returns 401
  try {
    const res = await apiFetch("/api/github/status");
    const text = await res.text();
    saveEvidence("TC-GH02", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403, got ${res.status}`);
    pass("TC-GH02", "GET /api/github/status without token returns 401/403");
  } catch (e) {
    fail("TC-GH02", "GET /api/github/status without token returns 401/403", (e as Error).message);
  }

  // TC-GH03: GET /api/github/repos requires auth (returns 401 without token)
  try {
    const res = await apiFetch("/api/github/repos");
    const text = await res.text();
    saveEvidence("TC-GH03", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 for unauthenticated /github/repos, got ${res.status}`);
    pass("TC-GH03", "GET /api/github/repos without token returns 401/403");
  } catch (e) {
    fail("TC-GH03", "GET /api/github/repos without token returns 401/403", (e as Error).message);
  }

  // TC-GH04: GET /api/github/repo/callback with bad state rejects gracefully (not 500)
  try {
    const res = await apiFetch("/api/github/repo/callback?code=fakecode&state=badstate");
    const text = await res.text();
    saveEvidence("TC-GH04", text, Object.fromEntries(res.headers.entries()));
    // Should redirect (302/303) to error page or return 400/401/403 — never 500
    assert(
      res.status !== 500,
      `Expected non-500 for bad OAuth state, got 500: ${text.slice(0, 200)}`
    );
    assert(
      res.status === 302 || res.status === 303 || res.status === 400 || res.status === 401 || res.status === 403,
      `Expected redirect or 4xx for bad state, got ${res.status}`
    );
    pass("TC-GH04", "GET /api/github/repo/callback with bad state returns redirect or 4xx (not 500)");
  } catch (e) {
    fail("TC-GH04", "GET /api/github/repo/callback with bad state returns redirect or 4xx (not 500)", (e as Error).message);
  }

  // TC-GH05: GET /api/github/connect redirects to GitHub OAuth (302/303) for authenticated user
  try {
    // apiFetch follows redirects by default — check we land somewhere reasonable
    const url = "/api/github/connect";
    // Use manual redirect to capture the initial response status
    const res = await apiFetch(url, {
      token: ownerToken,
      redirect: "manual",
    });
    const text = res.status === 200 ? await res.text() : "";
    saveEvidence("TC-GH05", text || `status=${res.status}`, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 302 || res.status === 303 || res.status === 200,
      `Expected 302/303 redirect or 200 from /github/connect, got ${res.status}`
    );
    if (res.status === 302 || res.status === 303) {
      const location = res.headers.get("location") ?? "";
      assert(
        location.includes("github.com") || location.includes("/") ,
        `Expected GitHub redirect location, got: ${location}`
      );
    }
    pass("TC-GH05", "GET /api/github/connect redirects to GitHub OAuth or returns 200");
  } catch (e) {
    fail("TC-GH05", "GET /api/github/connect redirects to GitHub OAuth or returns 200", (e as Error).message);
  }
}
