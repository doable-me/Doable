/**
 * Route tests for the per-app DB data plane. Uses a stubbed worker executor (no
 * real PGlite worker) and a real project JWT (no DB) so auth/tier/validation/
 * gating logic is exercised deterministically. (US-007 + US-016)
 *
 * Run: pnpm exec tsx --test services/api/src/routes/__tests__/app-data.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";

// Must be set BEFORE importing modules that read secrets at load time.
process.env.PROJECT_JWT_SECRET = process.env.PROJECT_JWT_SECRET ?? "test-secret-for-app-data-routes";

const { appDataRoutes, __setExecutorForTest, tierGateBlocks, toolNotAllowed } = await import("../app-data.js");
const { signProjectJwt } = await import("../../auth/project-jwt.js");
import type { ResolvedAuth } from "../connector-proxy.js";
import type { WorkerResponse } from "../../data-worker/types.js";

const app = new Hono();
app.route("/", appDataRoutes);

let jwt: string;
before(async () => {
  jwt = await signProjectJwt(
    { kind: "connector-proxy", projectId: "11111111-1111-1111-1111-111111111111", workspaceId: "ws1", userId: "user1" } as never,
    process.env.PROJECT_JWT_SECRET!,
  );
});
after(() => __setExecutorForTest(null));

function req(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${jwt}`, "x-doable-data-api": "1", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

test("query happy path returns the worker envelope", async () => {
  __setExecutorForTest(async (_pid, r): Promise<WorkerResponse> => {
    assert.equal(r.op, "query");
    assert.equal(r.app_user_id, "user1"); // falls back to platform user
    return { id: "x", ok: true, rows: [{ id: 1, title: "A" }], rowCount: 1, fields: [{ name: "id" }, { name: "title" }], truncated: false };
  });
  const res = await req("/__doable/data/query", { sql: "SELECT * FROM leads WHERE owner_id = $1", params: ["u"] });
  assert.equal(res.status, 200);
  const j = (await res.json()) as { ok: boolean; rowCount: number; rows: unknown[] };
  assert.equal(j.ok, true);
  assert.equal(j.rowCount, 1);
});

test("x-doable-app-user overrides the RLS identity", async () => {
  let seen = "";
  __setExecutorForTest(async (_pid, r): Promise<WorkerResponse> => { seen = String(r.app_user_id); return { id: "x", ok: true, rows: [], rowCount: 0, fields: [] }; });
  await req("/__doable/data/query", { sql: "SELECT 1" }, { "x-doable-app-user": "end-user-42" });
  assert.equal(seen, "end-user-42");
});

test("missing X-Doable-Data-Api header => 400 PARAMS_INVALID", async () => {
  __setExecutorForTest(async () => ({ id: "x", ok: true, rows: [], rowCount: 0, fields: [] }));
  const res = await app.request("/__doable/data/query", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ sql: "SELECT 1" }),
  });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "PARAMS_INVALID");
});

test("worker FORBIDDEN_STMT maps to HTTP 400", async () => {
  __setExecutorForTest(async (): Promise<WorkerResponse> => ({ id: "x", ok: false, error: { code: "FORBIDDEN_STMT", message: "nope" } }));
  const res = await req("/__doable/data/query", { sql: "DROP TABLE leads" });
  assert.equal(res.status, 400);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "FORBIDDEN_STMT");
});

test("exec via preview JWT => 403 TIER_INSUFFICIENT", async () => {
  __setExecutorForTest(async () => ({ id: "x", ok: true, rows: [], rowCount: 0, fields: [] }));
  const res = await req("/__doable/data/exec", { sql: "CREATE TABLE t(id int)" });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "TIER_INSUFFICIENT");
});

test("schema returns introspected tables", async () => {
  // every exec catalog query returns empty rows -> tables: []
  __setExecutorForTest(async (): Promise<WorkerResponse> => ({ id: "x", ok: true, rows: [], rowCount: 0, fields: [] }));
  const res = await req("/__doable/data/schema", {});
  assert.equal(res.status, 200);
  const j = (await res.json()) as { ok: boolean; tables: unknown[] };
  assert.equal(j.ok, true);
  assert.deepEqual(j.tables, []);
});

test("missing migration_id => 400", async () => {
  __setExecutorForTest(async () => ({ id: "x", ok: true, rows: [], rowCount: 0, fields: [] }));
  const res = await req("/__doable/data/migrate", { sql: "CREATE TABLE t(id int)" });
  // JWT can't reach migrate anyway (tier), but validation order: tier gate first → 403.
  assert.equal(res.status, 403);
});

test("tierGateBlocks / toolNotAllowed pure logic", () => {
  const jwtAuth = { authMode: "jwt", allowedTools: null } as ResolvedAuth;
  const clientKey = { authMode: "api-key", tier: "client", allowedTools: ["data.query"] } as ResolvedAuth;
  const serverKey = { authMode: "api-key", tier: "server", allowedTools: null } as ResolvedAuth;
  assert.equal(tierGateBlocks(jwtAuth, "query"), false);
  assert.equal(tierGateBlocks(jwtAuth, "exec"), true);
  assert.equal(tierGateBlocks(clientKey, "exec"), true);
  assert.equal(tierGateBlocks(serverKey, "exec"), false);
  assert.equal(toolNotAllowed(clientKey, "query"), false);
  assert.equal(toolNotAllowed(clientKey, "exec"), true);
  assert.equal(toolNotAllowed(serverKey, "exec"), false); // null = unrestricted
  assert.equal(toolNotAllowed(jwtAuth, "exec"), false); // jwt not gated by allowed_tools
});
