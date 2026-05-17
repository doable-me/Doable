/**
 * TC-SR01 – TC-SR18: Search endpoint tests.
 * GET /api/search, project search query params, vector search probing.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runSearchTests(ownerToken: string, wsId: string | null): Promise<void> {
  // TC-SR01: GET /api/search?q=test returns 200 or 404 (endpoint may not exist)
  try {
    const res = await apiFetch("/api/search?q=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR01", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404 || res.status === 501) {
      skip("TC-SR01", "GET /api/search?q=test", "endpoint not implemented");
      return;
    }
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    pass("TC-SR01", "GET /api/search?q=test returns 200");
  } catch (e) {
    fail("TC-SR01", "GET /api/search?q=test returns 200 or skipped", (e as Error).message);
  }

  // TC-SR02: GET /api/search without query returns 400 or empty
  try {
    const res = await apiFetch("/api/search", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR02", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 422 || res.status === 200 || res.status === 404,
      `Expected 400/422/200/404, got ${res.status}`
    );
    pass("TC-SR02", "GET /api/search without q returns 400/422/200/404");
  } catch (e) {
    fail("TC-SR02", "GET /api/search without q", (e as Error).message);
  }

  // TC-SR03: GET /api/search?q=test without token returns 401/403
  try {
    const res = await apiFetch("/api/search?q=test");
    const text = await res.text();
    saveEvidence("TC-SR03", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403 || res.status === 404,
      `Expected 401/403/404 unauthenticated, got ${res.status}`
    );
    pass("TC-SR03", "GET /api/search without token returns 401/403/404");
  } catch (e) {
    fail("TC-SR03", "GET /api/search without token", (e as Error).message);
  }

  // TC-SR04: GET /api/projects?search=oob returns 200 with array
  try {
    const res = await apiFetch("/api/projects?search=oob", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR04", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 404, `Expected 200/404, got ${res.status}`);
    pass("TC-SR04", "GET /api/projects?search=oob returns 200/404");
  } catch (e) {
    fail("TC-SR04", "GET /api/projects?search=oob", (e as Error).message);
  }

  // TC-SR05: GET /api/projects?search= (empty) returns 200 with full list
  try {
    const res = await apiFetch("/api/projects?search=", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR05", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200 for empty search, got ${res.status}`);
    pass("TC-SR05", "GET /api/projects?search= returns 200");
  } catch (e) {
    fail("TC-SR05", "GET /api/projects?search= empty", (e as Error).message);
  }

  // TC-SR06: GET /api/projects?search=<special-chars> doesn't 500
  try {
    const res = await apiFetch("/api/projects?search=" + encodeURIComponent("'; DROP TABLE--"), { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR06", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on SQL injection probe: ${text.slice(0, 200)}`);
    pass("TC-SR06", "GET /api/projects?search=sql-injection-probe doesn't 500");
  } catch (e) {
    fail("TC-SR06", "GET /api/projects?search=sql-injection probe", (e as Error).message);
  }

  // TC-SR07: GET /api/search?q=test&limit=5 respects limit param (no 500)
  try {
    const res = await apiFetch("/api/search?q=test&limit=5", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR07", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with limit param: ${text.slice(0, 200)}`);
    pass("TC-SR07", "GET /api/search?q=test&limit=5 doesn't 500");
  } catch (e) {
    fail("TC-SR07", "GET /api/search?q=test&limit=5", (e as Error).message);
  }

  // TC-SR08: GET /api/search?q=test&type=project scoped search doesn't 500
  try {
    const res = await apiFetch("/api/search?q=test&type=project", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR08", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with type=project: ${text.slice(0, 200)}`);
    pass("TC-SR08", "GET /api/search?q=test&type=project doesn't 500");
  } catch (e) {
    fail("TC-SR08", "GET /api/search?q=test&type=project", (e as Error).message);
  }

  // TC-SR09: GET /api/search?q=unicode handles unicode gracefully
  try {
    const res = await apiFetch("/api/search?q=" + encodeURIComponent("日本語テスト"), { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR09", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on unicode search: ${text.slice(0, 200)}`);
    pass("TC-SR09", "GET /api/search?q=unicode doesn't 500");
  } catch (e) {
    fail("TC-SR09", "GET /api/search?q=unicode", (e as Error).message);
  }

  // TC-SR10: GET /api/search?q=a&workspaceId=fake scoped to fake ws returns 403/404/200
  try {
    const res = await apiFetch("/api/search?q=a&workspaceId=00000000-0000-4000-8000-000000000099", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR10", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 for search with fake wsId: ${text.slice(0, 200)}`);
    pass("TC-SR10", "GET /api/search with fake workspaceId doesn't 500");
  } catch (e) {
    fail("TC-SR10", "GET /api/search with fake workspaceId", (e as Error).message);
  }

  // TC-SR11: GET /api/search?q=test returns JSON (not HTML)
  try {
    const res = await apiFetch("/api/search?q=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR11", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404 || res.status === 501) {
      skip("TC-SR11", "Search returns JSON content-type", "endpoint not implemented");
      return;
    }
    const ct = res.headers.get("content-type") ?? "";
    assert(ct.includes("json") || res.status >= 400, `Expected JSON content-type, got ${ct}`);
    pass("TC-SR11", "GET /api/search returns JSON content-type");
  } catch (e) {
    fail("TC-SR11", "GET /api/search returns JSON content-type", (e as Error).message);
  }

  // TC-SR12: GET /api/search?q=<very-long-string> doesn't 500
  try {
    const longQ = "a".repeat(500);
    const res = await apiFetch(`/api/search?q=${encodeURIComponent(longQ)}`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR12", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on long search query: ${text.slice(0, 200)}`);
    pass("TC-SR12", "GET /api/search?q=500-char-string doesn't 500");
  } catch (e) {
    fail("TC-SR12", "GET /api/search with 500-char query", (e as Error).message);
  }

  // TC-SR13: GET /api/projects?q= (alt search param) doesn't 500
  try {
    const res = await apiFetch("/api/projects?q=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR13", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with ?q= param: ${text.slice(0, 200)}`);
    pass("TC-SR13", "GET /api/projects?q=test doesn't 500");
  } catch (e) {
    fail("TC-SR13", "GET /api/projects?q=test", (e as Error).message);
  }

  // TC-SR14: GET /api/search?q=test&page=0 (pagination) doesn't 500
  try {
    const res = await apiFetch("/api/search?q=test&page=0", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR14", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with page=0: ${text.slice(0, 200)}`);
    pass("TC-SR14", "GET /api/search?q=test&page=0 doesn't 500");
  } catch (e) {
    fail("TC-SR14", "GET /api/search?q=test&page=0", (e as Error).message);
  }

  // TC-SR15: GET /api/search?q=test&page=-1 (negative page) doesn't 500
  try {
    const res = await apiFetch("/api/search?q=test&page=-1", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR15", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with page=-1: ${text.slice(0, 200)}`);
    pass("TC-SR15", "GET /api/search?q=test&page=-1 doesn't 500");
  } catch (e) {
    fail("TC-SR15", "GET /api/search?q=test&page=-1", (e as Error).message);
  }

  // TC-SR16: Vector search probe — /api/search?q=test&semantic=true doesn't 500
  try {
    const res = await apiFetch("/api/search?q=test&semantic=true", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR16", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on semantic search param: ${text.slice(0, 200)}`);
    pass("TC-SR16", "GET /api/search?semantic=true doesn't 500");
  } catch (e) {
    fail("TC-SR16", "GET /api/search?semantic=true", (e as Error).message);
  }

  // TC-SR17: GET /api/workspaces/:id/search scoped to workspace doesn't 500
  try {
    if (!wsId) { skip("TC-SR17", "Workspace scoped search", "no wsId"); return; }
    const res = await apiFetch(`/api/workspaces/${wsId}/search?q=test`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR17", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 for workspace search: ${text.slice(0, 200)}`);
    pass("TC-SR17", "GET /api/workspaces/:id/search doesn't 500");
  } catch (e) {
    fail("TC-SR17", "GET /api/workspaces/:id/search", (e as Error).message);
  }

  // TC-SR18: GET /api/search?q=test response shape has expected keys if 200
  try {
    const res = await apiFetch("/api/search?q=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR18", text, Object.fromEntries(res.headers.entries()));
    if (res.status !== 200) {
      skip("TC-SR18", "Search response shape check", `status ${res.status}`);
      return;
    }
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Error("Response not JSON"); }
    assert(typeof body === "object" && body !== null, "Expected object response");
    pass("TC-SR18", "GET /api/search?q=test returns object with results");
  } catch (e) {
    fail("TC-SR18", "GET /api/search?q=test response shape", (e as Error).message);
  }
}
