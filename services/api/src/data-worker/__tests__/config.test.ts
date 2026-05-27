import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Delete all DOABLE_APP_DB_* env vars BEFORE importing config so that
// the module loads with its hardcoded defaults (env is read once at module load).
const DB_ENV_KEYS = [
  "DOABLE_APP_DB_ENABLED",
  "DOABLE_APP_DB_IDLE_MS",
  "DOABLE_APP_DB_SWEEP_MS",
  "DOABLE_APP_DB_READY_MS",
  "DOABLE_APP_DB_SPAWN_TIMEOUT_MS",
  "DOABLE_APP_DB_MEMORY_MB",
  "DOABLE_APP_DB_CPU_SHARES",
  "DOABLE_APP_DB_MAX_WORKERS",
  "DOABLE_APP_DB_QUEUE_DEPTH",
  "DOABLE_APP_DB_ROW_CAP",
  "DOABLE_APP_DB_QUERY_TIMEOUT_MS",
  "DOABLE_APP_DB_EXEC_TIMEOUT_MS",
  "DOABLE_APP_DB_MAX_LIFETIME_MS",
  "DOABLE_APP_DB_SHUTDOWN_GRACE_MS",
  "DOABLE_APP_DB_SPAWN_COOLDOWN_MS",
  "DOABLE_APP_DB_RESPONSE_MAX_BYTES",
  "DOABLE_APP_DB_PARAM_MAX",
  "DOABLE_APP_DB_SQL_MAX_BYTES",
  "DOABLE_APP_DB_RATE_JWT_PER_MIN",
  "DOABLE_APP_DB_RATE_KEY_PER_MIN",
  "DOABLE_APP_DB_EXTENSION_ALLOWLIST",
  "DOABLE_APP_DB_LOG_SQL",
];
for (const k of DB_ENV_KEYS) delete process.env[k];

const cfg = await import("../config.js");

describe("data-worker/config defaults", () => {
  it("ENABLED defaults to true when unset (only explicit '0' disables)", () => {
    assert.equal(cfg.DOABLE_APP_DB_ENABLED, true);
  });

  it("ENABLED is false only when explicitly set to '0'", async () => {
    process.env.DOABLE_APP_DB_ENABLED = "0";
    // Cache-busting query string forces a fresh module load so the env read re-runs.
    const disabled = await import("../config.js?disabled");
    assert.equal(disabled.DOABLE_APP_DB_ENABLED, false);
    delete process.env.DOABLE_APP_DB_ENABLED;
  });

  it("IDLE_MS defaults to 600000", () => {
    assert.equal(cfg.DOABLE_APP_DB_IDLE_MS, 600_000);
  });

  it("SWEEP_MS defaults to 60000", () => {
    assert.equal(cfg.DOABLE_APP_DB_SWEEP_MS, 60_000);
  });

  it("READY_MS defaults to 5000", () => {
    assert.equal(cfg.DOABLE_APP_DB_READY_MS, 5_000);
  });

  it("MEMORY_MB defaults to 128", () => {
    assert.equal(cfg.DOABLE_APP_DB_MEMORY_MB, 128);
  });

  it("CPU_PERCENT defaults to 25", () => {
    assert.equal(cfg.DOABLE_APP_DB_CPU_PERCENT, 25);
  });

  it("MAX_WORKERS defaults to 32", () => {
    assert.equal(cfg.DOABLE_APP_DB_MAX_WORKERS, 32);
  });

  it("QUEUE_DEPTH defaults to 16", () => {
    assert.equal(cfg.DOABLE_APP_DB_QUEUE_DEPTH, 16);
  });

  it("ROW_CAP defaults to 10000", () => {
    assert.equal(cfg.DOABLE_APP_DB_ROW_CAP, 10_000);
  });

  it("QUERY_TIMEOUT_MS defaults to 5000", () => {
    assert.equal(cfg.DOABLE_APP_DB_QUERY_TIMEOUT_MS, 5_000);
  });

  it("EXEC_TIMEOUT_MS defaults to 30000", () => {
    assert.equal(cfg.DOABLE_APP_DB_EXEC_TIMEOUT_MS, 30_000);
  });

  it("MAX_LIFETIME_MS defaults to 28800000", () => {
    assert.equal(cfg.DOABLE_APP_DB_MAX_LIFETIME_MS, 28_800_000);
  });

  it("SHUTDOWN_GRACE_MS defaults to 10000", () => {
    assert.equal(cfg.DOABLE_APP_DB_SHUTDOWN_GRACE_MS, 10_000);
  });

  it("SPAWN_COOLDOWN_MS defaults to 10000", () => {
    assert.equal(cfg.DOABLE_APP_DB_SPAWN_COOLDOWN_MS, 10_000);
  });

  it("RESPONSE_MAX_BYTES defaults to 8388608", () => {
    assert.equal(cfg.DOABLE_APP_DB_RESPONSE_MAX_BYTES, 8_388_608);
  });

  it("PARAM_MAX defaults to 1024", () => {
    assert.equal(cfg.DOABLE_APP_DB_PARAM_MAX, 1_024);
  });

  it("SQL_MAX_BYTES defaults to 65536", () => {
    assert.equal(cfg.DOABLE_APP_DB_SQL_MAX_BYTES, 65_536);
  });

  it("RATE_JWT_PER_MIN defaults to 600", () => {
    assert.equal(cfg.DOABLE_APP_DB_RATE_JWT_PER_MIN, 600);
  });

  it("RATE_KEY_PER_MIN defaults to 1200", () => {
    assert.equal(cfg.DOABLE_APP_DB_RATE_KEY_PER_MIN, 1_200);
  });

  it("EXTENSION_ALLOWLIST deep-equals the 4-item default array", () => {
    assert.deepEqual(cfg.DOABLE_APP_DB_EXTENSION_ALLOWLIST, [
      "pgcrypto",
      "pg_trgm",
      "uuid-ossp",
      "vector",
    ]);
  });

  it("LOG_SQL defaults to false", () => {
    assert.equal(cfg.DOABLE_APP_DB_LOG_SQL, false);
  });
});
