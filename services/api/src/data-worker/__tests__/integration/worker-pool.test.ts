/**
 * Integration test: real PGlite worker spawned through the pool over a real IPC
 * endpoint (Named Pipe on win32, Unix socket elsewhere). Exercises the load-
 * bearing surfaces: spawn->ready, exec DDL, RLS two-user isolation, fail-closed
 * identity, forbidden-statement rejection, and crash + respawn. (US-004 + US-005)
 *
 * NOTE: a fresh on-disk PGlite dir runs a full initdb — sub-second on Linux but
 * several seconds on a Windows dev volume. We therefore (a) raise the ready
 * budget via env BEFORE importing the pool, and (b) share ONE initialized worker
 * across the read/write/RLS sub-tests so initdb is paid once, not per assertion.
 *
 * Run: pnpm exec tsx --test services/api/src/data-worker/__tests__/integration/worker-pool.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Cold initdb on a Windows dev volume can take ~20s — give the handshake room.
// On Linux/prod this is sub-second and the PRD's 5s default applies.
process.env.DOABLE_APP_DB_READY_MS = process.env.DOABLE_APP_DB_READY_MS ?? "60000";

const pool = await import("../../pool.js");
const { acquireWorker, sendToWorker, shutdownDataPool, sweepIdleWorkers, getDataPoolSnapshot } = pool;
type WorkerOkResponse = import("../../types.js").WorkerOkResponse;
type WorkerErrResponse = import("../../types.js").WorkerErrResponse;

let tmp: string;

before(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "doable-appdb-"));
});
after(async () => {
  await shutdownDataPool();
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
});

function endpointFor(projectId: string, dir: string): string {
  return process.platform === "win32"
    ? `\\\\.\\pipe\\doable-db-test-${projectId}`
    : path.join(dir, "db.sock");
}

async function freshWorker() {
  const projectId = randomUUID();
  const dataDir = path.join(tmp, projectId, "app.db");
  const endpoint = endpointFor(projectId, path.join(tmp, projectId));
  const handle = await acquireWorker(projectId, { dataDir, endpoint });
  return { handle, projectId, dataDir, endpoint };
}

test("spawn/ready, exec DDL, query DML, RLS isolation, forbidden stmt (shared worker)", { timeout: 120_000 }, async () => {
  const { handle } = await freshWorker();

  // ── spawn -> ready ──
  assert.equal(handle.ready, true);
  assert.equal(handle.process.exitCode, null);

  // ── exec DDL + query DML roundtrip ──
  const ddl1 = await sendToWorker(handle, {
    op: "exec",
    sql: `CREATE TABLE notes (id serial primary key, owner_id text not null, body text);`,
  });
  assert.equal(ddl1.ok, true, JSON.stringify(ddl1));

  const ins = await sendToWorker(handle, {
    op: "query",
    sql: "INSERT INTO notes(owner_id, body) VALUES ($1, $2)",
    params: ["u1", "hello"],
    app_user_id: "u1",
  });
  assert.equal(ins.ok, true);

  const sel = (await sendToWorker(handle, {
    op: "query",
    sql: "SELECT body FROM notes WHERE owner_id = $1",
    params: ["u1"],
    app_user_id: "u1",
  })) as WorkerOkResponse;
  assert.equal(sel.ok, true);
  assert.equal(sel.rowCount, 1);
  assert.equal((sel.rows![0] as { body: string }).body, "hello");

  // ── RLS isolation: ENABLE RLS + owner policy, two users + fail-closed ──
  const ddl2 = await sendToWorker(handle, {
    op: "exec",
    sql: `
      CREATE TABLE leads (id serial primary key, owner_id text not null, title text);
      ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
      CREATE POLICY leads_owner ON leads
        USING (owner_id = current_setting('app.user_id', true))
        WITH CHECK (owner_id = current_setting('app.user_id', true));
    `,
  });
  assert.equal(ddl2.ok, true, JSON.stringify(ddl2));

  await sendToWorker(handle, { op: "query", sql: "INSERT INTO leads(owner_id,title) VALUES ($1,$2)", params: ["alice", "A"], app_user_id: "alice" });
  await sendToWorker(handle, { op: "query", sql: "INSERT INTO leads(owner_id,title) VALUES ($1,$2)", params: ["bob", "B"], app_user_id: "bob" });

  const alice = (await sendToWorker(handle, { op: "query", sql: "SELECT title FROM leads", app_user_id: "alice" })) as WorkerOkResponse;
  const bob = (await sendToWorker(handle, { op: "query", sql: "SELECT title FROM leads", app_user_id: "bob" })) as WorkerOkResponse;
  const anon = (await sendToWorker(handle, { op: "query", sql: "SELECT title FROM leads", app_user_id: "" })) as WorkerOkResponse;

  assert.deepEqual(alice.rows!.map((r) => (r as { title: string }).title), ["A"]);
  assert.deepEqual(bob.rows!.map((r) => (r as { title: string }).title), ["B"]);
  assert.equal(anon.rowCount, 0);

  // ── forbidden statement on /query is rejected by the worker classifier ──
  const bad = (await sendToWorker(handle, { op: "query", sql: "DROP TABLE leads", app_user_id: "u1" })) as WorkerErrResponse;
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, "FORBIDDEN_STMT");
});

test("crash drains inflight and next acquire respawns", { timeout: 120_000 }, async () => {
  const { handle, projectId, dataDir, endpoint } = await freshWorker();
  handle.process.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 800));
  await assert.rejects(() => sendToWorker(handle, { op: "query", sql: "SELECT 1", app_user_id: "u1" }));
  // re-acquire spawns a fresh worker; the data dir is already initialised so
  // this open is fast.
  const handle2 = await acquireWorker(projectId, { dataDir, endpoint });
  assert.notEqual(handle2.process.pid, handle.process.pid);
  const ok = (await sendToWorker(handle2, { op: "query", sql: "SELECT 1 AS one", app_user_id: "u1" })) as WorkerOkResponse;
  assert.equal(ok.ok, true);
});

test("idle sweeper reaps a worker past its idle window", { timeout: 120_000 }, async () => {
  const { handle, projectId } = await freshWorker();
  assert.equal(getDataPoolSnapshot().some((w) => w.projectId === projectId), true);
  // Force the worker past the idle window without waiting in real time.
  handle.lastActivityAt = new Date(0);
  const swept = sweepIdleWorkers();
  assert.equal(swept.includes(projectId), true);
  // killWorker is graceful (shutdown -> SIGTERM -> SIGKILL); give it a moment.
  await new Promise((r) => setTimeout(r, 3000));
  assert.equal(handle.process.exitCode !== null || handle.process.killed, true);
});
