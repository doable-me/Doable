/**
 * Unit tests for data-worker/telemetry.ts
 *
 * Run with:
 *   pnpm exec tsx --test services/api/src/data-worker/__tests__/telemetry.test.ts
 *
 * Asserts:
 * - Module imports without throwing (no side-effects at import time)
 * - All documented functions are exported
 * - Each record* function does not throw (OTel no-op provider path)
 * - hashUserId returns a 64-char hex SHA-256 digest (not raw input)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  hashUserId,
  recordWorkerSpawned,
  recordWorkerExited,
  recordQuery,
  recordEviction,
  setWorkerCount,
} from "../telemetry.js";

// ---------------------------------------------------------------------------
// Export surface
// ---------------------------------------------------------------------------

describe("telemetry exports", () => {
  it("exports hashUserId as a function", () => {
    assert.strictEqual(typeof hashUserId, "function");
  });

  it("exports recordWorkerSpawned as a function", () => {
    assert.strictEqual(typeof recordWorkerSpawned, "function");
  });

  it("exports recordWorkerExited as a function", () => {
    assert.strictEqual(typeof recordWorkerExited, "function");
  });

  it("exports recordQuery as a function", () => {
    assert.strictEqual(typeof recordQuery, "function");
  });

  it("exports recordEviction as a function", () => {
    assert.strictEqual(typeof recordEviction, "function");
  });

  it("exports setWorkerCount as a function", () => {
    assert.strictEqual(typeof setWorkerCount, "function");
  });
});

// ---------------------------------------------------------------------------
// hashUserId — privacy contract
// ---------------------------------------------------------------------------

describe("hashUserId", () => {
  it("returns a 64-char lowercase hex string (SHA-256)", () => {
    const raw = "user-uuid-abc-123";
    const digest = hashUserId(raw);
    assert.strictEqual(digest.length, 64, "SHA-256 hex must be 64 chars");
    assert.match(digest, /^[0-9a-f]{64}$/, "must be lowercase hex");
  });

  it("does NOT return the raw input", () => {
    const raw = "my-secret-user-id";
    const digest = hashUserId(raw);
    assert.notStrictEqual(digest, raw, "hash must differ from raw input");
    assert.ok(!digest.includes(raw), "hash must not contain raw input as substring");
  });

  it("is deterministic for the same input", () => {
    const raw = "stable-user-id";
    assert.strictEqual(hashUserId(raw), hashUserId(raw));
  });

  it("produces different digests for different inputs", () => {
    assert.notStrictEqual(hashUserId("user-a"), hashUserId("user-b"));
  });
});

// ---------------------------------------------------------------------------
// record* functions — no-op OTel provider (no SDK registered)
// ---------------------------------------------------------------------------

describe("recordWorkerSpawned", () => {
  it("does not throw with valid args", () => {
    assert.doesNotThrow(() => recordWorkerSpawned("proj-001", 450));
  });

  it("does not throw with zero duration", () => {
    assert.doesNotThrow(() => recordWorkerSpawned("proj-001", 0));
  });
});

describe("recordWorkerExited", () => {
  it("does not throw for idle reason", () => {
    assert.doesNotThrow(() => recordWorkerExited("proj-001", "idle"));
  });

  it("does not throw for lru reason", () => {
    assert.doesNotThrow(() => recordWorkerExited("proj-002", "lru"));
  });

  it("does not throw for oom reason", () => {
    assert.doesNotThrow(() => recordWorkerExited("proj-003", "oom"));
  });

  it("does not throw for shutdown reason", () => {
    assert.doesNotThrow(() => recordWorkerExited("proj-004", "shutdown"));
  });
});

describe("recordQuery", () => {
  it("does not throw for a successful select", () => {
    assert.doesNotThrow(() => recordQuery("proj-001", "select", 12, true));
  });

  it("does not throw for a failed insert with error code", () => {
    assert.doesNotThrow(() => recordQuery("proj-001", "insert", 5, false, "23505"));
  });

  it("does not throw for a failed query without error code", () => {
    assert.doesNotThrow(() => recordQuery("proj-001", "update", 8, false));
  });

  it("does not throw for each statement type", () => {
    const types = ["select", "insert", "update", "delete", "ddl", "other"] as const;
    for (const t of types) {
      assert.doesNotThrow(() => recordQuery("proj-001", t, 1, true), `should not throw for ${t}`);
    }
  });
});

describe("recordEviction", () => {
  it("does not throw for idle reason", () => {
    assert.doesNotThrow(() => recordEviction("idle"));
  });

  it("does not throw for lru reason", () => {
    assert.doesNotThrow(() => recordEviction("lru"));
  });

  it("does not throw for oom reason", () => {
    assert.doesNotThrow(() => recordEviction("oom"));
  });

  it("does not throw for shutdown reason", () => {
    assert.doesNotThrow(() => recordEviction("shutdown"));
  });
});

describe("setWorkerCount", () => {
  it("does not throw adding a busy worker", () => {
    assert.doesNotThrow(() => setWorkerCount("proj-001", "busy", 1));
  });

  it("does not throw removing a spawning worker", () => {
    assert.doesNotThrow(() => setWorkerCount("proj-001", "spawning", -1));
  });

  it("does not throw for all status values", () => {
    const statuses = ["idle", "busy", "spawning", "draining"] as const;
    for (const s of statuses) {
      assert.doesNotThrow(() => setWorkerCount("proj-001", s, 1), `should not throw for ${s}`);
      assert.doesNotThrow(() => setWorkerCount("proj-001", s, -1), `should not throw for -${s}`);
    }
  });
});
