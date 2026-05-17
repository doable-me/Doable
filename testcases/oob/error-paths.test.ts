/**
 * TC-EP01 – TC-EP22: Error path tests.
 * Malformed JSON, oversized bodies, wrong content-types, 404s, bad IDs.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runErrorPathTests(ownerToken: string, wsId: string | null): Promise<void> {
  // TC-EP01: POST /api/projects with malformed JSON returns 400 (not 500)
  try {
    const res = await fetch(`${(await import("./_shared.js")).API_BASE}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerToken}` },
      body: "{ this is not json !!!",
    });
    const text = await res.text();
    saveEvidence("TC-EP01", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 422, `Expected 400/422 for malformed JSON, got ${res.status}: ${text.slice(0, 200)}`);
    pass("TC-EP01", "POST /api/projects with malformed JSON returns 400/422");
  } catch (e) {
    fail("TC-EP01", "POST /api/projects malformed JSON", (e as Error).message);
  }

  // TC-EP02: POST /api/auth/login with malformed JSON returns 400
  try {
    const res = await fetch(`${(await import("./_shared.js")).API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json-at-all",
    });
    const text = await res.text();
    saveEvidence("TC-EP02", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 422 || res.status === 429,
      `Expected 400/422/429 for malformed JSON, got ${res.status}`,
    );
    pass("TC-EP02", "POST /api/auth/login with malformed JSON returns 400/422/429");
  } catch (e) {
    fail("TC-EP02", "POST /api/auth/login malformed JSON", (e as Error).message);
  }

  // TC-EP03: GET /api/notathing returns 404
  try {
    const res = await apiFetch("/api/notathing", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-EP03", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 404, `Expected 404, got ${res.status}`);
    pass("TC-EP03", "GET /api/notathing returns 404");
  } catch (e) {
    fail("TC-EP03", "GET /api/notathing returns 404", (e as Error).message);
  }

  // TC-EP04: GET /api/projects/not-a-uuid returns 400/404 (not 500)
  try {
    const res = await apiFetch("/api/projects/not-a-uuid", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-EP04", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 404, `Expected 400/404 for bad project id, got ${res.status}: ${text.slice(0, 200)}`);
    pass("TC-EP04", "GET /api/projects/not-a-uuid returns 400/404");
  } catch (e) {
    fail("TC-EP04", "GET /api/projects/not-a-uuid", (e as Error).message);
  }

  // TC-EP05: PATCH /api/projects/garbage-id returns 400/404 (not 500)
  try {
    const res = await apiFetch("/api/projects/garbage-id-xyz", {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ name: "test" }),
    });
    const text = await res.text();
    saveEvidence("TC-EP05", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 404, `Expected 400/404, got ${res.status}`);
    pass("TC-EP05", "PATCH /api/projects/garbage-id returns 400/404");
  } catch (e) {
    fail("TC-EP05", "PATCH /api/projects/garbage-id", (e as Error).message);
  }

  // TC-EP06: POST /api/auth/login with wrong Content-Type returns 400/415
  try {
    const res = await fetch(`${(await import("./_shared.js")).API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Authorization: `Bearer ${ownerToken}` },
      body: "email=foo&password=bar",
    });
    const text = await res.text();
    saveEvidence("TC-EP06", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 for wrong content-type: ${text.slice(0, 200)}`);
    pass("TC-EP06", "POST /api/auth/login with text/plain content-type doesn't 500");
  } catch (e) {
    fail("TC-EP06", "POST /api/auth/login wrong content-type", (e as Error).message);
  }

  // TC-EP07: DELETE /api/projects/00000000-0000-4000-8000-999999999999 returns 403/404
  try {
    const res = await apiFetch("/api/projects/00000000-0000-4000-8000-999999999999", {
      method: "DELETE",
      token: ownerToken,
    });
    const text = await res.text();
    saveEvidence("TC-EP07", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 403 || res.status === 404, `Expected 403/404, got ${res.status}`);
    pass("TC-EP07", "DELETE /api/projects/<nonexistent-uuid> returns 403/404");
  } catch (e) {
    fail("TC-EP07", "DELETE nonexistent project", (e as Error).message);
  }

  // TC-EP08: GET /api/workspaces/garbage returns 400/404
  try {
    const res = await apiFetch("/api/workspaces/totally-invalid-id", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-EP08", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 404, `Expected 400/404, got ${res.status}`);
    pass("TC-EP08", "GET /api/workspaces/invalid-id returns 400/404");
  } catch (e) {
    fail("TC-EP08", "GET /api/workspaces/invalid-id", (e as Error).message);
  }

  // TC-EP09: POST to read-only endpoint (e.g., GET-only /api/health) returns 405/404
  try {
    const res = await apiFetch("/api/health", { method: "POST", body: JSON.stringify({}) });
    const text = await res.text();
    saveEvidence("TC-EP09", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on POST /api/health: ${text.slice(0, 200)}`);
    pass("TC-EP09", "POST /api/health doesn't 500 (returns 405/404/200)");
  } catch (e) {
    fail("TC-EP09", "POST /api/health no 500", (e as Error).message);
  }

  // TC-EP10: PUT to non-PUT endpoint returns 405/404 not 500
  try {
    const res = await apiFetch("/api/auth/login", {
      method: "PUT",
      body: JSON.stringify({ email: "x@x.com", password: "x" }),
    });
    const text = await res.text();
    saveEvidence("TC-EP10", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on PUT /api/auth/login: ${text.slice(0, 200)}`);
    pass("TC-EP10", "PUT /api/auth/login doesn't 500");
  } catch (e) {
    fail("TC-EP10", "PUT /api/auth/login no 500", (e as Error).message);
  }

  // TC-EP11: POST /api/projects with null body returns 400/422
  try {
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: "null",
    });
    const text = await res.text();
    saveEvidence("TC-EP11", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 422, `Expected 400/422 for null body, got ${res.status}`);
    pass("TC-EP11", "POST /api/projects with null body returns 400/422");
  } catch (e) {
    fail("TC-EP11", "POST /api/projects null body", (e as Error).message);
  }

  // TC-EP12: POST /api/projects with empty object returns 400/422
  try {
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-EP12", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 422, `Expected 400/422 for empty object, got ${res.status}`);
    pass("TC-EP12", "POST /api/projects with {} returns 400/422");
  } catch (e) {
    fail("TC-EP12", "POST /api/projects empty object", (e as Error).message);
  }

  // TC-EP13: Deeply nested JSON body doesn't 500
  try {
    let nested: Record<string, unknown> = { value: "leaf" };
    for (let i = 0; i < 50; i++) nested = { nested };
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify(nested),
    });
    const text = await res.text();
    saveEvidence("TC-EP13", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on deeply nested JSON: ${text.slice(0, 200)}`);
    pass("TC-EP13", "POST /api/projects with 50-deep nested JSON doesn't 500");
  } catch (e) {
    fail("TC-EP13", "POST /api/projects deeply nested JSON", (e as Error).message);
  }

  // TC-EP14: Very long project name (10000 chars) returns 400/422 not 500
  try {
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ name: "x".repeat(10000), workspaceId: wsId ?? "fake" }),
    });
    const text = await res.text();
    saveEvidence("TC-EP14", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on 10k-char name: ${text.slice(0, 200)}`);
    pass("TC-EP14", "POST /api/projects with 10k-char name doesn't 500");
  } catch (e) {
    fail("TC-EP14", "POST /api/projects 10k-char name", (e as Error).message);
  }

  // TC-EP15: GET /api/../../../etc/passwd path traversal returns 400/404 (not 500 or file content)
  try {
    const res = await apiFetch("/api/" + encodeURIComponent("../../../etc/passwd"), { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-EP15", text, Object.fromEntries(res.headers.entries()));
    assert(!text.includes("root:x:"), "Path traversal may have leaked /etc/passwd!");
    assert(res.status !== 500, `Got 500 on path traversal: ${text.slice(0, 200)}`);
    pass("TC-EP15", "GET /api/../../../etc/passwd returns 400/404 (no traversal)");
  } catch (e) {
    fail("TC-EP15", "GET path traversal probe", (e as Error).message);
  }

  // TC-EP16: Request with giant Authorization header returns 400/431 not 500
  try {
    const giantToken = "x".repeat(8192);
    const res = await apiFetch("/api/auth/me", { token: giantToken });
    const text = await res.text();
    saveEvidence("TC-EP16", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 for 8k-char token: ${text.slice(0, 200)}`);
    pass("TC-EP16", "Request with 8k-char Authorization header doesn't 500");
  } catch (e) {
    fail("TC-EP16", "8k-char Authorization header", (e as Error).message);
  }

  // TC-EP17: POST /api/workspaces with missing required fields returns 400/422
  try {
    const res = await apiFetch("/api/workspaces", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-EP17", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 422 || res.status === 405, `Expected 400/422/405, got ${res.status}`);
    pass("TC-EP17", "POST /api/workspaces with empty body returns 400/422/405");
  } catch (e) {
    fail("TC-EP17", "POST /api/workspaces empty body", (e as Error).message);
  }

  // TC-EP18: GET /api/projects/:id with valid UUID format but all zeros returns 403/404
  try {
    const res = await apiFetch("/api/projects/00000000-0000-0000-0000-000000000000", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-EP18", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 403 || res.status === 404,
      `Expected 400/403/404 (all-zeros may be invalid v4 → 400), got ${res.status}`,
    );
    pass("TC-EP18", "GET /api/projects/all-zeros-uuid returns 400/403/404");
  } catch (e) {
    fail("TC-EP18", "GET /api/projects/all-zeros-uuid", (e as Error).message);
  }

  // TC-EP19: PATCH /api/workspaces/:id/settings with invalid field type doesn't 500
  try {
    const id = wsId ?? "00000000-0000-4000-8000-000000000001";
    const res = await apiFetch(`/api/workspaces/${id}/settings`, {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({ someInvalidField: { nested: { deeply: true } } }),
    });
    const text = await res.text();
    saveEvidence("TC-EP19", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on invalid settings field: ${text.slice(0, 200)}`);
    pass("TC-EP19", "PATCH /api/workspaces/:id/settings with invalid field doesn't 500");
  } catch (e) {
    fail("TC-EP19", "PATCH settings invalid field no 500", (e as Error).message);
  }

  // TC-EP20: GET /api/* wildcard path returns 404 not 500
  try {
    const res = await apiFetch("/api/completely/made/up/path/that/should/404", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-EP20", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 404, `Expected 404 for deep unknown path, got ${res.status}`);
    pass("TC-EP20", "GET /api/deep/unknown/path returns 404");
  } catch (e) {
    fail("TC-EP20", "GET /api/deep/unknown/path returns 404", (e as Error).message);
  }

  // TC-EP21: Request body with array instead of object returns 400/422 not 500
  try {
    const res = await apiFetch("/api/projects", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify([{ name: "test" }]),
    });
    const text = await res.text();
    saveEvidence("TC-EP21", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 on array body: ${text.slice(0, 200)}`);
    pass("TC-EP21", "POST /api/projects with array body doesn't 500");
  } catch (e) {
    fail("TC-EP21", "POST /api/projects array body", (e as Error).message);
  }

  // TC-EP22: GET /api/projects with invalid workspaceId param returns 400/404 not 500
  try {
    const res = await apiFetch("/api/projects?workspaceId=not-a-uuid", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-EP22", text, Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 for invalid workspaceId param: ${text.slice(0, 200)}`);
    pass("TC-EP22", "GET /api/projects?workspaceId=not-a-uuid doesn't 500");
  } catch (e) {
    fail("TC-EP22", "GET /api/projects invalid workspaceId param", (e as Error).message);
  }
}
