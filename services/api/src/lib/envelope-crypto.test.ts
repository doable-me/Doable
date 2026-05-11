/**
 * Unit tests for envelope-crypto.
 *
 * Uses node:test (zero-config — vitest isn't installed in this workspace).
 * Run with: pnpm tsx --test services/api/src/lib/envelope-crypto.test.ts
 *
 * DB-touching paths (getOrCreateWorkspaceDek, rotateWorkspaceDek,
 * encrypt/decrypt) require a Postgres reachable via DATABASE_URL with the
 * workspace_keys table from migration 069 applied. The pure-crypto and
 * tampering tests run unconditionally.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DOABLE_KEK = randomBytes(32).toString("base64");

const HAS_DB = !!process.env.DATABASE_URL;

const {
  loadKek,
  encryptForWorkspace,
  decryptForWorkspace,
  rotateWorkspaceDek,
  invalidateDekCache,
  __resetKekCacheForTests,
} = await import("./envelope-crypto.js");

test("loadKek decodes a 32-byte base64 key", () => {
  __resetKekCacheForTests();
  const kek = loadKek();
  assert.equal(kek.length, 32);
});

test("loadKek rejects a wrong-length key outside test env", () => {
  const prevKek = process.env.DOABLE_KEK;
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    process.env.DOABLE_KEK = Buffer.from("too-short").toString("base64");
    __resetKekCacheForTests();
    assert.throws(() => loadKek(), /32 bytes/);
  } finally {
    process.env.DOABLE_KEK = prevKek;
    process.env.NODE_ENV = prevEnv;
    __resetKekCacheForTests();
    loadKek(); // re-warm with test key
  }
});

test(
  "round-trip encrypt/decrypt returns original plaintext",
  { skip: HAS_DB ? false : "DATABASE_URL not set" },
  async () => {
    const workspaceId = randomUUID();
    const plaintext = "hunter2-very-secret-credential";
    const blob = await encryptForWorkspace(workspaceId, plaintext);
    const decrypted = await decryptForWorkspace(workspaceId, blob);
    assert.equal(decrypted.toString("utf8"), plaintext);
  },
);

test(
  "tampered ciphertext is rejected by GCM auth tag",
  { skip: HAS_DB ? false : "DATABASE_URL not set" },
  async () => {
    const workspaceId = randomUUID();
    const blob = await encryptForWorkspace(workspaceId, "secret");
    const buf = Buffer.from(blob, "base64");
    // Flip a bit in the ciphertext region (after header(5) + iv(12) + tag(16))
    buf[buf.length - 1] = (buf[buf.length - 1]! ^ 0x01) & 0xff;
    const tampered = buf.toString("base64");
    await assert.rejects(() => decryptForWorkspace(workspaceId, tampered));
  },
);

test(
  "rotateWorkspaceDek bumps key_version and old blobs still decrypt",
  { skip: HAS_DB ? false : "DATABASE_URL not set" },
  async () => {
    const workspaceId = randomUUID();
    const blobV1 = await encryptForWorkspace(workspaceId, "before-rotation");

    await rotateWorkspaceDek(workspaceId);
    invalidateDekCache(workspaceId);

    const blobV2 = await encryptForWorkspace(workspaceId, "after-rotation");

    // New blob carries key_version=2 in bytes [1..4]
    const v1Bytes = Buffer.from(blobV1, "base64");
    const v2Bytes = Buffer.from(blobV2, "base64");
    assert.equal(v1Bytes.readUInt32BE(1), 1);
    assert.equal(v2Bytes.readUInt32BE(1), 2);

    // Both should still decrypt to their original plaintext
    const dec1 = await decryptForWorkspace(workspaceId, blobV1);
    const dec2 = await decryptForWorkspace(workspaceId, blobV2);
    assert.equal(dec1.toString("utf8"), "before-rotation");
    assert.equal(dec2.toString("utf8"), "after-rotation");
  },
);
