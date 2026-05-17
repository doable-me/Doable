/**
 * TC-WZ01 – TC-WZ05: Setup wizard API endpoint tests.
 * Requires ownerToken from signup-bootstrap.test.ts.
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runWizardTests(ownerToken: string): Promise<void> {
  // TC-WZ01: GET /api/setup/status returns wizard contract shape
  try {
    const res = await apiFetch("/api/setup/status", { token: ownerToken });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-WZ01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert("isPlatformAdmin"  in body, "Missing isPlatformAdmin in /setup/status");
    assert("setupCompleted"   in body, "Missing setupCompleted in /setup/status");
    assert("fields_configured" in body, "Missing fields_configured in /setup/status");
    pass("TC-WZ01", "GET /api/setup/status returns wizard contract shape");
  } catch (e) {
    fail("TC-WZ01", "GET /api/setup/status returns wizard contract shape", (e as Error).message);
  }

  // TC-WZ02: POST /api/setup/workspace-name saves name and returns {ok,name}
  try {
    const wName = `OOB Workspace ${Date.now()}`;
    const res = await apiFetch("/api/setup/workspace-name", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ name: wName }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-WZ02", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `Expected ok:true, got ${body.ok}`);
    assert(body.name === wName, `Expected name:${wName}, got ${body.name}`);
    pass("TC-WZ02", "POST /api/setup/workspace-name saves name and returns {ok, name}");
  } catch (e) {
    fail("TC-WZ02", "POST /api/setup/workspace-name saves name and returns {ok, name}", (e as Error).message);
  }

  // TC-WZ03: POST /api/setup/ai-provider with provider:anthropic (no key) returns 200
  // We omit apiKey so no external validation call is made
  try {
    const res = await apiFetch("/api/setup/ai-provider", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ provider: "anthropic" }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-WZ03", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `Expected ok:true, got ${body.ok}`);
    pass("TC-WZ03", "POST /api/setup/ai-provider with provider:anthropic returns {ok:true}");
  } catch (e) {
    fail("TC-WZ03", "POST /api/setup/ai-provider with provider:anthropic returns {ok:true}", (e as Error).message);
  }

  // TC-WZ04: POST /api/setup/ai-provider with provider:custom + baseUrl + model returns 200
  try {
    const res = await apiFetch("/api/setup/ai-provider", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({
        provider: "custom",
        baseUrl: "https://api.minimax.io/v1",
        model: "MiniMax-M2.7",
      }),
    });
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-WZ04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(body)}`);
    assert(body.ok === true, `Expected ok:true, got ${body.ok}`);
    pass("TC-WZ04", "POST /api/setup/ai-provider with provider:custom+baseUrl+model returns {ok:true}");
  } catch (e) {
    fail("TC-WZ04", "POST /api/setup/ai-provider with provider:custom+baseUrl+model returns {ok:true}", (e as Error).message);
  }

  // TC-WZ05: POST /api/setup/complete marks wizard done; /setup/status reflects setupCompleted:true
  try {
    const completeRes = await apiFetch("/api/setup/complete", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({}),
    });
    const completeBody = await completeRes.json() as Record<string, unknown>;
    saveEvidence("TC-WZ05-complete", completeBody, Object.fromEntries(completeRes.headers.entries()));
    assert(completeRes.status === 200, `Expected 200 from /setup/complete, got ${completeRes.status}`);
    assert(completeBody.ok === true, `Expected ok:true, got ${completeBody.ok}`);

    const statusRes = await apiFetch("/api/setup/status", { token: ownerToken });
    const statusBody = await statusRes.json() as Record<string, unknown>;
    saveEvidence("TC-WZ05-status", statusBody, Object.fromEntries(statusRes.headers.entries()));
    assert(statusBody.setupCompleted === true, `Expected setupCompleted:true after complete, got ${statusBody.setupCompleted}`);
    pass("TC-WZ05", "POST /api/setup/complete marks wizard done and /setup/status returns setupCompleted:true");
  } catch (e) {
    fail("TC-WZ05", "POST /api/setup/complete marks wizard done and /setup/status returns setupCompleted:true", (e as Error).message);
  }
}
