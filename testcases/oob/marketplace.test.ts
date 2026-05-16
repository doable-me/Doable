/**
 * TC-MK01 – TC-MK06: Marketplace template listing and detail endpoints.
 * These are public routes — no token required for reads.
 * Requires ownerToken only for install endpoint.
 */
import { apiFetch, pass, fail, assert, saveEvidence } from "./_shared.js";

export async function runMarketplaceTests(ownerToken: string, workspaceId: string | null): Promise<void> {
  // TC-MK01: GET /api/marketplace returns marketplace summary object
  // NOTE: endpoint returns { data: { categories, featured, total }, links } — not a flat array.
  // It is a catalog summary / homepage payload per BUG-PUB-003.
  try {
    const res = await apiFetch("/api/marketplace");
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-MK01", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    // data is an object with categories/featured keys, or a direct array from some implementations
    const data = body.data as Record<string, unknown> | undefined;
    const hasExpectedShape = (
      data !== null && data !== undefined && typeof data === "object" &&
      ("categories" in data || "featured" in data || "listings" in data || "total" in data)
    ) || Array.isArray(body.data) || Array.isArray(body.listings) || Array.isArray(body.items);
    assert(hasExpectedShape, `Expected marketplace summary object or array from /marketplace, got: ${JSON.stringify(body).slice(0, 200)}`);
    pass("TC-MK01", "GET /api/marketplace returns 200 with marketplace data");
  } catch (e) {
    fail("TC-MK01", "GET /api/marketplace returns 200 with marketplace data", (e as Error).message);
  }

  // TC-MK02: GET /api/marketplace/categories returns category list
  try {
    const res = await apiFetch("/api/marketplace/categories");
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-MK02", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.categories ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /marketplace/categories, got ${typeof list}`);
    pass("TC-MK02", "GET /api/marketplace/categories returns 200 with categories array");
  } catch (e) {
    fail("TC-MK02", "GET /api/marketplace/categories returns 200 with categories array", (e as Error).message);
  }

  // TC-MK03: GET /api/marketplace/featured returns featured listings
  try {
    const res = await apiFetch("/api/marketplace/featured");
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-MK03", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.featured ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /marketplace/featured, got ${typeof list}`);
    pass("TC-MK03", "GET /api/marketplace/featured returns 200 with array");
  } catch (e) {
    fail("TC-MK03", "GET /api/marketplace/featured returns 200 with array", (e as Error).message);
  }

  // TC-MK04: GET /api/marketplace/listings returns paginated listing array
  try {
    const res = await apiFetch("/api/marketplace/listings?page=1&pageSize=10");
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-MK04", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const list = (body.data ?? body.listings ?? body) as unknown[];
    assert(Array.isArray(list), `Expected array from /marketplace/listings, got ${typeof list}`);
    pass("TC-MK04", "GET /api/marketplace/listings returns 200 with paginated array");
  } catch (e) {
    fail("TC-MK04", "GET /api/marketplace/listings returns 200 with paginated array", (e as Error).message);
  }

  // TC-MK05: GET /api/marketplace/listings/:slug with unknown slug returns 404
  try {
    const res = await apiFetch("/api/marketplace/listings/this-slug-does-not-exist-oob-test");
    const text = await res.text();
    saveEvidence("TC-MK05", text, Object.fromEntries(res.headers.entries()));
    assert(res.status === 404, `Expected 404 for unknown listing slug, got ${res.status}`);
    pass("TC-MK05", "GET /api/marketplace/listings/:unknownSlug returns 404");
  } catch (e) {
    fail("TC-MK05", "GET /api/marketplace/listings/:unknownSlug returns 404", (e as Error).message);
  }

  // TC-MK06: GET /api/marketplace/feed.json returns JSON feed
  try {
    const res = await apiFetch("/api/marketplace/feed.json");
    const body = await res.json() as Record<string, unknown>;
    saveEvidence("TC-MK06", body, Object.fromEntries(res.headers.entries()));
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(typeof body === "object" && body !== null, "Expected object from /marketplace/feed.json");
    pass("TC-MK06", "GET /api/marketplace/feed.json returns 200 with JSON feed object");
  } catch (e) {
    fail("TC-MK06", "GET /api/marketplace/feed.json returns 200 with JSON feed object", (e as Error).message);
  }
}
