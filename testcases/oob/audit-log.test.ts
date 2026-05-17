/**
 * TC-AL01 – TC-AL10: Admin audit-log tests.
 *
 * The real audit API lives at /api/admin/audit/{conversations,actions,stats,
 * messages,conversations/:id}. /api/audit-log and /api/admin/audit-log are
 * NOT mounted — earlier R3 probes against those imaginary paths returned 404,
 * caused TC-AL01 to short-circuit, and SKIPped the rest of this stage.
 *
 * This file probes the real endpoints. Requires platform-admin owner token.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runAuditLogTests(ownerToken: string, _wsId: string | null): Promise<void> {
  // TC-AL01: GET /api/admin/audit/conversations returns 200 with array shape
  try {
    const res = await apiFetch("/api/admin/audit/conversations", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL01", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${text.slice(0, 200)}`);
    const body = JSON.parse(text);
    const list = Array.isArray(body) ? body : (body.data ?? body.conversations ?? body.items);
    assert(Array.isArray(list), `Expected array shape, got ${typeof list}`);
    pass("TC-AL01", "GET /api/admin/audit/conversations returns 200 with array");
  } catch (e) {
    fail("TC-AL01", "GET /api/admin/audit/conversations 200 + array", (e as Error).message);
  }

  // TC-AL02: GET /api/admin/audit/actions returns 200 with array
  try {
    const res = await apiFetch("/api/admin/audit/actions", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL02", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${text.slice(0, 200)}`);
    const body = JSON.parse(text);
    const list = Array.isArray(body) ? body : (body.data ?? body.actions ?? body.items);
    assert(Array.isArray(list), `Expected array shape, got ${typeof list}`);
    pass("TC-AL02", "GET /api/admin/audit/actions returns 200 with array");
  } catch (e) {
    fail("TC-AL02", "GET /api/admin/audit/actions 200 + array", (e as Error).message);
  }

  // TC-AL03: GET /api/admin/audit/stats returns 200 with object
  try {
    const res = await apiFetch("/api/admin/audit/stats", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL03", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${text.slice(0, 200)}`);
    const body = JSON.parse(text);
    assert(typeof body === "object" && body !== null, "Expected object shape");
    pass("TC-AL03", "GET /api/admin/audit/stats returns 200 with object");
  } catch (e) {
    fail("TC-AL03", "GET /api/admin/audit/stats 200 + object", (e as Error).message);
  }

  // TC-AL04: GET /api/admin/audit/messages returns 200 with array
  try {
    const res = await apiFetch("/api/admin/audit/messages", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL04", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status === 200 || res.status === 400, `Expected 200/400, got ${res.status}: ${text.slice(0, 200)}`);
    if (res.status === 400) {
      // /messages may require a query param (q=, filter=); empty list is acceptable
      pass("TC-AL04", "GET /api/admin/audit/messages returns 400 when no query (acceptable)");
      return;
    }
    const body = JSON.parse(text);
    const list = Array.isArray(body) ? body : (body.data ?? body.messages ?? body.items);
    assert(Array.isArray(list), `Expected array shape, got ${typeof list}`);
    pass("TC-AL04", "GET /api/admin/audit/messages returns 200 with array");
  } catch (e) {
    fail("TC-AL04", "GET /api/admin/audit/messages 200 + array", (e as Error).message);
  }

  // TC-AL05: GET /api/admin/audit/conversations without token returns 401/403
  try {
    const res = await apiFetch("/api/admin/audit/conversations");
    const text = await res.text();
    saveEvidence("TC-AL05", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 without token, got ${res.status}`);
    pass("TC-AL05", "GET /api/admin/audit/conversations without token returns 401/403");
  } catch (e) {
    fail("TC-AL05", "Audit requires auth", (e as Error).message);
  }

  // TC-AL06: GET /api/admin/audit/conversations?limit=5 doesn't 500
  try {
    const res = await apiFetch("/api/admin/audit/conversations?limit=5", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL06", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with limit=5: ${text.slice(0, 200)}`);
    pass("TC-AL06", "GET /api/admin/audit/conversations?limit=5 doesn't 500");
  } catch (e) {
    fail("TC-AL06", "Audit limit param no 500", (e as Error).message);
  }

  // TC-AL07: GET /api/admin/audit/conversations?offset=0 doesn't 500
  try {
    const res = await apiFetch("/api/admin/audit/conversations?offset=0", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL07", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with offset=0: ${text.slice(0, 200)}`);
    pass("TC-AL07", "GET /api/admin/audit/conversations?offset=0 doesn't 500");
  } catch (e) {
    fail("TC-AL07", "Audit offset param no 500", (e as Error).message);
  }

  // TC-AL08: GET /api/admin/audit/actions?action=login doesn't 500
  try {
    const res = await apiFetch("/api/admin/audit/actions?action=login", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL08", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with action filter: ${text.slice(0, 200)}`);
    pass("TC-AL08", "GET /api/admin/audit/actions?action=login doesn't 500");
  } catch (e) {
    fail("TC-AL08", "Audit action filter no 500", (e as Error).message);
  }

  // TC-AL09: GET /api/admin/audit/conversations/:fakeId returns 404 (not 500)
  try {
    const fakeId = "00000000-0000-4000-8000-000000000099";
    const res = await apiFetch(`/api/admin/audit/conversations/${fakeId}`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL09", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 404 || res.status === 200,
      `Expected 404/200 for non-existent session, got ${res.status}: ${text.slice(0, 200)}`,
    );
    pass("TC-AL09", "GET /api/admin/audit/conversations/:fakeId returns 404/200");
  } catch (e) {
    fail("TC-AL09", "Audit conversation by id no 500", (e as Error).message);
  }

  // TC-AL10: GET /api/admin/audit/messages?q=hello doesn't 500
  try {
    const res = await apiFetch("/api/admin/audit/messages?q=hello", { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL10", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with messages?q=: ${text.slice(0, 200)}`);
    pass("TC-AL10", "GET /api/admin/audit/messages?q=hello doesn't 500");
  } catch (e) {
    fail("TC-AL10", "Audit messages query no 500", (e as Error).message);
  }

  // unused-import guard — skip is here so it stays imported even when no branch uses it
  void skip;
}
