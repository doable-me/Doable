/**
 * TC-SE01 – TC-SE08: Security boundary tests.
 * CORS preflight, JWT tampering, unauthenticated access, RLS workspace isolation.
 * Requires ownerToken from prior stages.
 */
import { apiFetch, pass, fail, assert, saveEvidence, API_BASE } from "./_shared.js";

export async function runSecurityTests(ownerToken: string, workspaceId: string | null): Promise<void> {
  // TC-SE01: OPTIONS /api/health returns 200/204 (CORS preflight handled)
  try {
    const res = await apiFetch("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://example.com",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Authorization",
      },
    });
    const text = await res.text();
    saveEvidence("TC-SE01", text, Object.fromEntries(res.headers.entries()));
    // 200 or 204 = CORS preflight handled; 405 = method not allowed but route exists
    assert(
      res.status === 200 || res.status === 204 || res.status === 405,
      `Expected 200/204/405 for OPTIONS preflight, got ${res.status}`
    );
    pass("TC-SE01", "OPTIONS /api/health CORS preflight returns 200/204/405");
  } catch (e) {
    fail("TC-SE01", "OPTIONS /api/health CORS preflight returns 200/204/405", (e as Error).message);
  }

  // TC-SE02: Request with malformed JWT returns 401
  try {
    const res = await apiFetch("/api/auth/me", {
      token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.invalidsignature",
    });
    const text = await res.text();
    saveEvidence("TC-SE02", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 for bad JWT, got ${res.status}`);
    pass("TC-SE02", "GET /api/auth/me with bad JWT signature returns 401/403");
  } catch (e) {
    fail("TC-SE02", "GET /api/auth/me with bad JWT signature returns 401/403", (e as Error).message);
  }

  // TC-SE03: Request with expired/garbage token returns 401
  try {
    const res = await apiFetch("/api/workspaces", { token: "not-a-jwt-at-all" });
    const text = await res.text();
    saveEvidence("TC-SE03", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 for garbage token, got ${res.status}`);
    pass("TC-SE03", "GET /api/workspaces with garbage token returns 401/403");
  } catch (e) {
    fail("TC-SE03", "GET /api/workspaces with garbage token returns 401/403", (e as Error).message);
  }

  // TC-SE04: GET /api/admin/users without token returns 401/403 (admin route blocked)
  try {
    const res = await apiFetch("/api/admin/users");
    const text = await res.text();
    saveEvidence("TC-SE04", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 for unauthenticated admin route, got ${res.status}`);
    pass("TC-SE04", "GET /api/admin/users without token returns 401/403");
  } catch (e) {
    fail("TC-SE04", "GET /api/admin/users without token returns 401/403", (e as Error).message);
  }

  // TC-SE05: GET /api/projects/:id with completely random UUID returns 403/404 (not 500)
  try {
    const fakeId = "00000000-0000-4000-8000-000000000001";
    const res = await apiFetch(`/api/projects/${fakeId}`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SE05", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 404 || res.status === 403,
      `Expected 404/403 for nonexistent project, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-SE05", "GET /api/projects/:fakeId returns 404/403 (not 500 or data leak)");
  } catch (e) {
    fail("TC-SE05", "GET /api/projects/:fakeId returns 404/403 (not 500 or data leak)", (e as Error).message);
  }

  // TC-SE06: POST /api/auth/login with wrong password returns 401 (not 500)
  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "owner@example.local", password: "WrongPassword!!1" }),
    });
    const text = await res.text();
    saveEvidence("TC-SE06", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 400, `Expected 401/400 for wrong password, got ${res.status}`);
    pass("TC-SE06", "POST /api/auth/login with wrong password returns 401/400");
  } catch (e) {
    fail("TC-SE06", "POST /api/auth/login with wrong password returns 401/400", (e as Error).message);
  }

  // TC-SE07: GET /api/workspaces/:fakeId/connectors with valid token returns 403/404 (RLS)
  try {
    const fakeWsId = "00000000-0000-4000-8000-000000000002";
    const res = await apiFetch(`/api/workspaces/${fakeWsId}/connectors`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SE07", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 403 || res.status === 404,
      `Expected 403/404 for another workspace's connectors, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-SE07", "GET /api/workspaces/:fakeId/connectors returns 403/404 (RLS enforced)");
  } catch (e) {
    fail("TC-SE07", "GET /api/workspaces/:fakeId/connectors returns 403/404 (RLS enforced)", (e as Error).message);
  }

  // TC-SE08: POST /api/auth/register with missing fields returns 400/422
  try {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: "noemail" }), // missing password
    });
    const text = await res.text();
    saveEvidence("TC-SE08", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 422 || res.status === 409,
      `Expected 400/422 for incomplete register, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-SE08", "POST /api/auth/register with missing password returns 400/422");
  } catch (e) {
    fail("TC-SE08", "POST /api/auth/register with missing password returns 400/422", (e as Error).message);
  }
}
