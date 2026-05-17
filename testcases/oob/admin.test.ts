/**
 * TC-AD01 – TC-AD08: Admin-gated endpoints.
 * Verifies that the platform admin user can list users/features/audit,
 * and that non-admin routes are correctly rejected.
 * Requires ownerToken from prior stages (owner is first user = platform admin).
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runAdminTests(ownerToken: string): Promise<void> {
  // TC-AD01: GET /api/admin/users returns array for platform admin
  try {
    const res = await apiFetch("/api/admin/users", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AD01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    const list = (body.data ?? body.users ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /admin/users, got ${typeof list}`);
    assert((list as unknown[]).length >= 1, "Expected at least one user in admin list");
    pass("TC-AD01", "GET /api/admin/users returns 200 with user array for platform admin");
  } catch (e) {
    fail("TC-AD01", "GET /api/admin/users returns 200 with user array for platform admin", (e as Error).message);
  }

  // TC-AD02: GET /api/admin/users without token returns 401
  try {
    const res = await apiFetch("/api/admin/users");
    const text = await res.text();
    saveEvidence("TC-AD02", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 without token, got ${res.status}`);
    pass("TC-AD02", "GET /api/admin/users without token returns 401/403");
  } catch (e) {
    fail("TC-AD02", "GET /api/admin/users without token returns 401/403", (e as Error).message);
  }

  // TC-AD03: GET /api/admin/features returns feature flags list
  try {
    const res = await apiFetch("/api/admin/features", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AD03", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.features ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /admin/features, got ${typeof list}`);
    pass("TC-AD03", "GET /api/admin/features returns 200 with feature flags array");
  } catch (e) {
    fail("TC-AD03", "GET /api/admin/features returns 200 with feature flags array", (e as Error).message);
  }

  // TC-AD04: GET /api/admin/audit/conversations returns audit log array
  try {
    const res = await apiFetch("/api/admin/audit/conversations", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AD04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.conversations ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /admin/audit/conversations, got ${typeof list}`);
    pass("TC-AD04", "GET /api/admin/audit/conversations returns 200 with array");
  } catch (e) {
    fail("TC-AD04", "GET /api/admin/audit/conversations returns 200 with array", (e as Error).message);
  }

  // TC-AD05: GET /api/admin/audit/actions returns admin action audit log
  try {
    const res = await apiFetch("/api/admin/audit/actions", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AD05", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.actions ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /admin/audit/actions, got ${typeof list}`);
    pass("TC-AD05", "GET /api/admin/audit/actions returns 200 with array");
  } catch (e) {
    fail("TC-AD05", "GET /api/admin/audit/actions returns 200 with array", (e as Error).message);
  }

  // TC-AD06: GET /api/admin/audit/stats returns audit statistics
  try {
    const res = await apiFetch("/api/admin/audit/stats", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AD06", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof body === "object" && body !== null, "Expected object from /admin/audit/stats");
    pass("TC-AD06", "GET /api/admin/audit/stats returns 200 with object");
  } catch (e) {
    fail("TC-AD06", "GET /api/admin/audit/stats returns 200 with object", (e as Error).message);
  }

  // TC-AD07: GET /api/admin/status confirms admin status for owner
  try {
    const res = await apiFetch("/api/admin/status", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AD07", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    pass("TC-AD07", "GET /api/admin/status returns 200 for platform admin");
  } catch (e) {
    fail("TC-AD07", "GET /api/admin/status returns 200 for platform admin", (e as Error).message);
  }

  // TC-AD08: PATCH /api/admin/users/:userId/admin with invalid payload returns 400/422
  try {
    const res = await apiFetch("/api/admin/users/nonexistent-user-id/admin", {
      method: "PATCH",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-AD08", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 400 || res.status === 404 || res.status === 422,
      `Expected 400/404/422 for bad admin promote, got ${res.status}: ${text.slice(0, 200)}`
    );
    pass("TC-AD08", "PATCH /api/admin/users/:userId/admin with unknown user returns 400/404/422");
  } catch (e) {
    fail("TC-AD08", "PATCH /api/admin/users/:userId/admin with unknown user returns 400/404/422", (e as Error).message);
  }
}
