/**
 * Shared TypeScript types for the per-app database IPC protocol and pool.
 *
 * Imported by ipc.ts, the worker entrypoint, the pool, and the routes.
 * PRD chapter 07.
 */

// ─── Protocol primitives ─────────────────────────────────

/** Operations the pool dispatcher can send to a worker. */
export type WorkerOp = "query" | "exec" | "shutdown" | "status";

/** Structured error codes the worker may return over IPC. */
export type WorkerErrorCode =
  | "RLS_VIOLATION"
  | "SYNTAX"
  | "TIMEOUT"
  | "ROW_CAP_EXCEEDED"
  | "FORBIDDEN_STMT"
  | "DISK_FULL"
  | "PAYLOAD_TOO_LARGE"
  | "WORKER_CRASHED"
  | "WORKER_READY_TIMEOUT"
  | "INTERNAL";

// ─── Request ─────────────────────────────────────────────

/** Message sent from the pool to a worker over the IPC channel. */
export interface WorkerRequest {
  /** Correlation ID — echoed back in every response. */
  id: string;
  /** Operation type. */
  op: WorkerOp;
  /** SQL text (required for "query" and "exec"). */
  sql?: string;
  /** Positional bind parameters. */
  params?: unknown[];
  /** RLS identity for SET LOCAL role / app.user_id. */
  app_user_id?: string | null;
  /**
   * Verified admin/elevated read: skip the doable_app role drop so the SELECT
   * runs as the RLS-bypassing owner (admin dashboards read across all users).
   * Set ONLY by the API after it confirms admin status; SELECT-only (enforced in
   * the worker). The browser/app can never set this — it is server-derived.
   */
  elevated?: boolean;
  /** Per-request row cap override (falls back to DOABLE_APP_DB_ROW_CAP). */
  row_cap?: number;
  /** Per-request timeout override in ms. */
  timeout_ms?: number;
  /** W3C traceparent header for distributed tracing. */
  traceparent?: string;
}

// ─── Response ────────────────────────────────────────────

/** Metadata for a single result column. */
export interface WorkerField {
  name: string;
  /** Postgres OID of the column data type. */
  dataTypeID?: number;
}

/** Successful response from a worker. */
export interface WorkerOkResponse {
  /** Echoed correlation ID. */
  id: string;
  ok: true;
  /** Result rows (absent for exec / DDL). */
  rows?: unknown[];
  /** Number of rows affected / returned. */
  rowCount?: number;
  /** Column metadata. */
  fields?: WorkerField[];
  /** Any NOTICE messages emitted during execution. */
  notices?: string[];
  /** True when the result was truncated to row_cap. */
  truncated?: boolean;
  /** Streaming chunk payload (used by chunked response mode). */
  chunk?: unknown[];
  /** True on the final chunk of a streaming response. */
  done?: boolean;
}

/** Error response from a worker. */
export interface WorkerErrResponse {
  /** Echoed correlation ID. */
  id: string;
  ok: false;
  error: {
    code: WorkerErrorCode;
    message: string;
    /** Raw Postgres SQLSTATE code, if available. */
    pg_code?: string;
  };
}

/** Discriminated union of all worker response shapes. */
export type WorkerResponse = WorkerOkResponse | WorkerErrResponse;
