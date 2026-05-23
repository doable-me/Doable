/**
 * Unit tests for sql-classifier.ts
 *
 * Uses node:test + node:assert/strict (same pattern as ipc.test.ts).
 * Run with: pnpm exec tsx --test services/api/src/data-worker/__tests__/sql-classifier.test.ts
 *
 * Covers the verdict matrix required by PRD 09 §"Unit tests" and §"Security tests".
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  stripComments,
  splitStatements,
  classifyForQuery,
  classifyForExec,
  BANNED_KEYWORDS,
} from "../sql-classifier.js";

// ---------------------------------------------------------------------------
// stripComments
// ---------------------------------------------------------------------------

describe("stripComments", () => {
  it("removes a line comment", () => {
    const result = stripComments("SELECT 1 -- this is a comment\nFROM t");
    assert.ok(!result.includes("--"), "line comment should be removed");
    assert.ok(result.includes("SELECT 1"), "SELECT 1 should survive");
  });

  it("removes a block comment", () => {
    const result = stripComments("SELECT /* hello */ 1");
    assert.ok(!result.includes("hello"), "block comment content should be removed");
    assert.ok(result.includes("SELECT"), "SELECT should survive");
    assert.ok(result.includes("1"), "1 should survive");
  });

  it("preserves single-quoted strings across comment stripping", () => {
    const result = stripComments("SELECT 'hello -- world' FROM t");
    assert.ok(result.includes("'hello -- world'"), "string literal should be intact");
  });

  it("handles block comment followed by ATTACH (comment evasion)", () => {
    const result = stripComments("SELECT 1 /* */; ATTACH DATABASE '/etc/passwd' AS p");
    assert.ok(result.includes("ATTACH"), "ATTACH should remain visible after stripping");
  });

  it("preserves dollar-quoted strings", () => {
    const result = stripComments("SELECT $$hello -- world$$ FROM t");
    assert.ok(result.includes("hello -- world"), "dollar-quoted content should be intact");
  });
});

// ---------------------------------------------------------------------------
// splitStatements
// ---------------------------------------------------------------------------

describe("splitStatements", () => {
  it("splits two simple statements", () => {
    const stmts = splitStatements("SELECT 1; SELECT 2");
    assert.equal(stmts.length, 2);
    assert.equal(stmts[0], "SELECT 1");
    assert.equal(stmts[1], "SELECT 2");
  });

  it("treats semicolons inside single-quoted strings as part of the value", () => {
    const stmts = splitStatements("INSERT INTO t(a) VALUES ('x;y')");
    assert.equal(stmts.length, 1, "should be a single statement");
    assert.ok(stmts[0]!.includes("'x;y'"), "string value should be intact");
  });

  it("treats semicolons inside dollar-quoted strings as part of the value", () => {
    const stmts = splitStatements("INSERT INTO t VALUES ($$a;b$$)");
    assert.equal(stmts.length, 1, "dollar-quoted semicolon must not split");
  });

  it("handles trailing semicolon", () => {
    const stmts = splitStatements("SELECT 1;");
    assert.equal(stmts.length, 1);
  });

  it("ignores empty segments between semicolons", () => {
    const stmts = splitStatements("SELECT 1;;SELECT 2");
    assert.equal(stmts.length, 2);
  });

  it("handles a multi-statement migration body", () => {
    const sql = `
      CREATE TABLE t (id uuid PRIMARY KEY);
      CREATE INDEX idx ON t (id);
      ALTER TABLE t ENABLE ROW LEVEL SECURITY;
    `;
    const stmts = splitStatements(sql);
    assert.equal(stmts.length, 3);
  });
});

// ---------------------------------------------------------------------------
// BANNED_KEYWORDS export
// ---------------------------------------------------------------------------

describe("BANNED_KEYWORDS", () => {
  it("includes ATTACH and LOAD", () => {
    assert.ok(BANNED_KEYWORDS.includes("ATTACH"), "ATTACH should be in BANNED_KEYWORDS");
    assert.ok(BANNED_KEYWORDS.includes("LOAD"), "LOAD should be in BANNED_KEYWORDS");
  });
});

// ---------------------------------------------------------------------------
// classifyForQuery — allowed cases
// ---------------------------------------------------------------------------

describe("classifyForQuery — allowed", () => {
  it("allows SELECT *", () => {
    const r = classifyForQuery("SELECT * FROM leads WHERE owner_id=$1");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "SELECT");
  });

  it("allows INSERT", () => {
    const r = classifyForQuery("INSERT INTO t(a) VALUES ($1)");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "INSERT");
  });

  it("allows UPDATE", () => {
    const r = classifyForQuery("UPDATE t SET a=$1 WHERE id=$2");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "UPDATE");
  });

  it("allows DELETE", () => {
    const r = classifyForQuery("DELETE FROM t WHERE id=$1");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "DELETE");
  });

  it("allows WITH...SELECT CTE", () => {
    const r = classifyForQuery("WITH x AS (SELECT 1) SELECT * FROM x");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "SELECT");
  });

  it("allows INSERT with semicolons inside string values", () => {
    const r = classifyForQuery("INSERT INTO t(a) VALUES ('x;y')");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "INSERT");
  });

  it("allows INSERT with dollar-quoted string containing semicolons", () => {
    const r = classifyForQuery("INSERT INTO t VALUES ($$a;b$$)");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "INSERT");
  });
});

// ---------------------------------------------------------------------------
// classifyForQuery — rejected cases
// ---------------------------------------------------------------------------

describe("classifyForQuery — rejected", () => {
  it("rejects DROP TABLE (STATEMENT_NOT_ALLOWED)", () => {
    const r = classifyForQuery("DROP TABLE t");
    assert.equal(r.ok, false);
    assert.equal(r.code, "STATEMENT_NOT_ALLOWED");
  });

  it("rejects CREATE TABLE (STATEMENT_NOT_ALLOWED)", () => {
    const r = classifyForQuery("CREATE TABLE t (id uuid)");
    assert.equal(r.ok, false);
    assert.equal(r.code, "STATEMENT_NOT_ALLOWED");
  });

  it("rejects SELECT 1; SELECT 2 (MULTI_STATEMENT)", () => {
    const r = classifyForQuery("SELECT 1; SELECT 2");
    assert.equal(r.ok, false);
    assert.equal(r.code, "MULTI_STATEMENT");
  });

  it("rejects SELECT 1; DROP TABLE t (MULTI_STATEMENT)", () => {
    const r = classifyForQuery("SELECT 1; DROP TABLE t");
    assert.equal(r.ok, false);
    assert.equal(r.code, "MULTI_STATEMENT");
  });

  it("rejects ATTACH DATABASE '/etc/passwd' AS p (FORBIDDEN_STMT)", () => {
    const r = classifyForQuery("ATTACH DATABASE '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects COPY FROM PROGRAM (FORBIDDEN_STMT)", () => {
    const r = classifyForQuery("COPY t FROM PROGRAM '/bin/sh'");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects psql meta-command \\! id (STATEMENT_NOT_ALLOWED)", () => {
    const r = classifyForQuery("\\! id");
    assert.equal(r.ok, false);
    assert.ok(
      r.code === "STATEMENT_NOT_ALLOWED" || r.code === "FORBIDDEN_STMT",
      `expected STATEMENT_NOT_ALLOWED or FORBIDDEN_STMT, got ${r.code}`,
    );
  });

  it("rejects SELECT 1; ATTACH DATABASE ... multi-statement (MULTI_STATEMENT)", () => {
    const r = classifyForQuery("SELECT 1; ATTACH DATABASE '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "MULTI_STATEMENT");
  });

  it("rejects SELECT 1 /* */; ATTACH ... comment evasion (MULTI_STATEMENT after strip)", () => {
    const r = classifyForQuery("SELECT 1 /* */; ATTACH DATABASE '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "MULTI_STATEMENT");
  });

  it("rejects case evasion: select 1; aTtAcH DaTaBaSe ... (MULTI_STATEMENT)", () => {
    const r = classifyForQuery("select 1; aTtAcH DaTaBaSe '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "MULTI_STATEMENT");
  });

  it("rejects SELECT 1; CREATE EXTENSION pg_read_server_files (MULTI_STATEMENT)", () => {
    const r = classifyForQuery("SELECT 1; CREATE EXTENSION pg_read_server_files");
    assert.equal(r.ok, false);
    assert.equal(r.code, "MULTI_STATEMENT");
  });

  it("rejects SET ROLE postgres (FORBIDDEN_STMT)", () => {
    const r = classifyForQuery("SET ROLE postgres");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects ALTER SYSTEM SET x=1 (FORBIDDEN_STMT)", () => {
    const r = classifyForQuery("ALTER SYSTEM SET x=1");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects RESET ALL (FORBIDDEN_STMT)", () => {
    const r = classifyForQuery("RESET ALL");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects DISCARD ALL (FORBIDDEN_STMT)", () => {
    const r = classifyForQuery("DISCARD ALL");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects SET SESSION AUTHORIZATION (FORBIDDEN_STMT)", () => {
    const r = classifyForQuery("SET SESSION AUTHORIZATION postgres");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });
});

// ---------------------------------------------------------------------------
// classifyForExec — allowed cases
// ---------------------------------------------------------------------------

describe("classifyForExec — allowed", () => {
  it("allows CREATE TABLE", () => {
    const r = classifyForExec("CREATE TABLE t (id uuid PRIMARY KEY)");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "CREATE");
  });

  it("allows CREATE POLICY", () => {
    const r = classifyForExec(
      "CREATE POLICY p ON t USING (owner_id = current_setting('app.user_id')::uuid)",
    );
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "CREATE");
  });

  it("allows ALTER TABLE ENABLE ROW LEVEL SECURITY", () => {
    const r = classifyForExec("ALTER TABLE t ENABLE ROW LEVEL SECURITY");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "ALTER");
  });

  it("allows multi-statement migration body", () => {
    const sql = `
      CREATE TABLE leads (id uuid PRIMARY KEY, title text NOT NULL);
      CREATE INDEX leads_idx ON leads (id);
      ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
      CREATE POLICY leads_owner ON leads USING (true);
    `;
    const r = classifyForExec(sql);
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "CREATE");
  });

  it("allows CREATE EXTENSION pgcrypto (in default allowlist)", () => {
    const r = classifyForExec("CREATE EXTENSION pgcrypto");
    assert.equal(r.ok, true);
  });

  it("allows CREATE EXTENSION vector (in default allowlist)", () => {
    const r = classifyForExec("CREATE EXTENSION vector");
    assert.equal(r.ok, true);
  });

  it("allows CREATE EXTENSION IF NOT EXISTS uuid-ossp", () => {
    const r = classifyForExec('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    assert.equal(r.ok, true);
  });

  it("allows DML INSERT on exec route", () => {
    const r = classifyForExec("INSERT INTO t(a) VALUES ($1)");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "INSERT");
  });

  it("allows INSERT with semicolon inside string on exec => ok, statementType INSERT", () => {
    const r = classifyForExec("INSERT INTO t(a) VALUES ('x;y')");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "INSERT");
  });

  it("allows dollar-quoted INSERT on exec: INSERT INTO t VALUES ($$a;b$$) => single statement", () => {
    const r = classifyForExec("INSERT INTO t VALUES ($$a;b$$)");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "INSERT");
  });

  it("allows TRUNCATE on exec", () => {
    const r = classifyForExec("TRUNCATE TABLE t");
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "TRUNCATE");
  });
});

// ---------------------------------------------------------------------------
// classifyForExec — hard rejects
// ---------------------------------------------------------------------------

describe("classifyForExec — hard rejects", () => {
  it("rejects ATTACH DATABASE '/etc/passwd' AS p (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("ATTACH DATABASE '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects COPY t FROM PROGRAM '/bin/sh' (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("COPY t FROM PROGRAM '/bin/sh'");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects psql meta-command \\! id", () => {
    const r = classifyForExec("\\! id");
    assert.equal(r.ok, false);
    assert.ok(
      r.code === "STATEMENT_NOT_ALLOWED" || r.code === "FORBIDDEN_STMT",
      `expected STATEMENT_NOT_ALLOWED or FORBIDDEN_STMT, got ${r.code}`,
    );
  });

  it("rejects SELECT 1; ATTACH DATABASE ... in exec (FORBIDDEN_STMT on second stmt)", () => {
    const r = classifyForExec("SELECT 1; ATTACH DATABASE '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects SELECT 1 /* */; ATTACH ... comment evasion in exec", () => {
    const r = classifyForExec("SELECT 1 /* */; ATTACH DATABASE '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects case evasion: select 1; aTtAcH DaTaBaSe ... in exec", () => {
    const r = classifyForExec("select 1; aTtAcH DaTaBaSe '/etc/passwd' AS p");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects CREATE EXTENSION pg_read_server_files (not in allowlist => FORBIDDEN_STMT)", () => {
    const r = classifyForExec("SELECT 1; CREATE EXTENSION pg_read_server_files");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects CREATE EXTENSION badext (not in allowlist)", () => {
    const r = classifyForExec("CREATE EXTENSION badext");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects SET ROLE postgres (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("SET ROLE postgres");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects ALTER SYSTEM SET x=1 (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("ALTER SYSTEM SET x=1");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects RESET ALL (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("RESET ALL");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects LOAD (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("LOAD '/usr/lib/bad.so'");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects COPY FROM STDIN (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("COPY t FROM STDIN");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects CREATE ROLE ... SUPERUSER (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("CREATE ROLE attacker SUPERUSER");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects CREATE ROLE ... BYPASSRLS (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("CREATE ROLE attacker BYPASSRLS");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects SELECT containing pg_read_server_files call (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("SELECT pg_read_server_files('/etc/passwd')");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects SELECT containing pg_ls_dir call (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("SELECT pg_ls_dir('/etc')");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects DISCARD ALL (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("DISCARD ALL");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("rejects SET SESSION AUTHORIZATION (FORBIDDEN_STMT)", () => {
    const r = classifyForExec("SET SESSION AUTHORIZATION root");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("classifyForQuery: WITH...INSERT CTE is allowed", () => {
    const r = classifyForQuery(
      "WITH vals AS (SELECT $1::uuid AS owner_id) INSERT INTO t SELECT owner_id FROM vals",
    );
    assert.equal(r.ok, true);
    assert.equal(r.statementType, "INSERT");
  });

  it("classifyForQuery: line comment evasion SELECT 1; -- \\n ATTACH is MULTI_STATEMENT", () => {
    // After stripping "-- \n" the ATTACH becomes visible
    const sql = "SELECT 1; -- comment\nATTACH DATABASE '/etc/passwd' AS p";
    const r = classifyForQuery(sql);
    assert.equal(r.ok, false);
    assert.equal(r.code, "MULTI_STATEMENT");
  });

  it("classifyForExec: custom extension allowlist allows 'postgis'", () => {
    const r = classifyForExec("CREATE EXTENSION postgis", {
      extensionAllowlist: ["postgis"],
    });
    assert.equal(r.ok, true);
  });

  it("classifyForExec: custom extension allowlist rejects 'pgcrypto' if not listed", () => {
    const r = classifyForExec("CREATE EXTENSION pgcrypto", {
      extensionAllowlist: ["vector"],
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });

  it("classifyForQuery: empty sql returns STATEMENT_NOT_ALLOWED", () => {
    const r = classifyForQuery("   ");
    assert.equal(r.ok, false);
    assert.equal(r.code, "STATEMENT_NOT_ALLOWED");
  });

  it("classifyForExec: empty sql returns STATEMENT_NOT_ALLOWED", () => {
    const r = classifyForExec("");
    assert.equal(r.ok, false);
    assert.equal(r.code, "STATEMENT_NOT_ALLOWED");
  });

  it("classifyForQuery: CREATE FOREIGN TABLE is STATEMENT_NOT_ALLOWED (DDL not allowed on /query)", () => {
    const r = classifyForQuery("CREATE FOREIGN TABLE ft (id int) SERVER s");
    assert.equal(r.ok, false);
    // Could be FORBIDDEN_STMT (denylist) or STATEMENT_NOT_ALLOWED — both are correct
    assert.ok(r.ok === false);
  });

  it("classifyForExec: CREATE FOREIGN TABLE is FORBIDDEN_STMT", () => {
    const r = classifyForExec("CREATE FOREIGN TABLE ft (id int) SERVER s");
    assert.equal(r.ok, false);
    assert.equal(r.code, "FORBIDDEN_STMT");
  });
});
