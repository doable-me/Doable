/**
 * Unit tests: Mustache SQL compiler + bus + pin.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileMustacheSql, validateMustacheSyntax } from "../queries/compile.js";
import { appBus } from "../bus.js";
import { pinProject, unpinProject, isProjectPinned, __resetPins } from "../pin.js";
import { classifyDmlOp, extractTableName } from "../cdc/emit.js";
import { cronMatches, nextCronOccurrence, isValidCron } from "../schedules/cron.js";

describe("compileMustacheSql", () => {
  it("binds {{name}} to $N", () => {
    const r = compileMustacheSql(
      "SELECT * FROM leads WHERE status = {{status}} AND limit_n = {{limit}}",
      { status: "new", limit: 10 },
    );
    assert.equal(r.sqlText, "SELECT * FROM leads WHERE status = $1 AND limit_n = $2");
    assert.deepEqual(r.values, ["new", 10]);
  });

  it("includes {{#name}} sections when truthy", () => {
    const r = compileMustacheSql(
      "SELECT 1 WHERE 1=1{{#status}} AND status = {{status}}{{/status}}",
      { status: "new" },
    );
    assert.match(r.sqlText, /AND status = \$1/);
    assert.deepEqual(r.values, ["new"]);
  });

  it("omits {{#name}} when absent", () => {
    const r = compileMustacheSql(
      "SELECT 1 WHERE 1=1{{#status}} AND status = {{status}}{{/status}}",
      {},
    );
    assert.equal(r.sqlText, "SELECT 1 WHERE 1=1");
    assert.deepEqual(r.values, []);
  });

  it("rejects {{{raw}}} identifier interpolation", () => {
    assert.throws(() => compileMustacheSql("SELECT * FROM {{{table}}}", { table: "x" }));
  });

  it("rejects {{@ident}}", () => {
    assert.throws(() => compileMustacheSql("SELECT {{@col}} FROM t", { col: "x" }));
  });

  it("does not string-splice values into SQL", () => {
    const evil = "'; DROP TABLE users; --";
    const r = compileMustacheSql("SELECT * FROM t WHERE a = {{q}}", { q: evil });
    assert.ok(!r.sqlText.includes("DROP"));
    assert.equal(r.values[0], evil);
  });

  it("validateMustacheSyntax accepts good SQL", () => {
    assert.equal(validateMustacheSyntax("SELECT {{id}}").ok, true);
  });
});

describe("appBus", () => {
  it("publishes CDC events to subscribers", () => {
    appBus.__reset();
    const seen: unknown[] = [];
    const unsub = appBus.subscribe(appBus.cdcChannel("proj1"), (p) => seen.push(p));
    appBus.publishCdc({
      projectId: "proj1",
      table: "leads",
      op: "insert",
      ts: new Date().toISOString(),
    });
    assert.equal(seen.length, 1);
    unsub();
  });

  it("publishes topics", () => {
    appBus.__reset();
    const seen: unknown[] = [];
    const unsub = appBus.subscribe(appBus.topicChannel("p", "leads.created"), (p) =>
      seen.push(p),
    );
    appBus.publishTopic("p", "leads.created", { id: 1 });
    assert.equal(seen.length, 1);
    unsub();
  });
});

describe("warm pin", () => {
  it("tracks pin reasons", () => {
    __resetPins();
    assert.equal(isProjectPinned("a"), false);
    pinProject("a", "sse:1");
    assert.equal(isProjectPinned("a"), true);
    unpinProject("a", "sse:1");
    assert.equal(isProjectPinned("a"), false);
  });
});

describe("CDC classify", () => {
  it("detects insert/update/delete", () => {
    assert.equal(classifyDmlOp("INSERT INTO leads (email) VALUES ($1)"), "insert");
    assert.equal(classifyDmlOp("UPDATE leads SET x=1"), "update");
    assert.equal(classifyDmlOp("DELETE FROM leads WHERE id=$1"), "delete");
    assert.equal(classifyDmlOp("SELECT 1"), null);
  });

  it("extracts table names", () => {
    assert.equal(extractTableName("INSERT INTO leads VALUES (1)"), "leads");
    assert.equal(extractTableName('UPDATE "tasks" SET done=true'), "tasks");
  });
});

describe("cron", () => {
  it("validates 5-field cron", () => {
    assert.equal(isValidCron("0 9 * * *"), true);
    assert.equal(isValidCron("bad"), false);
  });

  it("matches and finds next occurrence", () => {
    const d = new Date(Date.UTC(2026, 0, 1, 9, 0, 0));
    assert.equal(cronMatches("0 9 * * *", d), true);
    const next = nextCronOccurrence("0 9 * * *", "UTC", d);
    assert.ok(next.getTime() > d.getTime());
  });
});
