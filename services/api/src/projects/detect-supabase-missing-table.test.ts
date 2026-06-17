/**
 * Regression tests for the SCHEMA-FIRST guard (supabaseMissingTableViolation).
 *
 * Root-cause class: a Supabase-backed app shipped client code querying
 * `supabase.from('<table>')` for a table that run_supabase_migration never
 * created, so every Supabase REST call 404'd and no data could be stored. The
 * guard blocks writing such query code until the table actually exists in the
 * connected Supabase project (verified live via the Management API).
 *
 * These tests stub the DB (`sql`), the credential vault (mgmt token), and the
 * Management API (`fetch` table listing), then drive the guard directly.
 *
 * Uses node:test (vitest isn't installed in this workspace).
 * Run: pnpm tsx --test services/api/src/projects/detect-supabase-missing-table.test.ts
 */

import test, { mock } from "node:test";
import assert from "node:assert/strict";

// ── Tunable stub state (reset per test) ─────────────────────────────────────
let supabaseBacked = true;
let mgmtRow: { project_ref: string; workspace_id: string; owner_id: string } | null = {
  project_ref: "ref123",
  workspace_id: "ws1",
  owner_id: "owner1",
};
let mgmtToken: string | undefined = "tok";
let liveTables: string[] = ["existing_table"];
let fetchOk = true;

// Route the tagged-template `sql` by query text.
function fakeSql(strings: TemplateStringsArray): Promise<unknown[]> {
  const q = strings.join(" ");
  if (q.includes("SELECT 1 AS one")) return Promise.resolve(supabaseBacked ? [{ one: 1 }] : []);
  if (q.includes("projectRef")) return Promise.resolve(mgmtRow ? [mgmtRow] : []);
  return Promise.resolve([]);
}

mock.module("../db/index.js", { namedExports: { sql: fakeSql } });
mock.module("../integrations/credential-vault.js", {
  namedExports: {
    credentialVault: {
      get: async () => (mgmtToken ? { credentials: { access_token: mgmtToken } } : null),
    },
  },
});

// Stub the Management-API table listing.
(globalThis as unknown as { fetch: unknown }).fetch = async () => ({
  ok: fetchOk,
  json: async () => liveTables.map((t) => ({ tablename: t })),
});

const { supabaseMissingTableViolation } = await import("./detect-supabase-data-misuse.js");

function reset() {
  supabaseBacked = true;
  mgmtRow = { project_ref: "ref123", workspace_id: "ws1", owner_id: "owner1" };
  mgmtToken = "tok";
  liveTables = ["existing_table"];
  fetchOk = true;
}

const SUPA_CONTENT = (table: string) =>
  `import { supabase } from "./lib/supabase";\nawait supabase.from('${table}').select('*');`;

test("BLOCKS writing query code for a table that doesn't exist in Supabase", async () => {
  reset();
  liveTables = ["categories"]; // 'posts' is missing
  const v = await supabaseMissingTableViolation("p-missing", "src/Posts.tsx", SUPA_CONTENT("posts"));
  assert.ok(v, "expected a violation");
  assert.match(v!, /'posts'/);
  assert.match(v!, /run_supabase_migration/);
  assert.match(v!, /categories/); // lists tables that DO exist
});

test("ALLOWS writing query code for a table that already exists", async () => {
  reset();
  liveTables = ["posts", "categories"];
  const v = await supabaseMissingTableViolation("p-exists", "src/Posts.tsx", SUPA_CONTENT("posts"));
  assert.equal(v, null);
});

test("fast path: file with no .from(...) is never inspected", async () => {
  reset();
  liveTables = []; // even with zero tables...
  const v = await supabaseMissingTableViolation(
    "p-nofrom",
    "src/util.ts",
    `import { supabase } from "./lib/supabase";\nexport const x = 1;`,
  );
  assert.equal(v, null);
});

test("not Supabase-backed → guard is inert", async () => {
  reset();
  supabaseBacked = false;
  liveTables = [];
  const v = await supabaseMissingTableViolation("p-nosupa", "src/Posts.tsx", SUPA_CONTENT("posts"));
  assert.equal(v, null);
});

test("fail-open: Management API error never blocks the write", async () => {
  reset();
  fetchOk = false; // mgmt API returns non-ok
  const v = await supabaseMissingTableViolation("p-apierr", "src/Posts.tsx", SUPA_CONTENT("posts"));
  assert.equal(v, null);
});

test("fail-open: no mgmt token resolvable → guard is inert", async () => {
  reset();
  mgmtToken = undefined;
  const v = await supabaseMissingTableViolation("p-notoken", "src/Posts.tsx", SUPA_CONTENT("posts"));
  assert.equal(v, null);
});

test("non-source file (e.g. .json) is ignored", async () => {
  reset();
  liveTables = [];
  const v = await supabaseMissingTableViolation("p-json", "data.json", SUPA_CONTENT("posts"));
  assert.equal(v, null);
});
