/**
 * TC-H01 – TC-H04: Health endpoint smoke tests
 * Validates: /api/health, /api/health/live, /api/health/ready, / (web)
 */
import { apiFetch, pass, fail, assert, expectJson, BASE, API_BASE } from "./_shared.js";

export async function runHealthTests(): Promise<void> {
  // TC-H01: /api/health returns 200 with status:healthy + db.status:up
  try {
    const res = await apiFetch("/api/health");
    const body = await expectJson(res, "TC-H01") as Record<string, unknown>;
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(body.status === "healthy", `Expected status:healthy, got ${body.status}`);
    const checks = body.checks as Record<string, unknown>;
    const db = checks?.database as Record<string, unknown>;
    assert(db?.status === "up", `Expected db status:up, got ${db?.status}`);
    pass("TC-H01", "/api/health returns 200 with status:healthy and database:up");
  } catch (e) {
    fail("TC-H01", "/api/health returns 200 with status:healthy and database:up", (e as Error).message);
  }

  // TC-H02: /api/health/live returns 200 with status:alive
  try {
    const res = await apiFetch("/api/health/live");
    const body = await expectJson(res, "TC-H02") as Record<string, unknown>;
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(body.status === "alive", `Expected status:alive, got ${body.status}`);
    pass("TC-H02", "/api/health/live returns 200 with status:alive");
  } catch (e) {
    fail("TC-H02", "/api/health/live returns 200 with status:alive", (e as Error).message);
  }

  // TC-H03: /api/health/ready returns 200 with status:ready
  try {
    const res = await apiFetch("/api/health/ready");
    const body = await expectJson(res, "TC-H03") as Record<string, unknown>;
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(body.status === "ready", `Expected status:ready, got ${body.status}`);
    pass("TC-H03", "/api/health/ready returns 200 with status:ready");
  } catch (e) {
    fail("TC-H03", "/api/health/ready returns 200 with status:ready", (e as Error).message);
  }

  // TC-H04: web root (/) returns 200
  try {
    const webBase = process.env.DOABLE_WEB_BASE ?? BASE;
    // @ts-ignore
    const res = await fetch(`${webBase}/`, { redirect: "follow" });
    assert(res.status === 200, `Expected 200 from web root, got ${res.status}`);
    pass("TC-H04", "Web root / returns 200");
  } catch (e) {
    fail("TC-H04", "Web root / returns 200", (e as Error).message);
  }
}
