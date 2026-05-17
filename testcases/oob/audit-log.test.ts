/**
 * TC-AL01 – TC-AL10: Audit log tests.
 * GET /api/audit-log or /api/admin/audit-log shape check.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runAuditLogTests(ownerToken: string, wsId: string | null): Promise<void> {
  // Probe both known paths
  const candidatePaths = [
    `/api/audit-log`,
    `/api/admin/audit-log`,
    wsId ? `/api/workspaces/${wsId}/audit-log` : null,
    `/api/audit-logs`,
  ].filter(Boolean) as string[];

  let auditPath: string | null = null;

  // TC-AL01: Probe audit log endpoints — find which one exists
  try {
    for (const p of candidatePaths) {
      const res = await apiFetch(p, { token: ownerToken });
      const text = await res.text();
      saveEvidence("TC-AL01", text.slice(0, 500), Object.fromEntries(res.headers.entries()), `path: ${p}`);
      if (res.status !== 404) {
        auditPath = p;
        break;
      }
    }
    if (!auditPath) {
      skip("TC-AL01", "Audit log endpoint discovery", "no audit log endpoint found at known paths");
      return;
    }
    pass(`TC-AL01`, `Audit log endpoint found at ${auditPath}`);
  } catch (e) {
    fail("TC-AL01", "Audit log endpoint discovery", (e as Error).message);
  }

  if (!auditPath) {
    for (let i = 2; i <= 10; i++) {
      skip(`TC-AL${String(i).padStart(2, "0")}`, "Audit log test", "no endpoint found");
    }
    return;
  }

  // TC-AL02: GET audit log returns 200
  try {
    const res = await apiFetch(auditPath, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL02", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${text.slice(0, 200)}`);
    pass("TC-AL02", `GET ${auditPath} returns 200`);
  } catch (e) {
    fail("TC-AL02", `GET ${auditPath} returns 200`, (e as Error).message);
  }

  // TC-AL03: GET audit log returns JSON content-type
  try {
    const res = await apiFetch(auditPath, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL03", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    const ct = res.headers.get("content-type") ?? "";
    assert(ct.includes("json"), `Expected JSON content-type, got ${ct}`);
    pass("TC-AL03", "Audit log returns JSON content-type");
  } catch (e) {
    fail("TC-AL03", "Audit log returns JSON", (e as Error).message);
  }

  // TC-AL04: GET audit log response is array or object with data array
  try {
    const res = await apiFetch(auditPath, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL04", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Error("Not JSON"); }
    const isArray = Array.isArray(body);
    const isObjWithArray = typeof body === "object" && body !== null &&
      (Array.isArray((body as Record<string, unknown>).data) ||
       Array.isArray((body as Record<string, unknown>).logs) ||
       Array.isArray((body as Record<string, unknown>).events) ||
       Array.isArray((body as Record<string, unknown>).items));
    assert(isArray || isObjWithArray, `Expected array or {data:[]} shape, got: ${text.slice(0, 200)}`);
    pass("TC-AL04", "Audit log response has array shape");
  } catch (e) {
    fail("TC-AL04", "Audit log response shape", (e as Error).message);
  }

  // TC-AL05: GET audit log without token returns 401/403
  try {
    const res = await apiFetch(auditPath);
    const text = await res.text();
    saveEvidence("TC-AL05", text, Object.fromEntries(res.headers.entries()));
    assert(
      res.status === 401 || res.status === 403,
      `Expected 401/403 without token, got ${res.status}`
    );
    pass("TC-AL05", "GET audit log without token returns 401/403");
  } catch (e) {
    fail("TC-AL05", "Audit log requires auth", (e as Error).message);
  }

  // TC-AL06: GET audit log with pagination param ?limit=5 doesn't 500
  try {
    const res = await apiFetch(`${auditPath}?limit=5`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL06", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with limit=5: ${text.slice(0, 200)}`);
    pass("TC-AL06", "GET audit log?limit=5 doesn't 500");
  } catch (e) {
    fail("TC-AL06", "Audit log pagination no 500", (e as Error).message);
  }

  // TC-AL07: GET audit log with ?page=0 doesn't 500
  try {
    const res = await apiFetch(`${auditPath}?page=0`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL07", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with page=0: ${text.slice(0, 200)}`);
    pass("TC-AL07", "GET audit log?page=0 doesn't 500");
  } catch (e) {
    fail("TC-AL07", "Audit log page=0 no 500", (e as Error).message);
  }

  // TC-AL08: GET audit log with ?action=login filter doesn't 500
  try {
    const res = await apiFetch(`${auditPath}?action=login`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL08", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with action=login filter: ${text.slice(0, 200)}`);
    pass("TC-AL08", "GET audit log?action=login doesn't 500");
  } catch (e) {
    fail("TC-AL08", "Audit log action filter no 500", (e as Error).message);
  }

  // TC-AL09: GET audit log with ?userId=fake-id doesn't 500
  try {
    const res = await apiFetch(`${auditPath}?userId=00000000-0000-4000-8000-000000000099`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL09", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with userId filter: ${text.slice(0, 200)}`);
    pass("TC-AL09", "GET audit log?userId=fake-uuid doesn't 500");
  } catch (e) {
    fail("TC-AL09", "Audit log userId filter no 500", (e as Error).message);
  }

  // TC-AL10: GET audit log with date range ?from=&to= doesn't 500
  try {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await apiFetch(`${auditPath}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token: ownerToken });
    const text = await res.text();
    saveEvidence("TC-AL10", text.slice(0, 500), Object.fromEntries(res.headers.entries()));
    assert(res.status !== 500, `Got 500 with date range: ${text.slice(0, 200)}`);
    pass("TC-AL10", "GET audit log with date range filter doesn't 500");
  } catch (e) {
    fail("TC-AL10", "Audit log date range filter no 500", (e as Error).message);
  }
}
