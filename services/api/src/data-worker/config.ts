/**
 * Per-app database worker configuration.
 *
 * Env vars are read ONCE at module load into frozen consts — no per-spawn
 * re-parse. This mirrors the pattern used in dev-server-core.ts.
 *
 * All settings documented in PRD chapter 07.
 */

// ─── Feature flag ────────────────────────────────────────

/** ch07 — Master switch. ON by default; set DOABLE_APP_DB_ENABLED=0 to disable. */
export const DOABLE_APP_DB_ENABLED: boolean =
  process.env.DOABLE_APP_DB_ENABLED !== "0";

// ─── Lifecycle timers ────────────────────────────────────

/** ch07 — Milliseconds of inactivity before a worker is shut down. Default: 600000 (10 min). */
export const DOABLE_APP_DB_IDLE_MS = parseInt(
  process.env.DOABLE_APP_DB_IDLE_MS ?? String(600_000),
  10,
);

/** ch07 — Interval between idle-sweep passes. Default: 60000 (1 min). */
export const DOABLE_APP_DB_SWEEP_MS = parseInt(
  process.env.DOABLE_APP_DB_SWEEP_MS ?? String(60_000),
  10,
);

/** ch07 — Max ms to wait for a worker to emit "ready". DOABLE_APP_DB_SPAWN_TIMEOUT_MS accepted as alias. Default: 5000. */
export const DOABLE_APP_DB_READY_MS = parseInt(
  process.env.DOABLE_APP_DB_READY_MS ??
    process.env.DOABLE_APP_DB_SPAWN_TIMEOUT_MS ??
    String(5_000),
  10,
);

/** ch07 — Max lifetime of a worker process before forced recycle. Default: 28800000 (8 h). */
export const DOABLE_APP_DB_MAX_LIFETIME_MS = parseInt(
  process.env.DOABLE_APP_DB_MAX_LIFETIME_MS ?? String(28_800_000),
  10,
);

/** ch07 — Grace period for in-flight queries during shutdown. Default: 10000. */
export const DOABLE_APP_DB_SHUTDOWN_GRACE_MS = parseInt(
  process.env.DOABLE_APP_DB_SHUTDOWN_GRACE_MS ?? String(10_000),
  10,
);

/** ch07 — Minimum gap between consecutive spawns of the same worker. Default: 10000. */
export const DOABLE_APP_DB_SPAWN_COOLDOWN_MS = parseInt(
  process.env.DOABLE_APP_DB_SPAWN_COOLDOWN_MS ?? String(10_000),
  10,
);

// ─── Resource limits ─────────────────────────────────────

/** ch07 — RSS memory cap per worker in MiB. Default: 128. */
export const DOABLE_APP_DB_MEMORY_MB = parseInt(
  process.env.DOABLE_APP_DB_MEMORY_MB ?? String(128),
  10,
);

/** ch07 — CPU share percentage per worker (env: DOABLE_APP_DB_CPU_SHARES). Default: 25. */
export const DOABLE_APP_DB_CPU_PERCENT = parseInt(
  process.env.DOABLE_APP_DB_CPU_SHARES ?? String(25),
  10,
);

// ─── Pool limits ─────────────────────────────────────────

/** ch07 — Maximum concurrent worker processes. Default: 32. */
export const DOABLE_APP_DB_MAX_WORKERS = parseInt(
  process.env.DOABLE_APP_DB_MAX_WORKERS ?? String(32),
  10,
);

/** ch07 — Per-worker pending request queue depth. Default: 16. */
export const DOABLE_APP_DB_QUEUE_DEPTH = parseInt(
  process.env.DOABLE_APP_DB_QUEUE_DEPTH ?? String(16),
  10,
);

// ─── Query / exec limits ─────────────────────────────────

/** ch07 — Maximum rows returned per query. Default: 10000. */
export const DOABLE_APP_DB_ROW_CAP = parseInt(
  process.env.DOABLE_APP_DB_ROW_CAP ?? String(10_000),
  10,
);

/** ch07 — Per-query read timeout in ms. Default: 5000. */
export const DOABLE_APP_DB_QUERY_TIMEOUT_MS = parseInt(
  process.env.DOABLE_APP_DB_QUERY_TIMEOUT_MS ?? String(5_000),
  10,
);

/** ch07 — Per-exec (DDL/mutation) timeout in ms. Default: 30000. */
export const DOABLE_APP_DB_EXEC_TIMEOUT_MS = parseInt(
  process.env.DOABLE_APP_DB_EXEC_TIMEOUT_MS ?? String(30_000),
  10,
);

// ─── Payload limits ──────────────────────────────────────

/** ch07 — Maximum response body size in bytes. Default: 8388608 (8 MiB). */
export const DOABLE_APP_DB_RESPONSE_MAX_BYTES = parseInt(
  process.env.DOABLE_APP_DB_RESPONSE_MAX_BYTES ?? String(8_388_608),
  10,
);

/** ch07 — Maximum number of bind parameters per query. Default: 1024. */
export const DOABLE_APP_DB_PARAM_MAX = parseInt(
  process.env.DOABLE_APP_DB_PARAM_MAX ?? String(1_024),
  10,
);

/** ch07 — Maximum SQL text size in bytes. Default: 65536 (64 KiB). */
export const DOABLE_APP_DB_SQL_MAX_BYTES = parseInt(
  process.env.DOABLE_APP_DB_SQL_MAX_BYTES ?? String(65_536),
  10,
);

// ─── Rate limits ─────────────────────────────────────────

/** ch07 — Max queries per minute per JWT (authenticated user). Default: 600. */
export const DOABLE_APP_DB_RATE_JWT_PER_MIN = parseInt(
  process.env.DOABLE_APP_DB_RATE_JWT_PER_MIN ?? String(600),
  10,
);

/** ch07 — Max queries per minute per API key. Default: 1200. */
export const DOABLE_APP_DB_RATE_KEY_PER_MIN = parseInt(
  process.env.DOABLE_APP_DB_RATE_KEY_PER_MIN ?? String(1_200),
  10,
);

// ─── Extension allowlist ─────────────────────────────────

/** ch07 — Comma-separated list of Postgres extensions workers may CREATE EXTENSION for. */
export const DOABLE_APP_DB_EXTENSION_ALLOWLIST: string[] = (
  process.env.DOABLE_APP_DB_EXTENSION_ALLOWLIST ??
  "pgcrypto,pg_trgm,uuid-ossp,vector"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// ─── Diagnostics ─────────────────────────────────────────

/** ch07 — Log every SQL statement passing through the worker. Default: false. */
export const DOABLE_APP_DB_LOG_SQL: boolean =
  process.env.DOABLE_APP_DB_LOG_SQL === "1";
