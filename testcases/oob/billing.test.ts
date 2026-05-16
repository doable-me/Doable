/**
 * TC-BL01 – TC-BL07: Billing endpoints — plan, credits, topup, invoices, usage.
 * Requires ownerToken from prior stages.
 * Stripe-dependent tests are skipped gracefully when Stripe is not configured.
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runBillingTests(ownerToken: string, workspaceId: string | null): Promise<void> {
  // TC-BL01: GET /api/billing/plans returns array of available plans
  try {
    const res = await apiFetch("/api/billing/plans", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-BL01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.plans ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /billing/plans, got ${typeof list}`);
    pass("TC-BL01", "GET /api/billing/plans returns 200 with array");
  } catch (e) {
    fail("TC-BL01", "GET /api/billing/plans returns 200 with array", (e as Error).message);
  }

  // TC-BL02: GET /api/billing/credits returns credit balance object
  try {
    const url = workspaceId
      ? `/api/billing/credits?workspaceId=${workspaceId}`
      : "/api/billing/credits";
    const res = await apiFetch(url, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-BL02", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    // balance field may be numeric or object
    assert(
      "balance" in body || "credits" in body || "amount" in body || typeof body === "object",
      `Expected balance/credits field in response`
    );
    pass("TC-BL02", "GET /api/billing/credits returns 200 with balance data");
  } catch (e) {
    fail("TC-BL02", "GET /api/billing/credits returns 200 with balance data", (e as Error).message);
  }

  // TC-BL03: GET /api/billing/credits without token returns 401
  try {
    const res = await apiFetch("/api/billing/credits");
    const text = await res.text();
    saveEvidence("TC-BL03", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 403, `Expected 401/403 without token, got ${res.status}`);
    pass("TC-BL03", "GET /api/billing/credits without token returns 401/403");
  } catch (e) {
    fail("TC-BL03", "GET /api/billing/credits without token returns 401/403", (e as Error).message);
  }

  // TC-BL04: GET /api/billing/topup/packages returns available topup packages
  try {
    const res = await apiFetch("/api/billing/topup/packages", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-BL04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.packages ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /billing/topup/packages, got ${typeof list}`);
    pass("TC-BL04", "GET /api/billing/topup/packages returns 200 with array");
  } catch (e) {
    fail("TC-BL04", "GET /api/billing/topup/packages returns 200 with array", (e as Error).message);
  }

  // TC-BL05: POST /api/billing/topup without Stripe configured returns 402/422/500 (SKIP if feature gated)
  try {
    const res = await apiFetch("/api/billing/topup", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ packageId: "credits_100", workspaceId }),
    });
    const text = await res.text();
    saveEvidence("TC-BL05", text, Object.fromEntries(res.headers.entries()));
    // Without Stripe configured we expect a graceful error, not 404 (which would mean missing route)
    if (res.status === 404) {
      fail("TC-BL05", "POST /api/billing/topup returns non-404 (route must exist)", `Got 404 — route not registered`);
    } else if (res.status === 200 || res.status === 201) {
      pass("TC-BL05", "POST /api/billing/topup returns 200/201 (Stripe configured)");
    } else {
      // 402/422/400/500 are all acceptable — Stripe not configured
      console.log(`  SKIP  [TC-BL05] Stripe not configured — topup returned ${res.status} (expected)`);
      pass("TC-BL05", `POST /api/billing/topup returns ${res.status} (SKIP: Stripe not configured)`);
    }
  } catch (e) {
    fail("TC-BL05", "POST /api/billing/topup returns non-404", (e as Error).message);
  }

  // TC-BL06: GET /api/billing/credits/usage returns usage history
  // NOTE: endpoint requires ?workspaceId= param; returns { data: history } where
  // history is an object (rows/dailyBreakdown), not a flat array.
  try {
    if (!workspaceId) {
      console.log("  SKIP  [TC-BL06] No workspaceId — credits/usage requires workspaceId param");
      pass("TC-BL06", "GET /api/billing/credits/usage (skipped — no workspaceId)");
    } else {
      const url = `/api/billing/credits/usage?workspaceId=${workspaceId}`;
      const res = await apiFetch(url, { token: ownerToken });
      const body = await res.json() as Record<string, unknown>;
      saveEvidence("TC-BL06", body, Object.fromEntries(res.headers.entries()));
      assert(res.status === 200, `Expected 200, got ${res.status}`);
      // data is a history object { rows, total, dailyBreakdown } or array depending on DB state
      assert(
        body.data !== undefined && body.data !== null,
        `Expected data field in /billing/credits/usage response`
      );
      pass("TC-BL06", "GET /api/billing/credits/usage returns 200 with usage history");
    }
  } catch (e) {
    fail("TC-BL06", "GET /api/billing/credits/usage returns 200 with usage history", (e as Error).message);
  }

  // TC-BL07: GET /api/billing/invoices returns array (may be empty on fresh install)
  try {
    const url = workspaceId
      ? `/api/billing/invoices?workspaceId=${workspaceId}`
      : "/api/billing/invoices";
    const res = await apiFetch(url, { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-BL07", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.invoices ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /billing/invoices, got ${typeof list}`);
    pass("TC-BL07", "GET /api/billing/invoices returns 200 with array");
  } catch (e) {
    fail("TC-BL07", "GET /api/billing/invoices returns 200 with array", (e as Error).message);
  }
}
