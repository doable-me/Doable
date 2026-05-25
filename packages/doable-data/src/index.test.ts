import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DoableDataClient, createDataClient, db } from "./index.ts";

// ─── Fetch stub helpers ────────────────────────────────────────────────────────

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

let origFetch: typeof globalThis.fetch;

function stubFetch(impl: FetchStub): void {
  (globalThis as Record<string, unknown>)["fetch"] = impl;
}

function restoreFetch(): void {
  (globalThis as Record<string, unknown>)["fetch"] = origFetch;
}

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

before(() => {
  origFetch = globalThis.fetch;
});

after(() => {
  restoreFetch();
});

describe("DoableDataClient.query()", () => {
  it("POSTs to /__doable/data/query with correct headers and body", async () => {
    const expected: unknown[] = [];
    const responseBody = {
      ok: true,
      rows: [{ id: "abc" }],
      rowCount: 1,
      fields: [{ name: "id", type: "uuid" }],
      truncated: false,
      elapsed_ms: 5,
    };

    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;

    stubFetch(async (input, init) => {
      capturedUrl = input.toString();
      capturedInit = init;
      return makeResponse(responseBody);
    });

    const client = createDataClient({ token: "test-token", baseUrl: "http://localhost:4000" });
    const result = await client.query<{ id: string }>(
      "SELECT id FROM leads WHERE created_by = $1",
      ["user-1"],
      { row_cap: 50, timeout_ms: 2000 },
    );

    assert.equal(capturedUrl, "http://localhost:4000/__doable/data/query");
    assert.ok(capturedInit, "fetch init should be set");

    const headers = capturedInit!.headers as Record<string, string>;
    assert.equal(headers["authorization"], "Bearer test-token");
    assert.equal(headers["x-doable-data-api"], "1");
    assert.equal(headers["content-type"], "application/json");

    const sentBody = JSON.parse(capturedInit!.body as string);
    assert.equal(sentBody.sql, "SELECT id FROM leads WHERE created_by = $1");
    assert.deepEqual(sentBody.params, ["user-1"]);
    assert.equal(sentBody.row_cap, 50);
    assert.equal(sentBody.timeout_ms, 2000);

    assert.equal(result.ok, true);
    assert.deepEqual(result.rows, [{ id: "abc" }]);
    assert.equal(result.rowCount, 1);

    restoreFetch();
  });
});

describe("DoableDataClient.exec()", () => {
  it("throws synchronously with the documented message", () => {
    const client = createDataClient({ token: "tok" });
    assert.throws(
      () => client.exec(),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, "[doable.data] db.exec() is server-only — call from MCP, not the app.");
        return true;
      },
    );
  });
});

describe("503 retry behaviour", () => {
  it("retries on 503 and returns the 200 body", async () => {
    let callCount = 0;
    const successBody = {
      ok: true,
      rows: [],
      rowCount: 0,
      fields: [],
      truncated: false,
      elapsed_ms: 3,
    };

    stubFetch(async () => {
      callCount += 1;
      if (callCount === 1) return makeResponse({ ok: false }, 503);
      return makeResponse(successBody, 200);
    });

    const client = createDataClient({ token: "tok" });
    const result = await client.query("SELECT 1");

    assert.equal(callCount, 2, "should have been called twice (1 × 503 + 1 × 200)");
    assert.equal(result.ok, true);

    restoreFetch();
  });
});

describe("lazy token resolution", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"];
    restoreFetch();
  });

  it("reads __DOABLE_DATA_TOKEN from globalThis at call time when constructed with empty token", async () => {
    let capturedAuth: string | undefined;

    stubFetch(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      capturedAuth = headers["authorization"];
      return makeResponse({ ok: true, rows: [], rowCount: 0, fields: [], truncated: false, elapsed_ms: 1 });
    });

    // Set token AFTER constructing the client (simulates runtime injection)
    (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] = "injected-tok";

    const result = await db.query("SELECT 1");
    assert.equal(capturedAuth, "Bearer injected-tok");
    assert.equal(result.ok, true);
  });
});

describe("token-timing race", () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"];
    restoreFetch();
  });

  it("awaits a token injected after the call starts (bridge round-trip) — never sends empty Bearer", async () => {
    const auths: string[] = [];
    stubFetch(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      auths.push(headers["authorization"]);
      return makeResponse({ ok: true, rows: [{ id: "x" }], rowCount: 1, fields: [], truncated: false, elapsed_ms: 1 });
    });

    // No token yet — simulate the bridge delivering it 120ms after the query fires.
    setTimeout(() => {
      (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] = "late-tok";
    }, 120);

    const result = await db.query("SELECT 1");
    // The request must have used the late token, never an empty Bearer.
    assert.equal(auths.length, 1, "should fire exactly one request once the token arrives");
    assert.equal(auths[0], "Bearer late-tok");
    assert.equal(result.ok, true);
  });

  it("retries once when the server 401s, after the token has since arrived", async () => {
    const auths: string[] = [];
    let callCount = 0;
    stubFetch(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      auths.push(headers["authorization"]);
      callCount += 1;
      if (callCount === 1) {
        // First call: token raced in as empty/expired → server rejects.
        // Now the bridge populates the global so the retry can pick it up.
        (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] = "refreshed-tok";
        return makeResponse({ ok: false, error: { code: "unauthorized", message: "jwt" } }, 401);
      }
      return makeResponse({ ok: true, rows: [], rowCount: 0, fields: [], truncated: false, elapsed_ms: 1 });
    });

    // Seed a stale token so resolveToken returns immediately on the first call.
    (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"] = "stale-tok";

    const result = await db.query("SELECT 1");
    assert.equal(callCount, 2, "should retry exactly once after 401");
    assert.equal(auths[0], "Bearer stale-tok");
    assert.equal(auths[1], "Bearer refreshed-tok");
    assert.equal(result.ok, true);
  });

  it("no-op fast path: an explicit constructor token never waits or refreshes", async () => {
    let callCount = 0;
    stubFetch(async () => {
      callCount += 1;
      return makeResponse({ ok: false, error: { code: "unauthorized", message: "jwt" } }, 401);
    });

    const client = createDataClient({ token: "explicit-tok", baseUrl: "http://localhost:4000" });
    const result = await client.query("SELECT 1");
    // Even on a 401, an explicitly-provided token must not trigger the
    // refresh-and-retry path (that path is only for the lazy/global token).
    assert.equal(callCount, 1, "explicit token should fire exactly one request");
    assert.equal(result.ok, false);
  });
});
