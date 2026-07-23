import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import { APP_DB_PROMPT_BLOCK, APP_DB_PROMPT_BLOCK_RUNTIME, buildAppDbContext } from "../app-db-prompt.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("APP_DB_PROMPT_BLOCK content", () => {
  it('contains "data.migrate"', () => {
    assert.ok(APP_DB_PROMPT_BLOCK.includes("data.migrate"), 'Missing "data.migrate"');
  });

  it('contains "CREATE POLICY"', () => {
    assert.ok(APP_DB_PROMPT_BLOCK.includes("CREATE POLICY"), 'Missing "CREATE POLICY"');
  });

  it("contains current_setting('app.user_id'", () => {
    assert.ok(
      APP_DB_PROMPT_BLOCK.includes("current_setting('app.user_id'"),
      "Missing current_setting('app.user_id'",
    );
  });

  it('contains "ENABLE ROW LEVEL SECURITY"', () => {
    assert.ok(
      APP_DB_PROMPT_BLOCK.includes("ENABLE ROW LEVEL SECURITY"),
      'Missing "ENABLE ROW LEVEL SECURITY"',
    );
  });

  it('does NOT contain "FORCE ROW LEVEL SECURITY"', () => {
    assert.ok(
      !APP_DB_PROMPT_BLOCK.includes("FORCE ROW LEVEL SECURITY"),
      'Must not contain "FORCE ROW LEVEL SECURITY" — plain ENABLE is correct for non-superuser role',
    );
  });
});

describe("buildAppDbContext env gating", () => {
  it("returns the runtime prompt when DB enabled and runtime unset (defaults ON)", () => {
    const result = buildAppDbContext({ env: {} });
    assert.strictEqual(result, APP_DB_PROMPT_BLOCK_RUNTIME);
  });

  it("returns empty string when DOABLE_APP_DB_ENABLED is '0'", () => {
    const result = buildAppDbContext({ env: { DOABLE_APP_DB_ENABLED: "0" } });
    assert.strictEqual(result, "");
  });

  it("returns the runtime prompt when DB=1 and runtime unset", () => {
    const result = buildAppDbContext({ env: { DOABLE_APP_DB_ENABLED: "1" } });
    assert.strictEqual(result, APP_DB_PROMPT_BLOCK_RUNTIME);
  });

  it("returns legacy db.query prompt when runtime is explicitly '0'", () => {
    const result = buildAppDbContext({
      env: { DOABLE_APP_DB_ENABLED: "1", DOABLE_APP_RUNTIME_ENABLED: "0" },
    });
    assert.strictEqual(result, APP_DB_PROMPT_BLOCK);
  });

  it("runtime prompt forbids raw db.query and teaches runtime.queries.run", () => {
    assert.ok(APP_DB_PROMPT_BLOCK_RUNTIME.includes("runtime.queries.run"));
    assert.ok(APP_DB_PROMPT_BLOCK_RUNTIME.includes("named queries"));
    assert.ok(APP_DB_PROMPT_BLOCK_RUNTIME.includes("Never call `db.query`"));
  });

  it("runtime prompt forbids UI seed mocks and requires signup + wire-every-query", () => {
    assert.ok(APP_DB_PROMPT_BLOCK_RUNTIME.includes("SEED_*"));
    assert.ok(APP_DB_PROMPT_BLOCK_RUNTIME.includes("signup AND login"));
    assert.ok(APP_DB_PROMPT_BLOCK_RUNTIME.includes("WIRE EVERY QUERY"));
  });
});

describe("CI fixture db-aware-app.json", () => {
  const fixturePath = join(__dirname, "../__fixtures__/per-app-db/db-aware-app.json");

  it("parses as valid JSON", () => {
    const raw = readFileSync(fixturePath, "utf8");
    assert.doesNotThrow(() => JSON.parse(raw), "Fixture is not valid JSON");
  });

  it("has a non-empty prompt string", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    assert.ok(typeof fixture.prompt === "string" && fixture.prompt.length > 0, "prompt missing");
  });

  it("has expect_tool_calls array with at least one entry", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    assert.ok(Array.isArray(fixture.expect_tool_calls) && fixture.expect_tool_calls.length > 0);
  });

  it("first expect_tool_calls entry has tool=data.migrate", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    assert.strictEqual(fixture.expect_tool_calls[0].tool, "data.migrate");
  });

  it("first entry args_includes contains CREATE TABLE, CREATE POLICY, owner_id", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    const args: string[] = fixture.expect_tool_calls[0].args_includes;
    assert.ok(Array.isArray(args));
    assert.ok(args.includes("CREATE TABLE"), 'Missing "CREATE TABLE" in args_includes');
    assert.ok(args.includes("CREATE POLICY"), 'Missing "CREATE POLICY" in args_includes');
    assert.ok(args.includes("owner_id"), 'Missing "owner_id" in args_includes');
  });
});
