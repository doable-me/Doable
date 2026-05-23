/**
 * Builtin doable.data MCP transport (US-009 + US-010). Verifies the JSON-RPC
 * surface (initialize / tools/list / tools/call) and that tools route into the
 * worker executor with the right op/identity, using an injected fake executor
 * (no real PGlite worker). Also asserts the createTransport builtin: short-circuit.
 *
 * Run: pnpm exec tsx --test services/api/src/mcp/builtin/data/__tests__/transport.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { DataBuiltinTransport, DATA_TOOL_DEFS } from "../transport.js";
import { createTransport } from "../../../transport.js";
import type { WorkerRequest, WorkerResponse } from "../../../../data-worker/types.js";

function rpc(method: string, params?: Record<string, unknown>) {
  return { jsonrpc: "2.0" as const, id: 1, method, params };
}
const okRows = (rows: unknown[] = []): WorkerResponse => ({ id: "x", ok: true, rows, rowCount: rows.length, fields: [] });

test("tools/list exposes the 5 data.* tools with _meta.ui on schema+inspect", async () => {
  const t = new DataBuiltinTransport("p1", async () => okRows());
  const res = await t.sendRequest(rpc("tools/list"));
  const tools = (res.result as { tools: Array<{ name: string; _meta?: { ui?: { resourceUri?: string } } }> }).tools;
  assert.deepEqual(tools.map((x) => x.name), ["data.query", "data.exec", "data.migrate", "data.schema", "data.inspect"]);
  const schema = tools.find((x) => x.name === "data.schema")!;
  const inspect = tools.find((x) => x.name === "data.inspect")!;
  assert.equal(schema._meta?.ui?.resourceUri, "ui://doable.data/schema-inspector");
  assert.equal(inspect._meta?.ui?.resourceUri, "ui://doable.data/table-inspector?table={table}");
});

test("initialize returns server capabilities", async () => {
  const t = new DataBuiltinTransport("p1", async () => okRows());
  const res = await t.sendRequest(rpc("initialize"));
  const r = res.result as { serverInfo: { name: string }; capabilities: { tools: unknown } };
  assert.equal(r.serverInfo.name, "doable.data");
  assert.ok(r.capabilities.tools);
});

test("data.query routes to query op and passes app_user_id", async () => {
  let seen: Omit<WorkerRequest, "id"> | null = null;
  const t = new DataBuiltinTransport("p1", async (_pid, req) => { seen = req; return okRows([{ id: 1 }]); });
  const res = await t.sendRequest(rpc("tools/call", { name: "data.query", arguments: { sql: "SELECT 1", app_user_id: "alice" } }));
  assert.equal(seen!.op, "query");
  assert.equal(seen!.app_user_id, "alice");
  const content = (res.result as { content: Array<{ text: string }> }).content[0]!.text;
  assert.equal((JSON.parse(content) as { ok: boolean; rowCount: number }).rowCount, 1);
});

test("data.exec routes to exec op with RLS bypass (app_user_id null)", async () => {
  let seen: Omit<WorkerRequest, "id"> | null = null;
  const t = new DataBuiltinTransport("p1", async (_pid, req) => { seen = req; return okRows(); });
  await t.sendRequest(rpc("tools/call", { name: "data.exec", arguments: { sql: "CREATE TABLE t(id int)" } }));
  assert.equal(seen!.op, "exec");
  assert.equal(seen!.app_user_id, null);
});

test("data.migrate applies and reports applied:true", async () => {
  // fake executor: every exec ok; the ledger lookup returns no rows -> applies.
  const t = new DataBuiltinTransport("p1", async () => okRows([]));
  const res = await t.sendRequest(rpc("tools/call", { name: "data.migrate", arguments: { migration_id: "0001_init", sql: "CREATE TABLE t(id int)" } }));
  const out = JSON.parse((res.result as { content: Array<{ text: string }> }).content[0]!.text) as { applied: boolean; migration_id: string };
  assert.equal(out.applied, true);
  assert.equal(out.migration_id, "0001_init");
});

test("data.schema returns tables array", async () => {
  const t = new DataBuiltinTransport("p1", async () => okRows([]));
  const res = await t.sendRequest(rpc("tools/call", { name: "data.schema" }));
  const out = JSON.parse((res.result as { content: Array<{ text: string }> }).content[0]!.text) as { tables: unknown[] };
  assert.deepEqual(out.tables, []);
});

test("unknown tool -> JSON-RPC error", async () => {
  const t = new DataBuiltinTransport("p1", async () => okRows());
  const res = await t.sendRequest(rpc("tools/call", { name: "data.nonsense" }));
  assert.ok(res.error);
});

test("createTransport short-circuits builtin: serverCommand", async () => {
  const t = createTransport("stdio", { serverCommand: "builtin:data", projectId: "p1" });
  await t.connect();
  assert.equal(t.isConnected(), true);
  const res = await t.sendRequest(rpc("tools/list"));
  assert.equal((res.result as { tools: unknown[] }).tools.length, 5);
});

test("DATA_TOOL_DEFS is a stable 5-tool contract", () => {
  assert.equal(DATA_TOOL_DEFS.length, 5);
});
