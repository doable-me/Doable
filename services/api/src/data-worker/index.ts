/**
 * Per-project PGlite data worker (PRD per-app-db chapter 03).
 *
 * One worker process per project. Opens the project's PGlite data dir, connects
 * to the API-owned IPC endpoint (Unix domain socket on Linux/macOS, Named Pipe
 * on Windows), and runs a serial request loop. The pool (pool.ts) supervises it.
 *
 * Trust model: this process is the UNTRUSTED side. On Linux it runs inside a
 * bwrap jail under a per-project uid (see sandbox-args.ts); on this dev box it
 * runs as a plain child (documented degrade). It never opens the network and
 * only ever touches its own data dir.
 *
 * Two privilege tiers carried on the IPC frame, NOT on a SQL role (PGlite has a
 * single superuser — there is no role separation; the boundary is the process):
 *   - op "query": RLS-wrapped. We set app.user_id for the transaction via
 *     set_config(...) and run the user's single statement. RLS only constrains
 *     the (owner) connection when the table declares FORCE ROW LEVEL SECURITY —
 *     the migration template / AI prompt emit FORCE, see 04-security-model.
 *   - op "exec": no RLS wrap, multi-statement DDL/migration bodies. Reachable
 *     only from the MCP control plane / server-tier keys (enforced upstream).
 *
 * SET LOCAL app.user_id = $1 is NOT used: Postgres SET does not accept bind
 * parameters. We use set_config('app.user_id', $1, true) which DOES, closing
 * the injection vector the literal-SET form would open.
 */

import net from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

import { encodeFrame, parseFrames, FrameError } from "./ipc.js";
import { classifyForQuery, classifyForExec, DEFAULT_EXTENSION_ALLOWLIST } from "./sql-classifier.js";
import type {
  WorkerRequest,
  WorkerResponse,
  WorkerErrorCode,
  WorkerField,
} from "./types.js";

// ── Arg parsing ───────────────────────────────────────────────────────────

interface WorkerArgs {
  projectId: string;
  endpoint: string; // socket path (unix) or pipe name (windows)
  dataDir: string;
  memoryMb: number;
  idleShutdownMs: number;
  rowCap: number;
  queryTimeoutMs: number;
  execTimeoutMs: number;
  extensionAllowlist: string[];
}

function parseArgs(argv: string[]): WorkerArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };
  const projectId = get("--project-id");
  const endpoint = get("--socket-path") ?? get("--pipe-name");
  const dataDir = get("--data-dir");
  if (!projectId || !endpoint || !dataDir) {
    throw new Error("data-worker: --project-id, --socket-path|--pipe-name, and --data-dir are required");
  }
  const allow = get("--extension-allowlist");
  return {
    projectId,
    endpoint,
    dataDir,
    memoryMb: parseInt(get("--memory-mb") ?? "128", 10),
    idleShutdownMs: parseInt(get("--idle-shutdown-ms") ?? String(11 * 60 * 1000), 10),
    rowCap: parseInt(get("--row-cap") ?? "10000", 10),
    queryTimeoutMs: parseInt(get("--query-timeout-ms") ?? "5000", 10),
    execTimeoutMs: parseInt(get("--exec-timeout-ms") ?? "30000", 10),
    extensionAllowlist: allow ? allow.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_EXTENSION_ALLOWLIST,
  };
}

// ── Error classification ──────────────────────────────────────────────────

interface PgLikeError {
  message?: string;
  code?: string; // SQLSTATE
}

function classifyError(err: unknown): { code: WorkerErrorCode; message: string; pg_code?: string } {
  const e = err as PgLikeError;
  const msg = e?.message ?? String(err);
  const pg = e?.code;
  // SQLSTATE mapping (https://www.postgresql.org/docs/current/errcodes-appendix.html)
  if (pg === "42501" || /row-level security|row level security|policy/i.test(msg)) {
    return { code: "RLS_VIOLATION", message: msg, pg_code: pg };
  }
  if (pg === "57014" || /statement timeout|canceling statement/i.test(msg)) {
    return { code: "TIMEOUT", message: msg, pg_code: pg };
  }
  if (pg === "53100" || /disk full|no space left/i.test(msg)) {
    return { code: "DISK_FULL", message: msg, pg_code: pg };
  }
  if (pg?.startsWith("42") || /syntax error|does not exist|already exists/i.test(msg)) {
    return { code: "SYNTAX", message: msg, pg_code: pg };
  }
  return { code: "INTERNAL", message: msg, pg_code: pg };
}

// ── Main ──────────────────────────────────────────────────────────────────

/**
 * Bootstrap the non-superuser data-plane role. PGlite's only built-in login is
 * the `postgres` SUPERUSER, and superusers BYPASS row-level security entirely —
 * FORCE included. So the data plane (op "query") must run as a non-superuser
 * role for RLS policies to bite. We create `doable_app` (NOLOGIN, no BYPASSRLS),
 * grant it DML, and set ALTER DEFAULT PRIVILEGES so every table the AI later
 * creates (as postgres) auto-grants DML to it. Idempotent — safe every open.
 * DDL (op "exec") deliberately stays as postgres so the schema author is not
 * constrained by the policies they are writing (PRD 04 §6.3).
 */
const APP_ROLE_BOOTSTRAP = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'doable_app') THEN
    CREATE ROLE doable_app NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO doable_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO doable_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO doable_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO doable_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO doable_app;
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Connect to the API-owned IPC endpoint FIRST so the pool observes liveness
  // promptly, THEN open PGlite. A fresh on-disk PGlite dir runs a full initdb
  // (sub-second on Linux; multiple seconds on a Windows dev volume), so the
  // ready frame is intentionally emitted only after the engine is usable.
  const sock = net.createConnection(args.endpoint);
  let lastReqAt = Date.now();
  let shuttingDown = false;

  const send = (resp: WorkerResponse | Record<string, unknown>): void => {
    try {
      sock.write(encodeFrame(resp));
    } catch {
      // socket gone — pool will observe exit
    }
  };

  sock.on("error", () => process.exit(2));
  await new Promise<void>((resolve) => {
    if ((sock as net.Socket).connecting) sock.once("connect", () => resolve());
    else resolve();
  });

  // PGlite logs are silenced on stdout/stderr; the process emits structured
  // events itself. The data dir is the only fs surface the worker writes.
  // The `vector` extension is loaded into every project DB so generated apps
  // can `CREATE EXTENSION vector` from a data.migrate call and use pgvector
  // for RAG / semantic search. "vector" is already in
  // DEFAULT_EXTENSION_ALLOWLIST (sql-classifier.ts) so the subsequent
  // CREATE EXTENSION call passes the classifier without further changes.
  const db = await PGlite.create(args.dataDir, { extensions: { vector } });
  await db.exec(APP_ROLE_BOOTSTRAP);

  // Worker-side idle self-shutdown (belt-and-suspenders if the API died and the
  // pool sweeper never ran — orphaned workers self-clean). Pool side is
  // authoritative; this is a fallback set slightly higher than the pool window.
  const idleTimer = setInterval(() => {
    if (shuttingDown) return;
    if (Date.now() - lastReqAt > args.idleShutdownMs) {
      shuttingDown = true;
      db.close().finally(() => process.exit(0));
    }
  }, 30_000);
  idleTimer.unref();

  // Socket is already connected and PGlite is initialised + bootstrapped:
  // emit the ready handshake as the first IPC frame. The pool's readyPromise
  // resolves on this frame.
  send({ event: "ready", id: "__ready__", pid: process.pid, db_version: "pglite-0.4.5" });

  // Stdout breadcrumb (tee'd into .doable/db.log by the API).
  process.stdout.write(JSON.stringify({ event: "ready", pid: process.pid, project_id: args.projectId }) + "\n");

  try {
    for await (const frame of parseFrames(sock as unknown as AsyncIterable<Buffer>)) {
      lastReqAt = Date.now();
      const req = frame as unknown as WorkerRequest;
      try {
        await handleRequest(db, args, req, send);
      } catch (err) {
        send({ id: req.id, ok: false, error: classifyError(err) });
      }
      if (req.op === "shutdown") break;
    }
  } catch (err) {
    if (err instanceof FrameError) {
      send({ id: "__frame__", ok: false, error: { code: "PAYLOAD_TOO_LARGE", message: err.message } });
    }
  } finally {
    clearInterval(idleTimer);
    if (!shuttingDown) {
      await db.close().catch(() => {});
    }
  }
}

async function handleRequest(
  db: PGlite,
  args: WorkerArgs,
  req: WorkerRequest,
  send: (r: WorkerResponse) => void,
): Promise<void> {
  switch (req.op) {
    case "shutdown": {
      await db.close().catch(() => {});
      send({ id: req.id, ok: true });
      // process exits after the loop breaks
      return;
    }
    case "status": {
      send({ id: req.id, ok: true, rows: [{ pid: process.pid, project_id: args.projectId }], rowCount: 1, fields: [] });
      return;
    }
    case "query":
      return runQuery(db, args, req, send);
    case "exec":
      return runExec(db, args, req, send);
    default:
      send({ id: req.id, ok: false, error: { code: "FORBIDDEN_STMT", message: `unknown op: ${String((req as WorkerRequest).op)}` } });
  }
}

function mapClassifyCode(code?: string): WorkerErrorCode {
  // classifier emits STATEMENT_NOT_ALLOWED | FORBIDDEN_STMT | MULTI_STATEMENT
  if (code === "SYNTAX") return "SYNTAX";
  return "FORBIDDEN_STMT";
}

// PGlite — like the Postgres wire protocol — returns arbitrary-precision and
// 64-bit numeric types as STRINGS to avoid float64 precision loss: numeric /
// decimal (OID 1700), money (790) and int8 / bigint (20). But generated apps
// (and the `: number` TypeScript the AI writes) treat these as JS numbers, e.g.
// `product.price.toFixed(2)`. Receiving the raw string makes that render throw
// `TypeError: x.toFixed is not a function`, which trips the preview ErrorBoundary
// and the (futile) auto-fix loop — every app with a money/decimal column hits it.
// Coerce the number-like columns back to JS numbers here, at the single choke
// point every per-app DB read flows through, so the data matches the app's model.
//
// Precision tradeoff is intentional and mirrors the common
// `pg.types.setTypeParser(1700, Number)` recipe: numeric/decimal/money parse via
// Number(); int8 parses only when the value is a safe integer, otherwise the
// string is preserved so large bigint IDs stay exact.
const NUMBER_LIKE_OIDS = new Set<number>([
  1700, // numeric / decimal
  790, // money
  20, // int8 / bigint
]);

function coerceNumberLikeRows(rows: unknown[], fields: WorkerField[]): void {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const cols: Array<{ name: string; isInt8: boolean }> = [];
  for (const f of fields) {
    if (f.dataTypeID !== undefined && NUMBER_LIKE_OIDS.has(f.dataTypeID)) {
      cols.push({ name: f.name, isInt8: f.dataTypeID === 20 });
    }
  }
  if (cols.length === 0) return;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const obj = row as Record<string, unknown>;
    for (const { name, isInt8 } of cols) {
      const v = obj[name];
      if (typeof v !== "string" || v.length === 0) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue; // 'NaN' / 'Infinity' / junk → leave as-is
      if (isInt8 && !Number.isSafeInteger(n)) continue; // keep big ids exact
      obj[name] = n;
    }
  }
}

async function runQuery(
  db: PGlite,
  args: WorkerArgs,
  req: WorkerRequest,
  send: (r: WorkerResponse) => void,
): Promise<void> {
  const sql = req.sql ?? "";
  const verdict = classifyForQuery(sql, { extensionAllowlist: args.extensionAllowlist });
  if (!verdict.ok) {
    send({ id: req.id, ok: false, error: { code: mapClassifyCode(verdict.code), message: verdict.reason ?? "statement not allowed on query" } });
    return;
  }

  const rowCap = Number.isFinite(req.row_cap) && (req.row_cap as number) > 0 ? Math.floor(req.row_cap as number) : args.rowCap;
  const timeoutMs = Number.isFinite(req.timeout_ms) && (req.timeout_ms as number) > 0 ? Math.floor(req.timeout_ms as number) : args.queryTimeoutMs;
  const params = Array.isArray(req.params) ? req.params : [];
  const isSelect = verdict.statementType === "SELECT";

  // Admin/elevated read (app-auth admin dashboards): the API has already verified
  // the caller is an admin (signed app-session token with adm:true / the project
  // owner) and set req.elevated. We then SKIP the doable_app role drop so the read
  // runs as the RLS-bypassing owner and an admin can see ACROSS all end-users.
  // It is strictly READ-ONLY: refuse a non-SELECT even though the API also gates
  // this (defense in depth — elevation must never write).
  const elevated = req.elevated === true;
  if (elevated && !isSelect) {
    send({ id: req.id, ok: false, error: { code: "FORBIDDEN_STMT", message: "elevated (admin) queries must be read-only SELECTs" } });
    return;
  }

  // Row-cap guard: only wrap reads. We append LIMIT rowCap+1 (validated integer,
  // safe to interpolate) so we can detect truncation without a second query.
  const finalSql = isSelect
    ? `SELECT * FROM (${stripTrailingSemicolon(sql)}) AS _rowcap_guard LIMIT ${rowCap + 1}`
    : sql;

  const result = await db.transaction(async (tx) => {
    // app.user_id drives RLS. set_config(..., is_local=true) scopes it to this
    // txn and accepts a bind parameter (SET ... = $1 cannot). app_user_id is the
    // API-resolved identity; the worker never reads it from the user SQL body.
    // Empty string (never null) so an absent identity fails closed: the policy
    // predicate owner_id = '' matches nothing.
    await tx.query("SELECT set_config('app.user_id', $1, true)", [req.app_user_id ?? ""]);
    await tx.query("SELECT set_config('statement_timeout', $1, true)", [String(timeoutMs)]);
    await tx.query("SELECT set_config('row_security', 'on', true)");
    // Drop from superuser to the non-bypassing app role so RLS actually applies.
    // SET LOCAL auto-resets at COMMIT/ROLLBACK — identity never leaks across txns.
    // EXCEPTION: a verified admin/elevated read stays as the owner (no drop) so it
    // can read every user's rows for a dashboard. Read-only, enforced above.
    if (!elevated) {
      await tx.exec("SET LOCAL ROLE doable_app");
    }
    return tx.query(finalSql, params);
  });

  // Durability: flush the committed write to the on-disk data dir before we ack.
  // Empirically, without this an abrupt worker death (container restart / crash /
  // SIGKILL) lost every row added since the last clean db.close() — the app
  // appeared to "not persist" to the inbuilt DB; with it, a row survives a
  // `kill -9` of the worker (verified). db.transaction() suppresses PGlite's
  // per-statement syncToFs, so we flush explicitly after the write. Reads
  // (SELECT) don't dirty the FS, so skip them. (Harmless no-op on a backend that
  // already persists write-through.)
  if (!isSelect) await db.syncToFs();

  const fields: WorkerField[] = (result.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID }));
  let rows = result.rows as unknown[];
  let truncated = false;
  if (isSelect && rows.length > rowCap) {
    rows = rows.slice(0, rowCap);
    truncated = true;
  }
  const rowCount = isSelect ? rows.length : (result.affectedRows ?? 0);
  coerceNumberLikeRows(rows, fields);
  send({ id: req.id, ok: true, rows, rowCount, fields, truncated });
}

async function runExec(
  db: PGlite,
  args: WorkerArgs,
  req: WorkerRequest,
  send: (r: WorkerResponse) => void,
): Promise<void> {
  const sql = req.sql ?? "";
  const verdict = classifyForExec(sql, { extensionAllowlist: args.extensionAllowlist });
  if (!verdict.ok) {
    send({ id: req.id, ok: false, error: { code: mapClassifyCode(verdict.code), message: verdict.reason ?? "statement not allowed on exec" } });
    return;
  }
  const timeoutMs = Number.isFinite(req.timeout_ms) && (req.timeout_ms as number) > 0 ? Math.floor(req.timeout_ms as number) : args.execTimeoutMs;
  const params = Array.isArray(req.params) ? req.params : [];

  let affected = 0;
  let rows: unknown[] = [];
  let fields: WorkerField[] = [];
  await db.transaction(async (tx) => {
    await tx.query("SELECT set_config('statement_timeout', $1, true)", [String(timeoutMs)]);
    if (params.length > 0) {
      // Parameterised exec is a single statement (e.g. a migration DML row).
      const r = await tx.query(sql, params);
      affected = r.affectedRows ?? 0;
      rows = r.rows as unknown[];
      fields = (r.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID }));
    } else {
      // Multi-statement DDL/migration body — exec() handles the whole script.
      // We surface the LAST statement's rows so exec can back read-only infra
      // queries (schema introspection, the _doable_migrations ledger) which run
      // as the superuser and therefore see the full catalog.
      const results = await tx.exec(sql);
      const last = results[results.length - 1];
      affected = last?.affectedRows ?? 0;
      rows = (last?.rows as unknown[]) ?? [];
      fields = (last?.fields ?? []).map((f) => ({ name: f.name, dataTypeID: f.dataTypeID }));
    }
  });
  // Flush DDL/migration writes to disk before we ack (see runQuery durability
  // note): db.transaction() suppresses PGlite's per-statement syncToFs, so this
  // makes the schema durable immediately rather than only on a clean close.
  await db.syncToFs();
  coerceNumberLikeRows(rows, fields);
  send({ id: req.id, ok: true, rows, rowCount: affected, fields, notices: [] });
}

function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, "");
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ event: "fatal", message: (err as Error).message }) + "\n");
  process.exit(1);
});
