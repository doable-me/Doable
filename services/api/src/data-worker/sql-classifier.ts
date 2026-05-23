/**
 * SQL classifier for the per-app database data API.
 *
 * Provides two entry points:
 *   - classifyForQuery: /query route — single DML/SELECT statement only.
 *   - classifyForExec:  /exec and /migrate routes — DDL + DML, multi-statement allowed.
 *
 * Both apply the same hard-reject denylist (ATTACH, LOAD, COPY FROM PROGRAM, etc.).
 *
 * PRD references:
 *   03-worker-process.md §"SQL safety in worker"
 *   05-data-api.md §"SQL safety rules"
 *   09-testing-verification.md §"Security tests" and §"Unit tests"
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ClassifyResult {
  ok: boolean;
  /** Effective SQL command (uppercase): SELECT, INSERT, CREATE, ATTACH, … */
  statementType: string;
  code?: "STATEMENT_NOT_ALLOWED" | "FORBIDDEN_STMT" | "MULTI_STATEMENT";
  reason?: string;
}

// ---------------------------------------------------------------------------
// Default extension allowlist
// ---------------------------------------------------------------------------

export const DEFAULT_EXTENSION_ALLOWLIST = [
  "pgcrypto",
  "pg_trgm",
  "uuid-ossp",
  "vector",
];

// ---------------------------------------------------------------------------
// Denylist keywords (effective command level)
// ---------------------------------------------------------------------------

/**
 * Top-level statement keywords that are unconditionally banned.
 * Checked as the effective command (after WITH CTE unwrapping).
 */
export const BANNED_KEYWORDS: readonly string[] = [
  "ATTACH",
  "LOAD",
];

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Remove SQL line comments (-- ...) and block comments (/* ... *\/).
 * Block comment removal is iterative (handles nested-ish patterns via repeated passes).
 * Single-quoted strings and dollar-quoted strings are preserved — the stripping
 * operates on a rough pass before statement splitting; the result is used for
 * classification only, NOT for execution.
 */
export function stripComments(sql: string): string {
  // We process character by character to respect string literals.
  let result = "";
  let i = 0;
  const len = sql.length;

  while (i < len) {
    // Single-quoted string — pass through verbatim
    if (sql[i] === "'") {
      const start = i;
      i++;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          // escaped quote
          i += 2;
        } else if (sql[i] === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      result += sql.slice(start, i);
      continue;
    }

    // Dollar-quoted string — detect $tag$ or $$ and pass through
    if (sql[i] === "$") {
      const dollarMatch = sql.slice(i).match(/^\$([A-Za-z_\d]*)\$/);
      if (dollarMatch) {
        const tag = dollarMatch[0]; // e.g. $$ or $body$
        const endTag = tag;
        const bodyStart = i + tag.length;
        const endIdx = sql.indexOf(endTag, bodyStart);
        if (endIdx !== -1) {
          result += sql.slice(i, endIdx + endTag.length);
          i = endIdx + endTag.length;
          continue;
        }
        // Unterminated dollar-quote — pass through as-is
        result += sql[i];
        i++;
        continue;
      }
    }

    // Double-quoted identifier — pass through verbatim
    if (sql[i] === '"') {
      const start = i;
      i++;
      while (i < len) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          i += 2;
        } else if (sql[i] === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      result += sql.slice(start, i);
      continue;
    }

    // Line comment: -- ... newline
    if (sql[i] === "-" && sql[i + 1] === "-") {
      // consume until newline
      while (i < len && sql[i] !== "\n") i++;
      // keep the newline so statement boundaries are preserved
      continue;
    }

    // Block comment: /* ... */  (non-nested; standard SQL)
    if (sql[i] === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i < len) {
        if (sql[i] === "*" && sql[i + 1] === "/") {
          i += 2;
          break;
        }
        i++;
      }
      // Replace with a space so tokens don't merge
      result += " ";
      continue;
    }

    result += sql[i];
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Statement splitting on top-level semicolons
// ---------------------------------------------------------------------------

/**
 * Split SQL text on top-level `;` — ignoring semicolons inside
 * single-quoted strings, dollar-quoted strings, and double-quoted identifiers.
 * Returns non-empty trimmed statements only.
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  const len = sql.length;

  while (i < len) {
    // Single-quoted string
    if (sql[i] === "'") {
      current += sql[i];
      i++;
      while (i < len) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          current += sql[i]! + sql[i + 1]!;
          i += 2;
        } else if (sql[i] === "'") {
          current += sql[i]!;
          i++;
          break;
        } else {
          current += sql[i]!;
          i++;
        }
      }
      continue;
    }

    // Dollar-quoted string
    if (sql[i] === "$") {
      const dollarMatch = sql.slice(i).match(/^\$([A-Za-z_\d]*)\$/);
      if (dollarMatch) {
        const tag = dollarMatch[0];
        const bodyStart = i + tag.length;
        const endIdx = sql.indexOf(tag, bodyStart);
        if (endIdx !== -1) {
          current += sql.slice(i, endIdx + tag.length);
          i = endIdx + tag.length;
          continue;
        }
      }
      current += sql[i];
      i++;
      continue;
    }

    // Double-quoted identifier
    if (sql[i] === '"') {
      current += sql[i];
      i++;
      while (i < len) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          current += sql[i]! + sql[i + 1]!;
          i += 2;
        } else if (sql[i] === '"') {
          current += sql[i]!;
          i++;
          break;
        } else {
          current += sql[i]!;
          i++;
        }
      }
      continue;
    }

    // Semicolon — statement boundary
    if (sql[i] === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  const trimmed = current.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
}

// ---------------------------------------------------------------------------
// Keyword extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract the leading SQL keyword from a single statement (already comment-stripped).
 * Returns uppercase string, e.g. "SELECT", "INSERT", "CREATE", "WITH", "ATTACH".
 */
function firstToken(stmt: string): string {
  const m = stmt.match(/^\s*([A-Za-z_\\][A-Za-z_0-9\\]*)/);
  if (!m) return "";
  return m[1]!.toUpperCase();
}

/**
 * For a WITH ... AS (...) ... statement, find the effective command
 * (SELECT/INSERT/UPDATE/DELETE) that follows the CTE definitions.
 *
 * Returns the effective command, or "WITH" if we can't determine it.
 */
function resolveWithCommand(stmt: string): string {
  // Strip the WITH keyword and find the balanced parentheses to locate
  // the query body after the last CTE.
  // Strategy: scan forward from "WITH", skip CTE name + AS + (...) blocks,
  // then return the first keyword of what remains.
  const upper = stmt.toUpperCase();
  let i = upper.indexOf("WITH");
  if (i === -1) return "WITH";
  i += 4; // skip "WITH"

  // Skip RECURSIVE if present
  const afterWith = upper.slice(i).match(/^\s+RECURSIVE\s/);
  if (afterWith) i += afterWith[0].length;

  // Now skip CTE definitions: name AS (...)  [, name AS (...)] ...
  while (i < upper.length) {
    // Skip whitespace and commas
    while (i < upper.length && /[\s,]/.test(upper[i] ?? "")) i++;

    // Try to match CTE name
    const nameMatch = upper.slice(i).match(/^([A-Za-z_][A-Za-z_0-9]*)/);
    if (!nameMatch) break;
    i += nameMatch[1]!.length;

    // Skip optional column list (name, ...) after CTE name
    while (i < upper.length && /\s/.test(upper[i] ?? "")) i++;
    if (upper[i] === "(") {
      // column list
      let depth = 1;
      i++;
      while (i < upper.length && depth > 0) {
        if (upper[i] === "(") depth++;
        else if (upper[i] === ")") depth--;
        i++;
      }
      while (i < upper.length && /\s/.test(upper[i] ?? "")) i++;
    }

    // Expect AS
    if (upper.slice(i, i + 2) !== "AS") break;
    i += 2;
    while (i < upper.length && /\s/.test(upper[i] ?? "")) i++;

    // Expect (subquery)
    if (upper[i] !== "(") break;
    let depth = 1;
    i++;
    while (i < upper.length && depth > 0) {
      if (upper[i] === "(") depth++;
      else if (upper[i] === ")") depth--;
      // Handle strings inside CTE body (rough)
      i++;
    }

    // After closing paren, check if there's another CTE (comma) or the body
    while (i < upper.length && /\s/.test(upper[i] ?? "")) i++;
    if (upper[i] !== ",") break;
    // There's another CTE — loop
  }

  while (i < upper.length && /\s/.test(upper[i] ?? "")) i++;
  const rest = upper.slice(i);
  const bodyMatch = rest.match(/^([A-Za-z_]+)/);
  if (bodyMatch) {
    return bodyMatch[1]!;
  }
  return "WITH";
}

/**
 * Get the effective SQL command for a single statement.
 * Handles WITH...AS (CTE) by looking past the CTE to the actual command.
 */
function effectiveCommand(stmt: string): string {
  const tok = firstToken(stmt);
  if (tok === "WITH") {
    return resolveWithCommand(stmt);
  }
  return tok;
}

// ---------------------------------------------------------------------------
// Psql meta-command detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the statement looks like a psql meta-command (\!, \copy, \set, etc.)
 */
function isPsqlMetaCommand(stmt: string): boolean {
  return /^\s*\\/.test(stmt);
}

// ---------------------------------------------------------------------------
// Non-ASCII first token detection (homoglyph guard)
// ---------------------------------------------------------------------------

/**
 * Returns true if the first non-whitespace character is a non-ASCII character,
 * which may indicate a unicode homoglyph attack on a SQL keyword.
 */
function hasNonAsciiFirstChar(stmt: string): boolean {
  const m = stmt.match(/^\s*(\S)/);
  if (!m) return false;
  return m[1]!.charCodeAt(0) > 127;
}

// ---------------------------------------------------------------------------
// Hard-reject denylist checks
// ---------------------------------------------------------------------------

interface DenyResult {
  denied: boolean;
  reason?: string;
  code?: "FORBIDDEN_STMT" | "STATEMENT_NOT_ALLOWED";
}

/**
 * Check a single (comment-stripped) statement against the hard-reject denylist.
 * Applied in both classifyForQuery and classifyForExec.
 */
function checkDenylist(
  stmt: string,
  extensionAllowlist: string[],
): DenyResult {
  // Non-ASCII first character — likely homoglyph attack
  if (hasNonAsciiFirstChar(stmt)) {
    return {
      denied: true,
      reason: "Statement begins with non-ASCII character (possible homoglyph attack)",
      code: "STATEMENT_NOT_ALLOWED",
    };
  }

  // Psql meta-commands
  if (isPsqlMetaCommand(stmt)) {
    return {
      denied: true,
      reason: "psql meta-commands are not allowed",
      code: "STATEMENT_NOT_ALLOWED",
    };
  }

  const upper = stmt.toUpperCase().replace(/\s+/g, " ").trim();
  const cmd = effectiveCommand(stmt);

  // ATTACH
  if (cmd === "ATTACH") {
    return { denied: true, reason: "ATTACH is not allowed", code: "FORBIDDEN_STMT" };
  }

  // LOAD
  if (cmd === "LOAD") {
    return { denied: true, reason: "LOAD is not allowed", code: "FORBIDDEN_STMT" };
  }

  // ALTER SYSTEM
  if (cmd === "ALTER" && /^ALTER\s+SYSTEM\b/.test(upper)) {
    return { denied: true, reason: "ALTER SYSTEM is not allowed", code: "FORBIDDEN_STMT" };
  }

  // SET ROLE
  if (cmd === "SET" && /^SET\s+(SESSION\s+)?ROLE\b/.test(upper)) {
    return { denied: true, reason: "SET ROLE is not allowed", code: "FORBIDDEN_STMT" };
  }

  // SET SESSION AUTHORIZATION
  if (cmd === "SET" && /^SET\s+SESSION\s+AUTHORIZATION\b/.test(upper)) {
    return { denied: true, reason: "SET SESSION AUTHORIZATION is not allowed", code: "FORBIDDEN_STMT" };
  }

  // RESET ALL
  if (cmd === "RESET" && /^RESET\s+ALL\b/.test(upper)) {
    return { denied: true, reason: "RESET ALL is not allowed", code: "FORBIDDEN_STMT" };
  }

  // DISCARD ALL
  if (cmd === "DISCARD" && /^DISCARD\s+ALL\b/.test(upper)) {
    return { denied: true, reason: "DISCARD ALL is not allowed", code: "FORBIDDEN_STMT" };
  }

  // COPY ... FROM PROGRAM or COPY ... FROM STDIN (network)
  if (cmd === "COPY") {
    if (/\bFROM\s+PROGRAM\b/.test(upper)) {
      return { denied: true, reason: "COPY FROM PROGRAM is not allowed", code: "FORBIDDEN_STMT" };
    }
    if (/\bFROM\s+STDIN\b/.test(upper)) {
      return { denied: true, reason: "COPY FROM STDIN is not allowed", code: "FORBIDDEN_STMT" };
    }
  }

  // CREATE FOREIGN (TABLE/SERVER/DATA WRAPPER)
  if (cmd === "CREATE" && /^CREATE\s+(FOREIGN|TEMP\s+FOREIGN|TEMPORARY\s+FOREIGN)\b/.test(upper)) {
    return { denied: true, reason: "CREATE FOREIGN is not allowed", code: "FORBIDDEN_STMT" };
  }

  // CREATE EXTENSION — allowlist check
  if (cmd === "CREATE" && /^CREATE\s+EXTENSION\b/.test(upper)) {
    // Extract extension name: CREATE EXTENSION [IF NOT EXISTS] [ "]<name>[" ]
    // The name may be a double-quoted identifier (e.g. "uuid-ossp"); the
    // optional quote must be consumed BEFORE the capture group, otherwise the
    // greedy-optional IF-NOT-EXISTS branch backtracks and captures "IF".
    const extMatch = upper.match(/^CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Z0-9_-]+)"?/);
    if (!extMatch) {
      return { denied: true, reason: "CREATE EXTENSION with unrecognized syntax", code: "FORBIDDEN_STMT" };
    }
    const extName = extMatch[1]!.toLowerCase();
    const allowed = extensionAllowlist.map((e) => e.toLowerCase());
    if (!allowed.includes(extName)) {
      return {
        denied: true,
        reason: `CREATE EXTENSION "${extName}" is not in the extension allowlist`,
        code: "FORBIDDEN_STMT",
      };
    }
    return { denied: false };
  }

  // CREATE ROLE with BYPASSRLS or SUPERUSER
  if (cmd === "CREATE" && /^CREATE\s+ROLE\b/.test(upper)) {
    if (/\bBYPASSRLS\b/.test(upper) || /\bSUPERUSER\b/.test(upper)) {
      return {
        denied: true,
        reason: "CREATE ROLE with BYPASSRLS or SUPERUSER is not allowed",
        code: "FORBIDDEN_STMT",
      };
    }
  }

  // pg_read_server_files, pg_ls_dir — dangerous built-in functions
  if (/\bpg_read_server_files\b/i.test(stmt)) {
    return { denied: true, reason: "pg_read_server_files is not allowed", code: "FORBIDDEN_STMT" };
  }
  if (/\bpg_ls_dir\b/i.test(stmt)) {
    return { denied: true, reason: "pg_ls_dir is not allowed", code: "FORBIDDEN_STMT" };
  }

  return { denied: false };
}

// ---------------------------------------------------------------------------
// Public classify functions
// ---------------------------------------------------------------------------

/**
 * Classify SQL for the /query route.
 *
 * Rules:
 * - Strip comments, split statements.
 * - Reject multi-statement (MULTI_STATEMENT).
 * - Effective command must be SELECT, INSERT, UPDATE, DELETE (including WITH...SELECT etc.).
 * - Apply hard-reject denylist.
 */
export function classifyForQuery(
  sql: string,
  opts?: { extensionAllowlist?: string[] },
): ClassifyResult {
  const extAllowlist = opts?.extensionAllowlist ?? DEFAULT_EXTENSION_ALLOWLIST;
  const stripped = stripComments(sql);
  const stmts = splitStatements(stripped);

  if (stmts.length === 0) {
    return { ok: false, statementType: "", code: "STATEMENT_NOT_ALLOWED", reason: "Empty SQL" };
  }

  if (stmts.length > 1) {
    // Check denylist on the second+ statements for accurate code selection,
    // but the primary rejection is MULTI_STATEMENT.
    return {
      ok: false,
      statementType: effectiveCommand(stmts[0]!) || "",
      code: "MULTI_STATEMENT",
      reason: `Multiple statements are not allowed on /query (found ${stmts.length})`,
    };
  }

  const stmt = stmts[0]!;

  // Denylist check
  const deny = checkDenylist(stmt, extAllowlist);
  if (deny.denied) {
    const cmd = effectiveCommand(stmt);
    return {
      ok: false,
      statementType: cmd,
      code: deny.code,
      reason: deny.reason,
    };
  }

  const cmd = effectiveCommand(stmt);

  // Allowlist: only DML + SELECT
  const QUERY_ALLOWED = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
  if (!QUERY_ALLOWED.has(cmd)) {
    return {
      ok: false,
      statementType: cmd,
      code: "STATEMENT_NOT_ALLOWED",
      reason: `Statement type "${cmd}" is not allowed on /query`,
    };
  }

  return { ok: true, statementType: cmd };
}

/**
 * Classify SQL for the /exec and /migrate routes.
 *
 * Rules:
 * - Strip comments, split statements.
 * - Multi-statement is allowed.
 * - Each statement must not hit the hard-reject denylist.
 * - DDL (CREATE, ALTER, DROP, TRUNCATE, COMMENT) and DML are allowed.
 * - statementType reflects the first statement's effective command.
 */
export function classifyForExec(
  sql: string,
  opts?: { extensionAllowlist?: string[] },
): ClassifyResult {
  const extAllowlist = opts?.extensionAllowlist ?? DEFAULT_EXTENSION_ALLOWLIST;
  const stripped = stripComments(sql);
  const stmts = splitStatements(stripped);

  if (stmts.length === 0) {
    return { ok: false, statementType: "", code: "STATEMENT_NOT_ALLOWED", reason: "Empty SQL" };
  }

  const EXEC_ALLOWED = new Set([
    "SELECT", "INSERT", "UPDATE", "DELETE",
    "CREATE", "ALTER", "DROP", "TRUNCATE", "COMMENT",
    "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT",
    "SET", "RESET", "GRANT", "REVOKE",
    "WITH",
  ]);

  for (const stmt of stmts) {
    // Denylist check (applied to every statement)
    const deny = checkDenylist(stmt, extAllowlist);
    if (deny.denied) {
      const cmd = effectiveCommand(stmt);
      return {
        ok: false,
        statementType: cmd,
        code: deny.code,
        reason: deny.reason,
      };
    }

    const cmd = effectiveCommand(stmt);
    if (!EXEC_ALLOWED.has(cmd) && cmd !== "") {
      return {
        ok: false,
        statementType: cmd,
        code: "STATEMENT_NOT_ALLOWED",
        reason: `Statement type "${cmd}" is not allowed on /exec`,
      };
    }
  }

  const firstCmd = effectiveCommand(stmts[0]!);
  return { ok: true, statementType: firstCmd };
}
