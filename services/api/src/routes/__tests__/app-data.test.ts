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
import { SignJWT } from "jose";

// Must be set BEFORE importing modules that read secrets at load time.
process.env.PROJECT_JWT_SECRET = process.env.PROJECT_JWT_SECRET ?? "test-secret-for-app-data-routes";
// app-auth signs/verifies app-session tokens with JWT_SECRET at module load.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-for-app-session";

const PID = "11111111-1111-1111-1111-111111111111";

const { appDataRoutes, __setExecutorForTest, tierGateBlocks, toolNotAllowed } = await import("../app-data.js");
const { signProjectJwt } = await import("../../auth/project-jwt.js");
import type { ResolvedAuth } from "../connector-proxy.js";
import type { WorkerResponse } from "../../data-worker/types.js";

const app = new Hono();
app.route("/", appDataRoutes);

let jwt: string;
before(async () => {
  jwt = await signProjectJwt(
    { kind: "connector-proxy", projectId: PID, workspaceId: "ws1", userId: "user1" } as never,
    process.env.PROJECT_JWT_SECRET!,
  );
});
after(() => __setExecutorForTest(null));

/** Mint an app end-user session token the way routes/app-auth.ts does. */
function appSession(opts: { sub?: string; adm?: boolean; projectId?: string }): Promise<string> {
  return new SignJWT({ projectId: opts.projectId ?? PID, email: "u@app.dev", adm: opts.adm === true, kind: "app-session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(opts.sub ?? "end-user-1")
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!));
}

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

test("x-doable-app-user is IGNORED for a preview JWT (browser-exposed credential)", async () => {
  // Security: only a server-tier API key may assert an arbitrary end-user via
  // x-doable-app-user. A browser-exposed JWT acts only as its own identity, else
  // a user who read the token client-side could impersonate another end-user.
  let seen = "";
  __setExecutorForTest(async (_pid, r): Promise<WorkerResponse> => { seen = String(r.app_user_id); return { id: "x", ok: true, rows: [], rowCount: 0, fields: [] }; });
  await req("/__doable/data/query", { sql: "SELECT 1" }, { "x-doable-app-user": "end-user-42" });
  assert.equal(seen, "user1"); // header ignored → falls back to the JWT's platform user
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

// ── Admin-reads primitive (x-doable-admin elevated cross-user reads) ──────────

test("app-session identity sets app_user_id to the end-user sub", async () => {
  let seen = "";
  __setExecutorForTest(async (_pid, r): Promise<WorkerResponse> => { seen = String(r.app_user_id); return { id: "x", ok: true, rows: [], rowCount: 0, fields: [] }; });
  const tok = await appSession({ sub: "end-user-99" });
  await req("/__doable/data/query", { sql: "SELECT 1" }, { "x-doable-app-session": tok });
  assert.equal(seen, "end-user-99"); // session sub wins over the JWT platform user
});

test("admin session + x-doable-admin:1 sets elevated:true on the worker request", async () => {
  let sawElevated: boolean | undefined;
  __setExecutorForTest(async (_pid, r): Promise<WorkerResponse> => { sawElevated = r.elevated; return { id: "x", ok: true, rows: [{ n: 2 }], rowCount: 1, fields: [{ name: "n" }] }; });
  const tok = await appSession({ adm: true });
  const res = await req("/__doable/data/query", { sql: "SELECT count(*) n FROM orders" }, { "x-doable-app-session": tok, "x-doable-admin": "1" });
  assert.equal(res.status, 200);
  assert.equal(sawElevated, true);
});

test("non-admin session + x-doable-admin:1 => 403 ADMIN_REQUIRED (executor never runs)", async () => {
  let ran = false;
  __setExecutorForTest(async (): Promise<WorkerResponse> => { ran = true; return { id: "x", ok: true, rows: [], rowCount: 0, fields: [] }; });
  const tok = await appSession({ adm: false });
  const res = await req("/__doable/data/query", { sql: "SELECT * FROM orders" }, { "x-doable-app-session": tok, "x-doable-admin": "1" });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "ADMIN_REQUIRED");
  assert.equal(ran, false); // refused before reaching the worker
});

test("no session + x-doable-admin:1 => 403 ADMIN_REQUIRED", async () => {
  __setExecutorForTest(async () => ({ id: "x", ok: true, rows: [], rowCount: 0, fields: [] }));
  const res = await req("/__doable/data/query", { sql: "SELECT * FROM orders" }, { "x-doable-admin": "1" });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { error: { code: string } }).error.code, "ADMIN_REQUIRED");
});

test("admin session from ANOTHER project cannot elevate => 403", async () => {
  __setExecutorForTest(async () => ({ id: "x", ok: true, rows: [], rowCount: 0, fields: [] }));
  const tok = await appSession({ adm: true, projectId: "22222222-2222-2222-2222-222222222222" });
  const res = await req("/__doable/data/query", { sql: "SELECT * FROM orders" }, { "x-doable-app-session": tok, "x-doable-admin": "1" });
  assert.equal(res.status, 403); // verifyAppSession rejects the cross-project token
});

test("plain query (no admin header) leaves elevated falsy", async () => {
  let sawElevated: boolean | undefined = true;
  __setExecutorForTest(async (_pid, r): Promise<WorkerResponse> => { sawElevated = r.elevated; return { id: "x", ok: true, rows: [], rowCount: 0, fields: [] }; });
  const tok = await appSession({ adm: true });
  await req("/__doable/data/query", { sql: "SELECT * FROM orders" }, { "x-doable-app-session": tok });
  assert.notEqual(sawElevated, true);
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
