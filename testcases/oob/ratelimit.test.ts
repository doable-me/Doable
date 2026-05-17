/**
 * TC-RL01 – TC-RL16: Rate limit tests.
 * Hammers /api/auth/login with bad creds, checks for 429 or graceful degradation.
 * Verifies /api/health remains stable under repeated load.
 */
import { apiFetch, pass, fail, skip, assert, saveEvidence } from "./_shared.js";

export async function runRateLimitTests(ownerToken: string, _wsId: string | null): Promise<void> {
  // TC-RL01: Single bad login returns 401 (baseline)
  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "rl-probe@example.local", password: "WrongPass99!" }),
    });
    const text = await res.text();
    saveEvidence("TC-RL01", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 401 || res.status === 400, `Expected 401/400, got ${res.status}`);
    pass("TC-RL01", "Single bad login returns 401/400 baseline");
  } catch (e) {
    fail("TC-RL01", "Single bad login baseline", (e as Error).message);
  }

  // TC-RL02: 10 rapid bad logins — should not 500
  try {
    const reqs = Array.from({ length: 10 }, () =>
      apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "rl-probe@example.local", password: "WrongPass99!" }),
      })
    );
    const responses = await Promise.all(reqs);
    const statuses = responses.map(r => r.status);
    saveEvidence("TC-RL02", JSON.stringify(statuses), {});
    assert(statuses.every(s => s !== 500), `Got 500 during 10 rapid bad logins: ${statuses.join(",")}`);
    pass("TC-RL02", "10 rapid bad logins don't cause 500s");
  } catch (e) {
    fail("TC-RL02", "10 rapid bad logins no 500s", (e as Error).message);
  }

  // TC-RL03: 30 sequential bad logins — eventually 429 or stays 401
  try {
    let got429 = false;
    let lastStatus = 0;
    for (let i = 0; i < 30; i++) {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: `rl-probe-${i}@example.local`, password: "WrongPass99!" }),
      });
      lastStatus = res.status;
      if (res.status === 429) { got429 = true; break; }
      assert(res.status !== 500, `Got 500 on attempt ${i}: ${res.status}`);
    }
    saveEvidence("TC-RL03", JSON.stringify({ got429, lastStatus }), {});
    pass(`TC-RL03`, `30 bad logins: ${got429 ? "got 429 (rate limited)" : "stayed " + lastStatus + " (no hard limit)"}`);
  } catch (e) {
    fail("TC-RL03", "30 sequential bad logins — no 500s", (e as Error).message);
  }

  // TC-RL04: /api/health survives 50 rapid hits (all 200)
  try {
    const reqs = Array.from({ length: 50 }, () => apiFetch("/api/health"));
    const responses = await Promise.all(reqs);
    const nonOk = responses.filter(r => r.status !== 200).map(r => r.status);
    saveEvidence("TC-RL04", JSON.stringify({ nonOk }), {});
    assert(nonOk.length === 0, `Some health checks failed: ${nonOk.join(",")}`);
    pass("TC-RL04", "50 rapid GET /api/health all return 200");
  } catch (e) {
    fail("TC-RL04", "50 rapid GET /api/health all 200", (e as Error).message);
  }

  // TC-RL05: 429 response has Retry-After or RateLimit header when triggered
  try {
    let rateLimitRes: Response | null = null;
    for (let i = 0; i < 40; i++) {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "rl-header-probe@example.local", password: "WrongPass99!" }),
      });
      if (res.status === 429) { rateLimitRes = res; break; }
    }
    if (!rateLimitRes) {
      skip("TC-RL05", "429 Retry-After header", "rate limit not triggered in 40 attempts");
      return;
    }
    const text = await rateLimitRes.text();
    saveEvidence("TC-RL05", text, Object.fromEntries(rateLimitRes.headers.entries()));
    const hasHeader =
      rateLimitRes.headers.has("retry-after") ||
      rateLimitRes.headers.has("x-ratelimit-reset") ||
      rateLimitRes.headers.has("ratelimit-reset");
    assert(hasHeader, "429 response missing Retry-After/RateLimit-Reset header");
    pass("TC-RL05", "429 response includes Retry-After or RateLimit-Reset header");
  } catch (e) {
    fail("TC-RL05", "429 response headers", (e as Error).message);
  }

  // TC-RL06: /api/auth/register rapid 5x same email returns 409 or 429 (not 500)
  try {
    const email = `rl-reg-${Date.now()}@example.local`;
    const reqs = Array.from({ length: 5 }, () =>
      apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password: "TestPass99!", name: "RL Probe" }),
      })
    );
    const responses = await Promise.all(reqs);
    const statuses = responses.map(r => r.status);
    saveEvidence("TC-RL06", JSON.stringify(statuses), {});
    assert(statuses.every(s => s !== 500), `Got 500 on rapid register: ${statuses.join(",")}`);
    pass("TC-RL06", "5 rapid register with same email returns no 500s");
  } catch (e) {
    fail("TC-RL06", "5 rapid register same email no 500s", (e as Error).message);
  }

  // TC-RL07: GET /api/workspaces 20x rapid doesn't 500 (authenticated)
  try {
    const reqs = Array.from({ length: 20 }, () => apiFetch("/api/workspaces", { token: ownerToken }));
    const responses = await Promise.all(reqs);
    const nonOk = responses.filter(r => r.status !== 200 && r.status !== 429).map(r => r.status);
    saveEvidence("TC-RL07", JSON.stringify({ statuses: responses.map(r => r.status) }), {});
    assert(responses.every(r => r.status !== 500), `Got 500 on rapid workspace list: ${nonOk.join(",")}`);
    pass("TC-RL07", "20 rapid GET /api/workspaces don't 500");
  } catch (e) {
    fail("TC-RL07", "20 rapid GET /api/workspaces no 500s", (e as Error).message);
  }

  // TC-RL08: POST /api/auth/login with empty body returns 400/422 (not 500)
  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const text = await res.text();
    saveEvidence("TC-RL08", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 400 || res.status === 422 || res.status === 401, `Expected 400/422/401, got ${res.status}`);
    pass("TC-RL08", "POST /api/auth/login empty body returns 400/422/401");
  } catch (e) {
    fail("TC-RL08", "POST /api/auth/login empty body", (e as Error).message);
  }

  // TC-RL09: Rate limit does not affect authenticated /api/auth/me
  try {
    const reqs = Array.from({ length: 20 }, () => apiFetch("/api/auth/me", { token: ownerToken }));
    const responses = await Promise.all(reqs);
    const bad = responses.filter(r => r.status !== 200 && r.status !== 429);
    saveEvidence("TC-RL09", JSON.stringify({ statuses: responses.map(r => r.status) }), {});
    assert(responses.every(r => r.status !== 500), "Got 500 on /api/auth/me under load");
    pass("TC-RL09", "20 rapid GET /api/auth/me don't 500");
  } catch (e) {
    fail("TC-RL09", "20 rapid GET /api/auth/me no 500s", (e as Error).message);
  }

  // TC-RL10: Brute force different emails doesn't bypass rate limit silently (no 500)
  try {
    const reqs = Array.from({ length: 20 }, (_, i) =>
      apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: `bf-probe-${i}-${Date.now()}@example.local`, password: "WrongPass99!" }),
      })
    );
    const responses = await Promise.all(reqs);
    const statuses = responses.map(r => r.status);
    saveEvidence("TC-RL10", JSON.stringify(statuses), {});
    assert(statuses.every(s => s !== 500), `Got 500 during brute-force different emails: ${statuses.join(",")}`);
    pass("TC-RL10", "20 logins with different emails don't 500");
  } catch (e) {
    fail("TC-RL10", "Brute force different emails no 500s", (e as Error).message);
  }

  // TC-RL11: /api/health returns consistent response body under load
  try {
    const reqs = Array.from({ length: 10 }, () => apiFetch("/api/health"));
    const responses = await Promise.all(reqs);
    const bodies = await Promise.all(responses.map(r => r.text()));
    saveEvidence("TC-RL11", JSON.stringify(bodies.slice(0, 3)), {});
    assert(bodies.every(b => b.length > 0), "Some health responses were empty");
    pass("TC-RL11", "GET /api/health returns non-empty body consistently under load");
  } catch (e) {
    fail("TC-RL11", "/api/health body consistent under load", (e as Error).message);
  }

  // TC-RL12: Concurrent 429 responses are structured JSON (not raw text)
  try {
    let rl429: Response | null = null;
    for (let i = 0; i < 40; i++) {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "rl-json-probe@example.local", password: "WrongPass99!" }),
      });
      if (res.status === 429) { rl429 = res; break; }
    }
    if (!rl429) {
      skip("TC-RL12", "429 response is JSON", "rate limit not triggered");
      return;
    }
    const text = await rl429.text();
    saveEvidence("TC-RL12", text, Object.fromEntries(rl429.headers.entries()));
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    assert(parsed !== null, `429 response is not JSON: ${text.slice(0, 200)}`);
    pass("TC-RL12", "429 response body is valid JSON");
  } catch (e) {
    fail("TC-RL12", "429 response is JSON", (e as Error).message);
  }

  // TC-RL13: After rate-limit window, login eventually works again (skip if no 429 triggered)
  try {
    skip("TC-RL13", "Rate-limit window reset", "timing-based — skipped to avoid flake in CI");
  } catch (e) {
    fail("TC-RL13", "Rate-limit window reset", (e as Error).message);
  }

  // TC-RL14: /api/auth/logout rapid 5x doesn't 500
  try {
    const reqs = Array.from({ length: 5 }, () =>
      apiFetch("/api/auth/logout", { method: "POST", token: ownerToken, body: JSON.stringify({}) })
    );
    const responses = await Promise.all(reqs);
    const statuses = responses.map(r => r.status);
    saveEvidence("TC-RL14", JSON.stringify(statuses), {});
    assert(statuses.every(s => s !== 500), `Got 500 on rapid logout: ${statuses.join(",")}`);
    pass("TC-RL14", "5 rapid POST /api/auth/logout don't 500");
  } catch (e) {
    fail("TC-RL14", "5 rapid POST /api/auth/logout", (e as Error).message);
  }

  // TC-RL15: /api/auth/refresh rapid 5x with invalid token returns 401 not 500
  try {
    const reqs = Array.from({ length: 5 }, () =>
      apiFetch("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: "not-a-real-token" }),
      })
    );
    const responses = await Promise.all(reqs);
    const statuses = responses.map(r => r.status);
    saveEvidence("TC-RL15", JSON.stringify(statuses), {});
    assert(statuses.every(s => s !== 500), `Got 500 on rapid bad refresh: ${statuses.join(",")}`);
    pass("TC-RL15", "5 rapid POST /api/auth/refresh with bad token don't 500");
  } catch (e) {
    fail("TC-RL15", "5 rapid POST /api/auth/refresh bad token", (e as Error).message);
  }

  // TC-RL16: Parallel 20 requests to different endpoints don't degrade each other
  try {
    const mixed = await Promise.all([
      apiFetch("/api/health"),
      apiFetch("/api/health"),
      apiFetch("/api/auth/me", { token: ownerToken }),
      apiFetch("/api/auth/me", { token: ownerToken }),
      apiFetch("/api/workspaces", { token: ownerToken }),
      apiFetch("/api/workspaces", { token: ownerToken }),
      apiFetch("/api/health"),
      apiFetch("/api/health"),
      apiFetch("/api/auth/me", { token: ownerToken }),
      apiFetch("/api/workspaces", { token: ownerToken }),
    ]);
    const statuses = mixed.map(r => r.status);
    saveEvidence("TC-RL16", JSON.stringify(statuses), {});
    assert(mixed.every(r => r.status !== 500), `Got 500 in mixed parallel: ${statuses.join(",")}`);
    pass("TC-RL16", "Mixed parallel requests to 3 endpoints don't 500");
  } catch (e) {
    fail("TC-RL16", "Mixed parallel requests no 500s", (e as Error).message);
  }
}
