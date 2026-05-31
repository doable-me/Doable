/**
 * Per-app Database data plane (PRD per-app-db 05-data-api).
 *
 * Sibling of connector-proxy: same auth shape (project JWT for preview, dpk_*
 * for deployed apps), same rate-limit window, same connector_audit table. The
 * only difference downstream is that instead of running an Activepieces action
 * we forward a SQL payload into the per-project PGlite worker pool.
 *
 * Routes (all POST, mounted at "/"):
 *   /__doable/data/query    SELECT/INSERT/UPDATE/DELETE — RLS-wrapped per request
 *   /__doable/data/exec     DDL — server-tier key or MCP control plane only
 *   /__doable/data/schema   read-only catalog inspection
 *   /__doable/data/migrate  named idempotent migration — server tier / MCP only
 *
 * Security invariants (PRD 04):
 *   - projectId/userId come from resolveAuth (the credential), NEVER the body (S3).
 *   - app.user_id is the END-USER identity from the `x-doable-app-user` header the
 *     app forwards, falling back to the platform user for preview (S7); the worker
 *     sets it via set_config — the browser cannot forge it.
 *   - exec/migrate are tier-gated; the SQL classifier in the worker is the last line.
 */
import { Hono, type Context } from "hono";
import { createHash } from "node:crypto";

import { sql } from "../db/index.js";
import {
  resolveAuth,
  rateLimitOk,
  getEffectiveRateLimit,
  type ResolvedAuth,
} from "./connector-proxy.js";
import { runOnProject } from "../data-worker/pool.js";
import { verifyAppSession, readAppSessionToken } from "./app-auth.js";
import { introspectSchema } from "../data-worker/schema.js";
import { applyMigration, MIGRATION_ID_RE } from "../data-worker/migrate.js";
import {
  DOABLE_APP_DB_SQL_MAX_BYTES,
  DOABLE_APP_DB_PARAM_MAX,
  DOABLE_APP_DB_ROW_CAP,
  DOABLE_APP_DB_QUERY_TIMEOUT_MS,
} from "../data-worker/config.js";
import type { WorkerRequest, WorkerResponse } from "../data-worker/types.js";

export const appDataRoutes = new Hono({ strict: false });

type DataOp = "query" | "exec" | "schema" | "migrate";

// ── Injectable worker executor (real pool in prod; stubbed in unit tests) ──
type Executor = (projectId: string, req: Omit<WorkerRequest, "id">) => Promise<WorkerResponse>;
let executor: Executor = (projectId, req) => runOnProject(projectId, req);
/** Test seam: override the worker executor so route tests need no real worker. */
export function __setExecutorForTest(fn: Executor | null): void {
  executor = fn ?? ((projectId, req) => runOnProject(projectId, req));
}

// ── Envelope helpers ───────────────────────────────────────────────────────
function jsonError(c: Context, status: number, code: string, message?: string) {
  return c.json({ ok: false, error: { code, message: message ?? code } }, status as 400);
}
function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}
/** Normalise SQL (collapse whitespace, trim) before hashing so semantically
 *  identical statements share a sql_hash (PRD 05 §audit "SHA-256 of normalised SQL"). */
function normalizeSql(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ── Validation ───────────────────────────────────────────────────────────
interface ParsedBody {
  sql: string;
  params: unknown[];
  row_cap?: number;
  timeout_ms?: number;
  migration_id?: string;
}
function parseAndValidate(c: Context, body: Record<string, unknown>, op: DataOp): ParsedBody | Response {
  if (c.req.header("x-doable-data-api") !== "1") {
    return jsonError(c, 400, "PARAMS_INVALID", "Missing or wrong X-Doable-Data-Api header (expected '1')");
  }
  if (op !== "schema") {
    if (typeof body.sql !== "string" || body.sql.trim() === "") {
      return jsonError(c, 400, "PARAMS_INVALID", "sql is required");
    }
    if (Buffer.byteLength(body.sql, "utf8") > DOABLE_APP_DB_SQL_MAX_BYTES) {
      return jsonError(c, 400, "PARAMS_INVALID", `sql exceeds ${DOABLE_APP_DB_SQL_MAX_BYTES} bytes`);
    }
  }
  const params = body.params === undefined ? [] : body.params;
  if (!Array.isArray(params)) {
    return jsonError(c, 400, "PARAMS_INVALID", "params must be an array");
  }
  if (params.length > DOABLE_APP_DB_PARAM_MAX) {
    return jsonError(c, 400, "PARAMS_INVALID", `params length exceeds ${DOABLE_APP_DB_PARAM_MAX}`);
  }
  if (op === "migrate") {
    if (typeof body.migration_id !== "string" || !MIGRATION_ID_RE.test(body.migration_id)) {
      return jsonError(c, 400, "PARAMS_INVALID", "migration_id is required and must match ^[a-z0-9_-]{1,80}$");
    }
  }
  return {
    sql: (body.sql as string) ?? "",
    params,
    row_cap: typeof body.row_cap === "number" ? body.row_cap : undefined,
    timeout_ms: typeof body.timeout_ms === "number" ? body.timeout_ms : undefined,
    migration_id: typeof body.migration_id === "string" ? body.migration_id : undefined,
  };
}

/** exec/migrate require a server-tier key or the MCP control plane. */
export function tierGateBlocks(auth: ResolvedAuth, op: DataOp): boolean {
  if (op !== "exec" && op !== "migrate") return false;
  if (auth.authMode === "api-key" && auth.tier === "server") return false;
  return true; // jwt or client-tier key
}

/** dpk_* allowed_tools membership check against the op name. */
export function toolNotAllowed(auth: ResolvedAuth, op: DataOp): boolean {
  if (auth.authMode !== "api-key") return false;
  if (auth.allowedTools === null) return false; // unrestricted
  return !auth.allowedTools.includes(`data.${op}`);
}

async function appUserId(c: Context, auth: ResolvedAuth): Promise<string> {
  // RLS scopes every row to this identity, so who may ASSERT it is security-critical.
  //
  // (1) Per-app end-user auth (routes/app-auth.ts): if the request carries a
  // VALID app-session token — a JWT signed with JWT_SECRET and bound to THIS
  // project — the identity is that authenticated end-user. This is safe to honour
  // from the browser because the token can only ever assert its own `sub`: a user
  // cannot forge it (no secret) and a token minted for another project fails the
  // projectId check. This is what lets a generated app's OWN users (a salon's
  // customers) get correctly RLS-scoped per-user data without the app ever reading
  // a password hash.
  const sessionToken = readAppSessionToken(c);
  if (sessionToken) {
    const claims = await verifyAppSession(sessionToken, auth.projectId);
    if (claims) return claims.sub;
  }
  // (2) Only a SERVER-tier API key (a trusted backend, never exposed to the browser)
  // may set an arbitrary end-user identity via x-doable-app-user — that is how a
  // developer threads their authenticated end-user through (PRD 04 §6.2 / S7).
  // For browser-exposed credentials (client-tier keys, preview JWTs) the header is
  // IGNORED and the credential acts only as its own identity. Otherwise a user who
  // read the token client-side could set x-doable-app-user=<victim> and read another
  // end-user's RLS-scoped rows. The @doable/data SDK never sets the header, so this
  // is a no-op for the normal app path — it only blocks forged impersonation.
  const trustedBackend = auth.authMode === "api-key" && auth.tier === "server";
  if (trustedBackend) {
    return c.req.header("x-doable-app-user") ?? auth.userId ?? "";
  }
  return auth.userId ?? "";
}

// ── Audit (extended columns from migration 093) ────────────────────────────
async function audit(opts: {
  projectId: string;
  op: DataOp;
  userId?: string;
  statementType?: string;
  sqlText?: string;
  params?: unknown[];
  rowsReturned?: number | null;
  status: "ok" | "denied" | "error";
  errorCode?: string | null;
  durationMs: number;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO connector_audit
        (project_id, integration, action, user_id, status, duration_ms,
         statement_type, sql_hash, params_hash, rows_returned, error_code)
      VALUES
        (${opts.projectId}, 'doable.data', ${`data.${opts.op}`}, ${opts.userId ?? null},
         ${opts.status}, ${opts.durationMs},
         ${opts.statementType ?? null},
         ${opts.sqlText ? sha256(normalizeSql(opts.sqlText)) : null},
         ${opts.params && opts.params.length ? sha256(JSON.stringify(opts.params)) : null},
         ${opts.rowsReturned ?? null},
         ${opts.errorCode ?? null})
    `;
  } catch (err) {
    // Audit must never break the request (matches connector-proxy posture).
    console.error("[app-data] audit insert failed:", err);
  }
}

// ── Shared request pipeline ────────────────────────────────────────────────
async function handle(c: Context, op: DataOp): Promise<Response> {
  const started = Date.now();
  const auth = await resolveAuth(c);
  if (auth instanceof Response) return auth;

  if (toolNotAllowed(auth, op)) {
    return jsonError(c, 403, "TOOL_NOT_ALLOWED", `This API key may not call data.${op}`);
  }
  if (tierGateBlocks(auth, op)) {
    return jsonError(c, 403, "TIER_INSUFFICIENT", "DDL/migration ops require a server-tier API key or the MCP control plane.");
  }

  // Rate limit (best-effort per-project override; auth default if DB unavailable).
  let max: number | null = auth.rateLimit;
  try { max = await getEffectiveRateLimit(auth.projectId, auth.rateLimit); } catch { /* use default */ }
  if (!rateLimitOk(auth.projectId, max)) {
    return jsonError(c, 429, "RATE_LIMITED", "Per-project rate limit exceeded");
  }

  let body: Record<string, unknown>;
  try { body = (await c.req.json()) as Record<string, unknown>; } catch { body = {}; }
  const parsed = parseAndValidate(c, body, op);
  if (parsed instanceof Response) return parsed;

  const exec = (req: Omit<WorkerRequest, "id">) => executor(auth.projectId, req);

  try {
    if (op === "schema") {
      const schema = await introspectSchema(exec);
      await audit({ projectId: auth.projectId, op, userId: auth.userId, statementType: "SCHEMA", status: "ok", durationMs: Date.now() - started });
      return c.json({ ok: true, ...schema, elapsed_ms: Date.now() - started });
    }

    if (op === "migrate") {
      const result = await applyMigration(exec, parsed.migration_id!, parsed.sql);
      await audit({ projectId: auth.projectId, op, userId: auth.userId, statementType: "DDL", sqlText: parsed.sql, status: "ok", durationMs: Date.now() - started });
      return c.json({ ok: true, ...result, elapsed_ms: Date.now() - started });
    }

    // Admin/elevated read: db.admin.query() sends `x-doable-admin: 1`. Honour it
    // ONLY for a verified admin app-session (a signed token with adm:true) on a
    // "query" op — the worker then skips the RLS role drop so the read spans ALL
    // end-users (admin dashboards). A non-admin presenting the header is REFUSED,
    // never silently downgraded. The worker independently enforces SELECT-only.
    let elevated = false;
    if (op === "query" && c.req.header("x-doable-admin") === "1") {
      const tok = readAppSessionToken(c);
      const claims = tok ? await verifyAppSession(tok, auth.projectId) : null;
      if (!claims || claims.adm !== true) {
        return jsonError(c, 403, "ADMIN_REQUIRED", "Admin reads require a signed-in admin account.");
      }
      elevated = true;
    }

    // query | exec
    const workerReq: Omit<WorkerRequest, "id"> = {
      op,
      sql: parsed.sql,
      params: parsed.params,
      app_user_id: op === "query" ? await appUserId(c, auth) : null,
      elevated,
      row_cap: parsed.row_cap ?? DOABLE_APP_DB_ROW_CAP,
      timeout_ms: parsed.timeout_ms ?? DOABLE_APP_DB_QUERY_TIMEOUT_MS,
    };
    const resp = await exec(workerReq);

    if (!resp.ok) {
      // RLS_VIOLATION is an authorization failure (the row's owner check rejected
      // the write/read), NOT a server outage — surface 403 so clients can handle
      // it sensibly and it is not confused with a worker-unavailable 503. Genuine
      // infra failures (WORKER_CRASHED, INTERNAL, DISK_FULL, …) stay 503.
      const httpStatus =
        resp.error.code === "TIMEOUT" ? 408
          : resp.error.code === "RLS_VIOLATION" ? 403
          : resp.error.code === "FORBIDDEN_STMT" || resp.error.code === "SYNTAX" ? 400
          : 503;
      await audit({ projectId: auth.projectId, op, userId: auth.userId, sqlText: parsed.sql, params: parsed.params, status: "error", errorCode: resp.error.code, durationMs: Date.now() - started });
      return c.json({ ok: false, error: { code: resp.error.code, message: resp.error.message }, elapsed_ms: Date.now() - started }, httpStatus as 400);
    }

    const okResp = resp as Extract<WorkerResponse, { ok: true }>;
    await audit({
      projectId: auth.projectId, op, userId: auth.userId,
      sqlText: parsed.sql, params: parsed.params,
      rowsReturned: op === "query" ? (okResp.rowCount ?? 0) : null,
      status: "ok", durationMs: Date.now() - started,
    });
    return c.json({
      ok: true,
      rows: okResp.rows ?? [],
      rowCount: okResp.rowCount ?? 0,
      fields: okResp.fields ?? [],
      truncated: okResp.truncated ?? false,
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await audit({ projectId: auth.projectId, op, userId: auth.userId, sqlText: parsed.sql, status: "error", errorCode: "WORKER_UNAVAILABLE", durationMs: Date.now() - started });
    return jsonError(c, 503, "WORKER_UNAVAILABLE", message);
  }
}

appDataRoutes.post("/__doable/data/query", (c) => handle(c, "query"));
appDataRoutes.post("/__doable/data/exec", (c) => handle(c, "exec"));
appDataRoutes.post("/__doable/data/schema", (c) => handle(c, "schema"));
appDataRoutes.post("/__doable/data/migrate", (c) => handle(c, "migrate"));

appDataRoutes.options("/__doable/data/*", (c) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization, x-doable-data-api, x-doable-app-user",
      "Access-Control-Max-Age": "86400",
    },
  }),
);
