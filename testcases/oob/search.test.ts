/**
 * TC-SR01 – TC-SR18: Search surface tests.
 *
 * Doable doesn't ship a single /api/search router. The actually-implemented
 * search surfaces are:
 *   - /api/projects?search=<q>           (list-routes.ts ?search= filter)
 *   - /api/marketplace?q=<q>             (marketplace listing search)
 *   - /api/admin/audit/messages?q=<q>    (admin conversation full-text)
 *   - /api/admin/users?search=<q>        (admin user lookup)
 *
 * Tests probe each, exercise edge cases (SQL injection, unicode, pagination,
 * negative pages, scoping), and accept 200/404 (route may be admin-only on
 * some installs) without forcing a specific implementation.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runSearchTests(ownerToken: string, wsId: string | null): Promise<void> {
  // TC-SR01: GET /api/projects?search=test returns 200 with array shape
  try {
    const res = await apiFetch("/api/projects?search=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR01", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    pass("TC-SR01", "GET /api/projects?search=test returns 200");
  } catch (e) {
    fail("TC-SR01", "GET /api/projects?search=test", (e as Error).message);
  }

  // TC-SR02: GET /api/projects?search= (empty) returns 200 with full list
  try {
    const res = await apiFetch("/api/projects?search=", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR02", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200 for empty search, got ${res.status}`);
    pass("TC-SR02", "GET /api/projects?search= returns 200");
  } catch (e) {
    fail("TC-SR02", "GET /api/projects?search= empty", (e as Error).message);
  }

  // TC-SR03: GET /api/projects?search=test without token returns 401/403
  try {
    const res = await apiFetch("/api/projects?search=test");
    const text = await res.text();
    saveEvidence("TC-SR03", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403,
      `Expected 401/403 without token, got ${res.status}`,
    );
    pass("TC-SR03", "GET /api/projects?search without token returns 401/403");
  } catch (e) {
    fail("TC-SR03", "GET /api/projects?search without token", (e as Error).message);
  }

  // TC-SR04: GET /api/projects?search=<unicode> handles non-ASCII gracefully
  try {
    const res = await apiFetch("/api/projects?search=" + encodeURIComponent("日本語テスト"), { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR04", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200 with unicode, got ${res.status}: ${text.slice(0, 200)}`);
    pass("TC-SR04", "GET /api/projects?search=unicode returns 200");
  } catch (e) {
    fail("TC-SR04", "GET /api/projects?search=unicode", (e as Error).message);
  }

  // TC-SR05: GET /api/projects?search=<SQL injection probe> doesn't 500
  try {
    const res = await apiFetch("/api/projects?search=" + encodeURIComponent("'; DROP TABLE--"), { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR05", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on SQL injection probe: ${text.slice(0, 200)}`);
    pass("TC-SR05", "GET /api/projects?search SQL-injection probe doesn't 500");
  } catch (e) {
    fail("TC-SR05", "GET /api/projects?search SQL-injection probe", (e as Error).message);
  }

  // TC-SR06: GET /api/projects?search=<500-char string> doesn't 500
  try {
    const longQ = "a".repeat(500);
    const res = await apiFetch(`/api/projects?search=${encodeURIComponent(longQ)}`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR06", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on long search query: ${text.slice(0, 200)}`);
    pass("TC-SR06", "GET /api/projects?search 500-char string doesn't 500");
  } catch (e) {
    fail("TC-SR06", "GET /api/projects?search long query", (e as Error).message);
  }

  // TC-SR07: GET /api/projects?search=test response shape has array
  try {
    const res = await apiFetch("/api/projects?search=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR07", text, Object.fromEntries(res.headers.entries()));
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Error("Response not JSON"); }
    const list = Array.isArray(body) ? body : ((body as Record<string, unknown>).data ?? (body as Record<string, unknown>).projects);
    assert(Array.isArray(list), `Expected array shape, got ${typeof list}`);
    pass("TC-SR07", "GET /api/projects?search response is array-shaped");
  } catch (e) {
    fail("TC-SR07", "GET /api/projects?search response shape", (e as Error).message);
  }

  // TC-SR08: GET /api/marketplace?q=test returns 200/404 (shape probe)
  try {
    const res = await apiFetch("/api/marketplace?q=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR08", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 404, `Expected 200/404, got ${res.status}`);
    pass("TC-SR08", "GET /api/marketplace?q=test returns 200/404");
  } catch (e) {
    fail("TC-SR08", "GET /api/marketplace?q=test", (e as Error).message);
  }

  // TC-SR09: GET /api/marketplace?q=<unicode> doesn't 500
  try {
    const res = await apiFetch("/api/marketplace?q=" + encodeURIComponent("日本"), { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR09", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on marketplace unicode search: ${text.slice(0, 200)}`);
    pass("TC-SR09", "GET /api/marketplace?q=unicode doesn't 500");
  } catch (e) {
    fail("TC-SR09", "GET /api/marketplace?q=unicode", (e as Error).message);
  }

  // TC-SR10: GET /api/marketplace?q= (empty) doesn't 500
  try {
    const res = await apiFetch("/api/marketplace?q=", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR10", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on empty marketplace q: ${text.slice(0, 200)}`);
    pass("TC-SR10", "GET /api/marketplace?q= doesn't 500");
  } catch (e) {
    fail("TC-SR10", "GET /api/marketplace?q= empty", (e as Error).message);
  }

  // TC-SR11: GET /api/admin/audit/messages?q=test returns 200/400 (admin-only)
  try {
    const res = await apiFetch("/api/admin/audit/messages?q=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR11", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 200 || res.status === 400 || res.status === 403,
      `Expected 200/400/403, got ${res.status}`,
    );
    pass("TC-SR11", "GET /api/admin/audit/messages?q=test returns 200/400/403");
  } catch (e) {
    fail("TC-SR11", "GET /api/admin/audit/messages?q=test", (e as Error).message);
  }

  // TC-SR12: GET /api/admin/audit/messages?q=<SQL injection> doesn't 500
  try {
    const res = await apiFetch("/api/admin/audit/messages?q=" + encodeURIComponent("'; DROP TABLE--"), { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR12", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on audit messages SQL-injection probe: ${text.slice(0, 200)}`);
    pass("TC-SR12", "GET /api/admin/audit/messages?q SQL-injection probe doesn't 500");
  } catch (e) {
    fail("TC-SR12", "GET /api/admin/audit/messages?q SQL-injection probe", (e as Error).message);
  }

  // TC-SR13: GET /api/admin/users?search=oob doesn't 500
  try {
    const res = await apiFetch("/api/admin/users?search=oob", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR13", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on admin users search: ${text.slice(0, 200)}`);
    pass("TC-SR13", "GET /api/admin/users?search=oob doesn't 500");
  } catch (e) {
    fail("TC-SR13", "GET /api/admin/users?search=oob", (e as Error).message);
  }

  // TC-SR14: GET /api/projects?search=test&limit=5 (pagination) doesn't 500
  try {
    const res = await apiFetch("/api/projects?search=test&limit=5", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR14", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with limit=5: ${text.slice(0, 200)}`);
    pass("TC-SR14", "GET /api/projects?search=test&limit=5 doesn't 500");
  } catch (e) {
    fail("TC-SR14", "GET /api/projects?search=test&limit=5", (e as Error).message);
  }

  // TC-SR15: GET /api/projects?search=test&page=-1 (negative page) doesn't 500
  try {
    const res = await apiFetch("/api/projects?search=test&page=-1", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR15", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with page=-1: ${text.slice(0, 200)}`);
    pass("TC-SR15", "GET /api/projects?search=test&page=-1 doesn't 500");
  } catch (e) {
    fail("TC-SR15", "GET /api/projects?search=test&page=-1", (e as Error).message);
  }

  // TC-SR16: GET /api/projects?search=test returns JSON content-type
  try {
    const res = await apiFetch("/api/projects?search=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR16", text, Object.fromEntries(res.headers.entries()));
    const ct = res.headers.get("content-type") ?? "";
    assert(ct.includes("json") || res.status >= 400, `Expected JSON content-type, got ${ct}`);
    pass("TC-SR16", "GET /api/projects?search returns JSON content-type");
  } catch (e) {
    fail("TC-SR16", "GET /api/projects?search content-type", (e as Error).message);
  }

  // TC-SR17: GET /api/marketplace?q=test response is array-shaped or has data array
  try {
    const res = await apiFetch("/api/marketplace?q=test", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR17", text, Object.fromEntries(res.headers.entries()));
    if (res.status === 404) {
      skip("TC-SR17", "Marketplace search shape", "endpoint returned 404");
      return;
    }
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Error("Response not JSON"); }
    // Marketplace returns an envelope: {data: {categories: [], listings: [], ...}}.
    // Accept either flat array or any nested array under data.{categories,listings,bundles,items,results}.
    const root = body as Record<string, unknown>;
    const data = (root.data ?? root) as Record<string, unknown>;
    const list = Array.isArray(body)
      ? body
      : (data.categories ?? data.listings ?? data.bundles ?? data.items ?? data.results);
    assert(Array.isArray(list), `Expected array under data.{categories,listings,...}, got ${typeof list}: ${text.slice(0, 200)}`);
    pass("TC-SR17", "GET /api/marketplace?q=test response is array-shaped (under data.*)");
  } catch (e) {
    fail("TC-SR17", "GET /api/marketplace?q=test shape", (e as Error).message);
  }

  // TC-SR18: GET /api/workspaces (no q param) returns wsId list — sanity for search-related listings
  try {
    const res = await apiFetch("/api/workspaces", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-SR18", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200 from /api/workspaces, got ${res.status}`);
    pass("TC-SR18", "GET /api/workspaces returns 200 (search-related listing baseline)");
  } catch (e) {
    fail("TC-SR18", "GET /api/workspaces baseline", (e as Error).message);
  }

  // wsId is intentionally unused — search uses workspaceId from token's RLS scope
  void wsId;
}
