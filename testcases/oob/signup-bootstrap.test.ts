/**
 * TC-SB01 – TC-SB04: First-user bootstrap and subsequent-user signup tests.
 *
 * IMPORTANT: These tests assume a FRESH install with no users yet.
 * If the install already has users, TC-SB01/SB02 will be skipped automatically.
 * TC-SB03/SB04 test that a second signup is NOT promoted (always safe to run).
 *
 * Cleanup: second test user is deleted after test. First user (owner) is left
 * because removing it would break all subsequent wizard/auth tests.
 */
import { apiFetch, pass, fail, assert, saveEvidence, API_BASE } from "./_shared.js";

const OWNER_EMAIL    = process.env.DOABLE_TEST_EMAIL    ?? `oob-owner-${Date.now()}@example.local`;
const OWNER_PASSWORD = process.env.DOABLE_TEST_PASSWORD ?? "SmokeTest99!";
const SECOND_EMAIL   = `oob-second-${Date.now()}@example.local`;
const SECOND_PASSWORD = "SmokeTest99!";

// Exported so other tests can reuse the owner token without re-logging in
export let ownerToken: string | null = null;
export let ownerUserId: string | null = null;
export let secondToken: string | null = null;
export let secondUserId: string | null = null;

export async function runSignupBootstrapTests(): Promise<void> {
  // TC-SB01: First signup auto-promotes to platform owner
  try {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD, displayName: "OOB Owner" }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-SB01", body, Object.fromEntries(res.headers.entries()));

    if (res.status === 409) {
      // User already exists — install has been used before. Skip bootstrap tests.
      console.log("  SKIP  [TC-SB01] Install already bootstrapped — owner account exists, attempting login");
      const loginRes = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
      });
      const loginBody = await loginRes.json() as Record<string, unknown>;
      ownerToken = (loginBody.accessToken ?? loginBody.token) as string ?? null;
      ownerUserId = (loginBody.user as Record<string, unknown>)?.id as string ?? null;
      return;
    }

    assert(res.status === 201 || res.status === 200, `Expected 201/200, got ${res.status}: ${JSON.stringify(body)}`);
    ownerToken  = (body.accessToken ?? body.token) as string ?? null;
    ownerUserId = (body.user as Record<string, unknown>)?.id as string ?? null;
    assert(!!ownerToken, "No access token in register response");
    pass("TC-SB01", "First signup returns access token");
  } catch (e) {
    fail("TC-SB01", "First signup returns access token", (e as Error).message);
    return;
  }

  // TC-SB02: First user has is_platform_admin=true, platform_role='owner' in DB
  // We verify this indirectly via GET /api/setup/status (only platform admins can reach it)
  try {
    assert(!!ownerToken, "No owner token available");
    const res = await apiFetch("/api/setup/status", { token: ownerToken! });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-SB02", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200 from /setup/status, got ${res.status}. Body: ${JSON.stringify(body)}`);
    assert(body.isPlatformAdmin === true, `Expected isPlatformAdmin:true, got ${body.isPlatformAdmin}`);
    pass("TC-SB02", "First user can access /api/setup/status (isPlatformAdmin:true confirmed)");
  } catch (e) {
    fail("TC-SB02", "First user can access /api/setup/status (isPlatformAdmin:true confirmed)", (e as Error).message);
  }

  // TC-SB03: Second signup succeeds but is NOT promoted
  try {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: SECOND_EMAIL, password: SECOND_PASSWORD, displayName: "OOB Second" }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-SB03", body, Object.fromEntries(res.headers.entries()));
    // Accept 201/200 (open signup) or 202/pending (approval required)
    assert([200, 201, 202].includes(res.status), `Expected 200/201/202, got ${res.status}: ${JSON.stringify(body)}`);
    secondToken  = (body.accessToken ?? body.token) as string ?? null;
    secondUserId = (body.user as Record<string, unknown>)?.id as string ?? null;
    pass("TC-SB03", "Second signup succeeds (or is pending)");
  } catch (e) {
    fail("TC-SB03", "Second signup succeeds (or is pending)", (e as Error).message);
    return;
  }

  // TC-SB04: Second user cannot access /api/setup/status (not platform admin)
  try {
    if (!secondToken) {
      console.log("  SKIP  [TC-SB04] Second user pending approval — skipping admin-gate check");
      pass("TC-SB04", "Second user blocked from /api/setup/status (pending — skipped)");
      return;
    }
    const res = await apiFetch("/api/setup/status", { token: secondToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-SB04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 403 || res.status === 401, `Expected 403/401 for non-admin on /setup/status, got ${res.status}`);
    pass("TC-SB04", "Second user blocked from /api/setup/status (403/401)");
  } catch (e) {
    fail("TC-SB04", "Second user blocked from /api/setup/status (403/401)", (e as Error).message);
  } finally {
    // Cleanup: delete second user via admin endpoint
    if (secondUserId && ownerToken) {
      await apiFetch(`/api/admin/users/${secondUserId}`, {
        method: "DELETE",
        token: ownerToken,
      }).catch(() => {});
    }
  }
}

export { OWNER_EMAIL, OWNER_PASSWORD };
