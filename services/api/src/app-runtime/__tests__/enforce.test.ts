import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { findRuntimeWriteViolation } from "../enforce.js";

describe("findRuntimeWriteViolation", () => {
  it("blocks db.query in app source when runtime enabled (default)", () => {
    const v = findRuntimeWriteViolation(
      "src/App.tsx",
      `import { db } from "@doable/data";\nawait db.query("SELECT 1");\n`,
    );
    assert.ok(v);
    assert.equal(v!.rule, "raw_db_query");
  });

  it("blocks db.admin.query", () => {
    const v = findRuntimeWriteViolation(
      "src/Admin.tsx",
      `await db.admin.query("SELECT * FROM orders");`,
    );
    assert.ok(v);
    assert.equal(v!.rule, "raw_db_query");
  });

  it("allows db.auth and runtime.queries.run", () => {
    const content = `
      import { db } from "@doable/data";
      import { runtime } from "@doable/runtime";
      await db.auth.login({ email, password });
      await runtime.queries.run("list_tasks", { limit: 10 });
    `;
    assert.equal(findRuntimeWriteViolation("src/App.tsx", content), null);
  });

  it("allows SQL under .doable/backend", () => {
    assert.equal(
      findRuntimeWriteViolation(
        ".doable/backend/workflows/x.workflow.js",
        `await ctx.db.query("SELECT 1")`,
      ),
      null,
    );
  });

  it("blocks Express imports", () => {
    const v = findRuntimeWriteViolation(
      "src/server.ts",
      `import express from "express";\nconst app = express();\n`,
    );
    assert.ok(v);
    assert.equal(v!.rule, "custom_server");
  });

  it("does nothing when explicitly disabled", () => {
    assert.equal(
      findRuntimeWriteViolation(
        "src/App.tsx",
        `await db.query("SELECT 1");`,
        { enabled: false },
      ),
      null,
    );
  });
});
