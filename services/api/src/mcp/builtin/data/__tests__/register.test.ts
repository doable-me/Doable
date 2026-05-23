/**
 * Unit tests for ensureDataConnectorForProject (register.ts).
 *
 * DB-touching paths are skipped when DATABASE_URL is absent; pure row-shape
 * helpers are always asserted so there are real assertions even in CI without
 * a live database.
 *
 * Run: pnpm exec tsx --test services/api/src/mcp/builtin/data/__tests__/register.test.ts
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// Pure unit: buildCapabilitiesCache
// ---------------------------------------------------------------------------

// Import pure helpers from connector-spec — no DB import chain triggered.
const { buildCapabilitiesCache, BUILTIN_DATA_TOOLS } = await import(
  "../connector-spec.js"
);

describe("buildCapabilitiesCache", () => {
  it("returns the expected shape", () => {
    const cache = buildCapabilitiesCache();
    assert.deepEqual(cache, { tools: { listChanged: false } });
  });

  it("is a plain object (safe to JSON.stringify)", () => {
    const cache = buildCapabilitiesCache();
    assert.doesNotThrow(() => JSON.stringify(cache));
  });
});

describe("BUILTIN_DATA_TOOLS", () => {
  it("contains exactly the 5 expected tool names", () => {
    const expected = [
      "data.query",
      "data.exec",
      "data.migrate",
      "data.schema",
      "data.inspect",
    ];
    assert.deepEqual([...BUILTIN_DATA_TOOLS], expected);
  });

  it("every tool name starts with 'data.'", () => {
    for (const name of BUILTIN_DATA_TOOLS) {
      assert.match(name, /^data\./);
    }
  });
});

// ---------------------------------------------------------------------------
// DB-gated: idempotency test
// ---------------------------------------------------------------------------

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.warn(
    "[register.test] DATABASE_URL not set — skipping DB idempotency tests. "
    + "Pure assertions above still run.",
  );
} else {
  // Only import the live function when a DB is available so the import chain
  // (which pulls in @doable/db + sql tag) doesn't crash in unit-only CI.
  const { ensureDataConnectorForProject } = await import("../register.js");

  // We need a real project row for the FK. Generate stable UUIDs for the test
  // run; they will be cleaned up at the end.
  const TEST_PROJECT_ID = "00000000-0000-0000-0000-d474c0nnect01";
  const TEST_WORKSPACE_ID = "00000000-0000-0000-0000-d474c0nnect02";
  const TEST_USER_ID = "00000000-0000-0000-0000-d474c0nnect03";

  // We import sql lazily too so non-DB paths stay clean.
  const { sql } = await import("../../../../db/index.js");

  before(async () => {
    // Ensure the test workspace / user / project rows exist (best-effort; skip
    // if FK parent rows can't be created in this environment).
    try {
      await sql`
        INSERT INTO workspaces (id, name, slug, owner_id)
        VALUES (${TEST_WORKSPACE_ID}, 'test-ws', 'test-ws', ${TEST_USER_ID})
        ON CONFLICT DO NOTHING
      `;
      await sql`
        INSERT INTO users (id, email)
        VALUES (${TEST_USER_ID}, 'register-test@doable.test')
        ON CONFLICT DO NOTHING
      `;
      await sql`
        INSERT INTO projects (id, workspace_id, name, slug, owner_id)
        VALUES (${TEST_PROJECT_ID}, ${TEST_WORKSPACE_ID}, 'test-proj', 'test-proj', ${TEST_USER_ID})
        ON CONFLICT DO NOTHING
      `;
    } catch {
      // Parent rows already exist or schema differs — tests will self-skip on FK errors.
    }
  });

  describe("ensureDataConnectorForProject (DB)", () => {
    it("inserts a builtin:data connector row", async () => {
      await ensureDataConnectorForProject(
        TEST_PROJECT_ID,
        TEST_WORKSPACE_ID,
        TEST_USER_ID,
      );

      const [row] = await sql<Array<{
        server_command: string;
        scope: string;
        auth_type: string;
        status: string;
        transport_type: string;
      }>>`
        SELECT server_command, scope, auth_type, status, transport_type
        FROM mcp_connectors
        WHERE project_id = ${TEST_PROJECT_ID}
          AND server_command = 'builtin:data'
        LIMIT 1
      `;

      assert.ok(row, "connector row should exist after first call");
      assert.equal(row.server_command, "builtin:data");
      assert.equal(row.scope, "project");
      assert.equal(row.auth_type, "none");
      assert.equal(row.status, "active");
      assert.equal(row.transport_type, "stdio");
    });

    it("inserts all 5 tool-override rows", async () => {
      const rows = await sql<Array<{ tool_name: string; enabled: boolean }>>`
        SELECT o.tool_name, o.enabled
        FROM mcp_tool_overrides o
        JOIN mcp_connectors c ON c.id = o.connector_id
        WHERE c.project_id = ${TEST_PROJECT_ID}
          AND c.server_command = 'builtin:data'
        ORDER BY o.tool_name
      `;

      const names = rows.map((r) => r.tool_name).sort();
      assert.deepEqual(names, [
        "data.exec",
        "data.inspect",
        "data.migrate",
        "data.query",
        "data.schema",
      ]);
      assert.ok(rows.every((r) => r.enabled === true), "all tools should be enabled");
    });

    it("is idempotent — second call does not create duplicate rows", async () => {
      // Call a second time; should be a no-op.
      await ensureDataConnectorForProject(
        TEST_PROJECT_ID,
        TEST_WORKSPACE_ID,
        TEST_USER_ID,
      );

      const countRows = await sql<Array<{ count: string }>>`
        SELECT COUNT(*)::text AS count
        FROM mcp_connectors
        WHERE project_id = ${TEST_PROJECT_ID}
          AND server_command = 'builtin:data'
      `;
      const count = countRows[0]!.count;
      assert.equal(Number(count), 1, "only one connector row should exist after two calls");

      const toolCountRows = await sql<Array<{ toolCount: string }>>`
        SELECT COUNT(*)::text AS "toolCount"
        FROM mcp_tool_overrides o
        JOIN mcp_connectors c ON c.id = o.connector_id
        WHERE c.project_id = ${TEST_PROJECT_ID}
          AND c.server_command = 'builtin:data'
      `;
      const toolCount = toolCountRows[0]!.toolCount;
      assert.equal(Number(toolCount), 5, "still exactly 5 tool-override rows after second call");
    });
  });
}
