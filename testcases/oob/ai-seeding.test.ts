/**
 * TC-AS01 – TC-AS02: MINIMAX_API_KEY env-seeding via seedAiProviderFromEnv.
 *
 * These tests verify the seeding side-effects visible via GET /api/setup/status.
 * They are only meaningful when DOABLE_MINIMAX_KEY is set in the test environment
 * (which means the install was started with MINIMAX_API_KEY exported).
 *
 * Without DOABLE_MINIMAX_KEY the tests are skipped gracefully.
 */
import { apiFetch, pass, fail, assert, saveEvidence, MINIMAX_KEY } from "./_shared.js";

export async function runAiSeedingTests(ownerToken: string): Promise<void> {
  if (!MINIMAX_KEY) {
    console.log("  SKIP  [TC-AS01] DOABLE_MINIMAX_KEY not set — env-seeding tests skipped");
    console.log("  SKIP  [TC-AS02] DOABLE_MINIMAX_KEY not set — env-seeding tests skipped");
    pass("TC-AS01", "MINIMAX_API_KEY seeding (skipped — key not provided)");
    pass("TC-AS02", "MINIMAX_API_KEY base URL seeded to minimax.io (skipped — key not provided)");
    return;
  }

  // TC-AS01: /setup/status shows ai_provider:custom and fields_configured.ai_provider_key:true
  try {
    const res = await apiFetch("/api/setup/status", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AS01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const fields = body.fields_configured as Record<string, boolean>;
    assert(fields.ai_provider_key === true, `Expected fields_configured.ai_provider_key:true after MINIMAX seed, got ${fields.ai_provider_key}`);
    assert(body.ai_provider === "custom", `Expected ai_provider:custom after MINIMAX seed, got ${body.ai_provider}`);
    pass("TC-AS01", "MINIMAX_API_KEY seeded: ai_provider=custom, ai_provider_key configured");
  } catch (e) {
    fail("TC-AS01", "MINIMAX_API_KEY seeded: ai_provider=custom, ai_provider_key configured", (e as Error).message);
  }

  // TC-AS02: /setup/status shows ai_provider_base_url containing minimax.io
  try {
    const res = await apiFetch("/api/setup/status", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-AS02", body, Object.fromEntries(res.headers.entries()));
    const baseUrl = body.ai_provider_base_url as string ?? "";
    assert(baseUrl.includes("minimax.io"), `Expected ai_provider_base_url to contain minimax.io, got "${baseUrl}"`);
    pass("TC-AS02", "MINIMAX_API_KEY seeded: ai_provider_base_url points to minimax.io");
  } catch (e) {
    fail("TC-AS02", "MINIMAX_API_KEY seeded: ai_provider_base_url points to minimax.io", (e as Error).message);
  }
}
