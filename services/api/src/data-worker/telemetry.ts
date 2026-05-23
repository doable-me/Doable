/**
 * OpenTelemetry instrumentation for the per-app-DB worker pool.
 *
 * Import side effects: none beyond creating meter instruments (no provider
 * registration, no env reads that throw). Safe to import when TRACING_LEVEL=off
 * — @opentelemetry/api returns no-op instruments when no SDK is registered.
 *
 * Pattern mirrors services/api/src/tracing/instrumentation.ts: acquire the
 * global API singleton via `metrics` from "@opentelemetry/api" and call
 * getMeter(). The SDK registers a MeterProvider via metrics.setGlobalMeterProvider()
 * at init time; without it the API returns a no-op Meter.
 */

import { createHash } from "node:crypto";
import { metrics, type UpDownCounter, type Histogram, type Counter } from "@opentelemetry/api";

// ---------------------------------------------------------------------------
// Meter + instruments (lazily initialised once)
// ---------------------------------------------------------------------------

const METER_NAME = "doable.app-db";

// Bounds from PRD 07 §Telemetry
const QUERY_DURATION_BOUNDARIES = [1, 5, 10, 25, 50, 100, 250, 1000, 5000];

let _workerCount: UpDownCounter | undefined;
let _queryDuration: Histogram | undefined;
let _poolEvictions: Counter | undefined;
let _queryErrors: Counter | undefined;
let _spawnDuration: Histogram | undefined;

function meter() {
  return metrics.getMeter(METER_NAME);
}

function workerCount(): UpDownCounter {
  if (!_workerCount) {
    _workerCount = meter().createUpDownCounter("doable.db.worker.count", {
      description: "Number of live app-DB worker processes by status",
      unit: "{worker}",
    });
  }
  return _workerCount;
}

function queryDuration(): Histogram {
  if (!_queryDuration) {
    _queryDuration = meter().createHistogram("doable.db.query.duration_ms", {
      description: "Duration of app-DB query execution in milliseconds",
      unit: "ms",
      advice: { explicitBucketBoundaries: QUERY_DURATION_BOUNDARIES },
    });
  }
  return _queryDuration;
}

function poolEvictions(): Counter {
  if (!_poolEvictions) {
    _poolEvictions = meter().createCounter("doable.db.pool.evictions", {
      description: "Number of worker evictions from the pool",
      unit: "{eviction}",
    });
  }
  return _poolEvictions;
}

function queryErrors(): Counter {
  if (!_queryErrors) {
    _queryErrors = meter().createCounter("doable.db.query.errors", {
      description: "Number of app-DB query errors",
      unit: "{error}",
    });
  }
  return _queryErrors;
}

function spawnDuration(): Histogram {
  if (!_spawnDuration) {
    _spawnDuration = meter().createHistogram("doable.db.worker.spawn_duration_ms", {
      description: "Duration of worker spawn (bwrap/Job Object setup) in milliseconds",
      unit: "ms",
    });
  }
  return _spawnDuration;
}

// ---------------------------------------------------------------------------
// SHA-256 helper — NEVER store raw app_user_id in attributes
// ---------------------------------------------------------------------------

/** Returns the SHA-256 hex digest of a raw user ID. Safe to include in spans/metrics. */
export function hashUserId(rawUserId: string): string {
  return createHash("sha256").update(rawUserId).digest("hex");
}

// ---------------------------------------------------------------------------
// Public recording API
// ---------------------------------------------------------------------------

export type WorkerStatus = "idle" | "busy" | "spawning" | "draining";
export type EvictionReason = "idle" | "lru" | "oom" | "shutdown" | "crash";
export type StatementType = "select" | "insert" | "update" | "delete" | "ddl" | "other";

/**
 * Record a successful worker spawn.
 *
 * @param projectId  - project UUID (safe to store as-is)
 * @param durationMs - wall-clock time from spawn initiation to IPC handshake
 */
export function recordWorkerSpawned(projectId: string, durationMs: number): void {
  spawnDuration().record(durationMs, { project_id: projectId });
  workerCount().add(1, { project_id: projectId, status: "idle" as WorkerStatus });
}

/**
 * Record a worker exiting the pool for any reason.
 *
 * @param projectId - project UUID
 * @param reason    - why the worker exited; drives eviction counter when applicable
 */
export function recordWorkerExited(projectId: string, reason: EvictionReason): void {
  workerCount().add(-1, { project_id: projectId, status: "idle" as WorkerStatus });
  if (reason !== "shutdown") {
    poolEvictions().add(1, { project_id: projectId, reason });
  }
}

/**
 * Record a completed query (success or error).
 *
 * @param projectId     - project UUID
 * @param statementType - classifier verdict
 * @param durationMs    - wall-clock execution time
 * @param ok            - true if query completed without error
 * @param errorCode     - optional PG/internal error code when ok=false
 */
export function recordQuery(
  projectId: string,
  statementType: StatementType,
  durationMs: number,
  ok: boolean,
  errorCode?: string,
): void {
  const base = { project_id: projectId, statement_type: statementType };
  queryDuration().record(durationMs, base);
  if (!ok) {
    queryErrors().add(1, {
      ...base,
      ...(errorCode !== undefined ? { error_code: errorCode } : {}),
    });
  }
}

/**
 * Record a pool eviction (pool-wide, no project context).
 *
 * @param reason - why the eviction occurred
 */
export function recordEviction(reason: EvictionReason): void {
  poolEvictions().add(1, { reason });
}

/**
 * Update the worker-count gauge for a specific status bucket.
 * Call this whenever the pool transitions a worker between statuses.
 *
 * @param projectId - project UUID
 * @param status    - new status of the worker
 * @param delta     - +1 entering status, -1 leaving status
 */
export function setWorkerCount(projectId: string, status: WorkerStatus, delta: 1 | -1): void {
  workerCount().add(delta, { project_id: projectId, status });
}
