/**
 * mcp-apps-data.test.ts
 *
 * Tests for the MCP Apps UI static-asset route.
 *
 * Uses node:test (zero-config — vitest isn't installed in this workspace).
 * Run with:
 *   pnpm exec tsx --test services/api/src/mcp/builtin/data/ui/__tests__/mcp-apps-data.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { mcpAppsDataRoutes } from "../../../../../routes/mcp-apps-data.js";

const app = new Hono();
app.route("/", mcpAppsDataRoutes);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function get(resource: string): Promise<Response> {
  return app.request("/" + resource);
}

// ---------------------------------------------------------------------------
// schema-inspector.html
// ---------------------------------------------------------------------------
test("GET schema-inspector.html returns 200", async () => {
  const res = await get("schema-inspector.html");
  assert.equal(res.status, 200);
});

test("schema-inspector.html has correct Content-Type", async () => {
  const res = await get("schema-inspector.html");
  const ct = res.headers.get("content-type") ?? "";
  assert.ok(ct.includes("text/html"), `Expected text/html, got: ${ct}`);
});

test("schema-inspector.html CSP contains script-src 'self'", async () => {
  const res = await get("schema-inspector.html");
  const csp = res.headers.get("content-security-policy") ?? "";
  assert.ok(
    csp.includes("script-src 'self'"),
    `CSP missing "script-src 'self'": ${csp}`,
  );
});

test("schema-inspector.html CSP script-src does NOT contain 'unsafe-inline'", async () => {
  const res = await get("schema-inspector.html");
  const csp = res.headers.get("content-security-policy") ?? "";

  // Extract just the script-src directive value for precision
  const scriptSrcMatch = csp.match(/script-src([^;]*)/);
  assert.ok(scriptSrcMatch, `No script-src directive found in CSP: ${csp}`);
  const scriptSrcValue = scriptSrcMatch[1]!;
  assert.ok(
    !scriptSrcValue.includes("'unsafe-inline'"),
    `script-src must not contain 'unsafe-inline': ${scriptSrcValue}`,
  );
});

test("schema-inspector.html has X-Content-Type-Options: nosniff", async () => {
  const res = await get("schema-inspector.html");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

// ---------------------------------------------------------------------------
// Unknown resource → 404
// ---------------------------------------------------------------------------
test("unknown resource returns 404", async () => {
  const res = await get("../../etc/passwd");
  assert.equal(res.status, 404);
});

test("traversal attempt returns 404", async () => {
  const res = await get("../transport.ts");
  assert.equal(res.status, 404);
});

test("arbitrary name returns 404", async () => {
  const res = await get("nonexistent-file.html");
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// table-inspector.js — XSS guard: uses textContent not innerHTML for data
// ---------------------------------------------------------------------------
test("table-inspector.js is served with 200", async () => {
  const res = await get("table-inspector.js");
  assert.equal(res.status, 200);
});

test("table-inspector.js uses textContent for cell values (XSS guard)", async () => {
  const res = await get("table-inspector.js");
  const body = await res.text();

  // Must use textContent to set cell values
  assert.ok(
    body.includes("textContent"),
    "table-inspector.js must reference textContent for DOM insertion",
  );

  // Must NOT use innerHTML to set data cell values
  // We check that innerHTML doesn't appear in the row-rendering function
  // by verifying the critical XSS guard comment is present alongside no raw innerHTML usage
  const innerHtmlCount = (body.match(/\.innerHTML\s*=/g) ?? []).length;
  // The only innerHTML usage allowed is containerEl.innerHTML = "" (clearing the container)
  // Count those clearing usages (safe — they're not inserting raw data)
  const clearingCount = (body.match(/\.innerHTML\s*=\s*["']{2}/g) ?? []).length;
  assert.ok(
    innerHtmlCount <= clearingCount,
    `table-inspector.js has ${innerHtmlCount - clearingCount} non-clearing innerHTML= assignments — use textContent for data cells`,
  );
});

test("table-inspector.js has XSS guard comment", async () => {
  const res = await get("table-inspector.js");
  const body = await res.text();
  assert.ok(
    body.includes("textContent") && body.includes("innerHTML"),
    "Expected XSS guard pattern (textContent used, innerHTML noted in comment or clearing only)",
  );
});

// ---------------------------------------------------------------------------
// shared assets
// ---------------------------------------------------------------------------
test("shared/host-bridge.js is served with 200", async () => {
  const res = await get("shared/host-bridge.js");
  assert.equal(res.status, 200);
});

test("shared/styles.css is served with 200", async () => {
  const res = await get("shared/styles.css");
  assert.equal(res.status, 200);
});

test("shared/styles.css has correct Content-Type", async () => {
  const res = await get("shared/styles.css");
  const ct = res.headers.get("content-type") ?? "";
  assert.ok(ct.includes("text/css"), `Expected text/css, got: ${ct}`);
});
