/**
 * End-to-end MCP control-plane test against a REAL PGlite worker (US-010), also
 * covering the architect-review fixes:
 *   - M3: data.migrate idempotency (replay returns already_applied).
 *   - M1: the ::text RLS template fails closed cleanly (no uuid-cast error).
 *   - M2: data.inspect threads app_user_id so the row viewer respects RLS.
 *
 * Drives DataBuiltinTransport with an execOverride bound to a real pool worker
 * (explicit tmp dataDir + endpoint), so no project record / getProjectPath needed.
 *
 * Run: pnpm exec tsx --test services/api/src/mcp/builtin/data/__tests__/integration/mcp-data.integration.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

process.env.DOABLE_APP_DB_READY_MS = process.env.DOABLE_APP_DB_READY_MS ?? "60000";

const { runOnProject, shutdownDataPool } = await import("../../../../../data-worker/pool.js");
const { DataBuiltinTransport } = await import("../../transport.js");
import type { WorkerRequest, WorkerResponse } from "../../../../../data-worker/types.js";

let tmp: string;
before(async () => { tmp = await mkdtemp(path.join(tmpdir(), "doable-mcpdata-")); });
after(async () => { await shutdownDataPool(); await rm(tmp, { recursive: true, force: true }).catch(() => {}); });

function rpc(method: string, params?: Record<string, unknown>) {
  return { jsonrpc: "2.0" as const, id: 1, method, params };
}
function content(res: { result?: unknown }): Record<string, unknown> {
  return JSON.parse((res.result as { content: Array<{ text: string }> }).content[0]!.text) as Record<string, unknown>;
}

test("migrate (idempotent) + ::text RLS + data.inspect threads identity", { timeout: 120_000 }, async () => {
  const projectId = randomUUID();
  const dataDir = path.join(tmp, projectId, "app.db");
  const endpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\doable-db-mcp-${projectId}`
    : path.join(tmp, projectId, "db.sock");

  const exec = (pid: string, req: Omit<WorkerRequest, "id">): Promise<WorkerResponse> =>
    runOnProject(pid, req, { dataDir, endpoint });
  const t = new DataBuiltinTransport(projectId, exec);

  // data.migrate — the AI's ::text RLS template (M1 form).
  const migrationSql = `
    CREATE TABLE leads (id serial primary key, created_by text not null, title text);
    ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
    CREATE POLICY leads_owner ON leads
      USING (created_by::text = current_setting('app.user_id', true))
      WITH CHECK (created_by::text = current_setting('app.user_id', true));`;
  const m1 = content(await t.sendRequest(rpc("tools/call", { name: "data.migrate", arguments: { migration_id: "0001_leads", sql: migrationSql } })));
  assert.equal(m1.applied, true);

  // M3: replay is a no-op.
  const m2 = content(await t.sendRequest(rpc("tools/call", { name: "data.migrate", arguments: { migration_id: "0001_leads", sql: migrationSql } })));
  assert.equal(m2.applied, false);
  assert.equal(m2.reason, "already_applied");
  assert.equal(m2.sql_hash_matches, true);

  // data.schema sees the table with RLS enabled + a policy (and hides _doable_migrations).
  const schema = content(await t.sendRequest(rpc("tools/call", { name: "data.schema" })));
  const tables = schema.tables as Array<{ name: string; rls_enabled: boolean; policies: unknown[] }>;
  const leads = tables.find((x) => x.name === "leads")!;
  assert.equal(leads.rls_enabled, true);
  assert.equal(leads.policies.length >= 1, true);
  assert.equal(tables.some((x) => x.name.startsWith("_doable_")), false);

  // Insert two rows as different users via data.query.
  await t.sendRequest(rpc("tools/call", { name: "data.query", arguments: { sql: "INSERT INTO leads(created_by,title) VALUES ($1,$2)", params: ["u1", "one"], app_user_id: "u1" } }));
  await t.sendRequest(rpc("tools/call", { name: "data.query", arguments: { sql: "INSERT INTO leads(created_by,title) VALUES ($1,$2)", params: ["u2", "two"], app_user_id: "u2" } }));

  // M1: a query with NO identity must fail CLOSED (0 rows), not raise a uuid error.
  const anon = content(await t.sendRequest(rpc("tools/call", { name: "data.query", arguments: { sql: "SELECT title FROM leads" } })));
  assert.equal(anon.ok, true, JSON.stringify(anon));
  assert.equal(anon.rowCount, 0);

  // M2: data.inspect threading app_user_id sees only that user's row.
  const inspect = content(await t.sendRequest(rpc("tools/call", { name: "data.inspect", arguments: { table: "leads", app_user_id: "u1" } })));
  assert.equal(inspect.ok, true, JSON.stringify(inspect));
  assert.equal(inspect.rowCount, 1);
  assert.equal((inspect.rows as Array<{ title: string }>)[0]!.title, "one");
});
