/**
 * Envelope encryption helper.
 *
 * Each workspace owns a Data Encryption Key (DEK). DEKs are AES-256-GCM-wrapped
 * by a Key Encryption Key (KEK) loaded from process.env.DOABLE_KEK (base64,
 * 32 raw bytes after decode). Plaintext DEKs are cached in-process for 5 min
 * of idle time; the cache can be invalidated explicitly on rotation.
 *
 * Blob wire format (base64-decoded bytes):
 *   [0]            HEADER_VERSION (0x01)
 *   [1..4]         key_version (uint32 big-endian)
 *   [5..16]        iv (12 bytes)
 *   [17..32]       auth tag (16 bytes)
 *   [33..]         ciphertext
 *
 * Wave 1 (this module): standalone helper + workspace_keys table.
 * Wave 2 (follow-up): migrate credential-vault.ts call sites to use these
 * helpers in place of pgp_sym_encrypt/ENCRYPTION_KEY.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { sql } from "../db/index.js";

// ─── Constants ─────────────────────────────────────────────────────────

const HEADER_VERSION = 0x01;
const DEK_BYTES = 32; // AES-256
const IV_BYTES = 12;  // GCM standard
const TAG_BYTES = 16; // GCM auth tag
const DEK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min idle eviction

// ─── KEK loading ───────────────────────────────────────────────────────

let cachedKek: Buffer | null = null;

/**
 * Load the Key Encryption Key from process.env.DOABLE_KEK.
 * Expects a base64-encoded 32-byte key. Caches after first successful load.
 * Throws if absent/invalid in non-test environments.
 */
export function loadKek(): Buffer {
  if (cachedKek) return cachedKek;

  const raw = process.env.DOABLE_KEK;
  const isTest = process.env.NODE_ENV === "test";

  if (!raw) {
    if (isTest) {
      // Generate ephemeral KEK for tests so round-trips work without setup.
      cachedKek = randomBytes(DEK_BYTES);
      return cachedKek;
    }
    throw new Error(
      "[envelope-crypto] DOABLE_KEK is not set. Provide a base64-encoded 32-byte key in the API process env.",
    );
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw, "base64");
  } catch {
    throw new Error("[envelope-crypto] DOABLE_KEK is not valid base64.");
  }

  if (decoded.length !== DEK_BYTES) {
    throw new Error(
      `[envelope-crypto] DOABLE_KEK must decode to exactly ${DEK_BYTES} bytes (got ${decoded.length}).`,
    );
  }

  cachedKek = decoded;
  return cachedKek;
}

// ─── DEK cache ─────────────────────────────────────────────────────────

interface CacheEntry {
  dek: Buffer;
  keyVersion: number;
  lastUsedAt: number;
}

const dekCache = new Map<string, CacheEntry>();

function touchCache(entry: CacheEntry): void {
  entry.lastUsedAt = Date.now();
}

function evictIdleEntries(): void {
  const now = Date.now();
  for (const [workspaceId, entry] of dekCache) {
    if (now - entry.lastUsedAt > DEK_CACHE_TTL_MS) {
      dekCache.delete(workspaceId);
    }
  }
}

/** Clear cached plaintext DEK(s). Pass no args to clear all entries. */
export function invalidateDekCache(workspaceId?: string): void {
  if (workspaceId) {
    dekCache.delete(workspaceId);
  } else {
    dekCache.clear();
  }
}

// ─── Low-level wrap / unwrap ───────────────────────────────────────────

interface WrappedDek {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

function wrapDekWithKek(dek: Buffer, kek: Buffer): WrappedDek {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

function unwrapDekWithKek(wrapped: WrappedDek, kek: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", kek, wrapped.iv);
  decipher.setAuthTag(wrapped.tag);
  return Buffer.concat([decipher.update(wrapped.ciphertext), decipher.final()]);
}

// ─── DEK lifecycle ─────────────────────────────────────────────────────

interface WorkspaceKeyRow {
  key_version: number;
  wrapped_dek: Buffer;
  wrapped_iv: Buffer;
  wrapped_tag: Buffer;
}

async function fetchActiveDekRow(workspaceId: string): Promise<WorkspaceKeyRow | null> {
  const [row] = await sql<WorkspaceKeyRow[]>`
    SELECT key_version, wrapped_dek, wrapped_iv, wrapped_tag
    FROM workspace_keys
    WHERE workspace_id = ${workspaceId}
      AND active = true
    ORDER BY key_version DESC
    LIMIT 1
  `;
  return row ?? null;
}

async function insertWrappedDek(
  workspaceId: string,
  keyVersion: number,
  wrapped: WrappedDek,
): Promise<void> {
  await sql`
    INSERT INTO workspace_keys (
      workspace_id, key_version, wrapped_dek, wrapped_iv, wrapped_tag, active
    ) VALUES (
      ${workspaceId},
      ${keyVersion},
      ${wrapped.ciphertext},
      ${wrapped.iv},
      ${wrapped.tag},
      true
    )
  `;
}

/**
 * Resolve the plaintext DEK for a workspace. If no active DEK exists in the
 * workspace_keys table, generates a fresh 32-byte DEK, wraps it with KEK,
 * persists it, and returns it. Subsequent calls hit the in-memory cache.
 */
export async function getOrCreateWorkspaceDek(workspaceId: string): Promise<Buffer> {
  evictIdleEntries();

  const cached = dekCache.get(workspaceId);
  if (cached) {
    touchCache(cached);
    return cached.dek;
  }

  const kek = loadKek();
  const existing = await fetchActiveDekRow(workspaceId);

  if (existing) {
    const dek = unwrapDekWithKek(
      {
        ciphertext: Buffer.from(existing.wrapped_dek),
        iv: Buffer.from(existing.wrapped_iv),
        tag: Buffer.from(existing.wrapped_tag),
      },
      kek,
    );
    const entry: CacheEntry = {
      dek,
      keyVersion: existing.key_version,
      lastUsedAt: Date.now(),
    };
    dekCache.set(workspaceId, entry);
    return dek;
  }

  const dek = randomBytes(DEK_BYTES);
  const wrapped = wrapDekWithKek(dek, kek);
  await insertWrappedDek(workspaceId, 1, wrapped);

  const entry: CacheEntry = { dek, keyVersion: 1, lastUsedAt: Date.now() };
  dekCache.set(workspaceId, entry);
  return dek;
}

/**
 * Generate a new DEK version for the workspace, persist it, deactivate the
 * previous active row (marking rotated_at), and invalidate the cache.
 * Callers can lazily re-encrypt existing ciphertext at their leisure — old
 * blobs remain decryptable as long as the inactive workspace_keys row exists.
 */
export async function rotateWorkspaceDek(workspaceId: string): Promise<void> {
  const kek = loadKek();
  const existing = await fetchActiveDekRow(workspaceId);
  const nextVersion = (existing?.key_version ?? 0) + 1;

  const dek = randomBytes(DEK_BYTES);
  const wrapped = wrapDekWithKek(dek, kek);

  await sql.begin(async (tx: any) => {
    if (existing) {
      await tx`
        UPDATE workspace_keys
        SET active = false,
            rotated_at = now()
        WHERE workspace_id = ${workspaceId}
          AND key_version = ${existing.key_version}
      `;
    }
    await tx`
      INSERT INTO workspace_keys (
        workspace_id, key_version, wrapped_dek, wrapped_iv, wrapped_tag, active
      ) VALUES (
        ${workspaceId},
        ${nextVersion},
        ${wrapped.ciphertext},
        ${wrapped.iv},
        ${wrapped.tag},
        true
      )
    `;
  });

  invalidateDekCache(workspaceId);
}

/**
 * Look up a specific DEK version (active or rotated) for the workspace.
 * Used by decryption when the blob carries an older key_version.
 */
async function getDekByVersion(workspaceId: string, keyVersion: number): Promise<Buffer> {
  const [row] = await sql<WorkspaceKeyRow[]>`
    SELECT key_version, wrapped_dek, wrapped_iv, wrapped_tag
    FROM workspace_keys
    WHERE workspace_id = ${workspaceId}
      AND key_version = ${keyVersion}
    LIMIT 1
  `;
  if (!row) {
    throw new Error(
      `[envelope-crypto] No DEK found for workspace ${workspaceId} version ${keyVersion}.`,
    );
  }
  const kek = loadKek();
  return unwrapDekWithKek(
    {
      ciphertext: Buffer.from(row.wrapped_dek),
      iv: Buffer.from(row.wrapped_iv),
      tag: Buffer.from(row.wrapped_tag),
    },
    kek,
  );
}

// ─── Public encrypt / decrypt ──────────────────────────────────────────

/**
 * AES-256-GCM-encrypt `plaintext` with the workspace's active DEK.
 * Returns base64 of [version | keyVersion | iv | tag | ciphertext].
 */
export async function encryptForWorkspace(
  workspaceId: string,
  plaintext: string | Buffer,
): Promise<string> {
  const dek = await getOrCreateWorkspaceDek(workspaceId);
  const cached = dekCache.get(workspaceId);
  const keyVersion = cached?.keyVersion ?? 1;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  const header = Buffer.alloc(5);
  header[0] = HEADER_VERSION;
  header.writeUInt32BE(keyVersion, 1);

  return Buffer.concat([header, iv, tag, ciphertext]).toString("base64");
}

/**
 * Inverse of `encryptForWorkspace`. Returns the plaintext bytes.
 * Throws if the blob header is unknown or the tag/auth check fails (tampering).
 */
export async function decryptForWorkspace(
  workspaceId: string,
  blob: string,
): Promise<Buffer> {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 5 + IV_BYTES + TAG_BYTES) {
    throw new Error("[envelope-crypto] Ciphertext blob too short.");
  }

  const version = buf[0]!;
  if (version !== HEADER_VERSION) {
    throw new Error(`[envelope-crypto] Unsupported blob version 0x${version.toString(16)}.`);
  }

  const keyVersion = buf.readUInt32BE(1);
  const iv = buf.subarray(5, 5 + IV_BYTES);
  const tag = buf.subarray(5 + IV_BYTES, 5 + IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(5 + IV_BYTES + TAG_BYTES);

  const cached = dekCache.get(workspaceId);
  const dek =
    cached && cached.keyVersion === keyVersion
      ? (touchCache(cached), cached.dek)
      : await getDekByVersion(workspaceId, keyVersion);

  const decipher = createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ─── User-scoped helpers (no workspace DEK) ────────────────────────────

/**
 * Encrypt a short, user-scoped secret (e.g. a TOTP shared secret) directly
 * with the master KEK — no per-workspace DEK layer. The blob format is
 * a deliberately simpler variant of the workspace blob:
 *
 *   [0]      HEADER_VERSION_KEK (0x10)
 *   [1..12]  iv (12 bytes)
 *   [13..28] auth tag (16 bytes)
 *   [29..]   ciphertext
 *
 * This is appropriate for items that are not workspace-owned (per-user
 * MFA factors, account-recovery state). Rotating these requires re-encryp
 * during a KEK rotation flow, just like workspace DEK wrap rotation.
 */
const HEADER_VERSION_KEK = 0x10;

export function encryptWithKek(plaintext: string | Buffer): string {
  const kek = loadKek();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  const data = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();

  const header = Buffer.from([HEADER_VERSION_KEK]);
  return Buffer.concat([header, iv, tag, ciphertext]).toString("base64");
}

export function decryptWithKek(blob: string): Buffer {
  const buf = Buffer.from(blob, "base64");
  if (buf.length < 1 + IV_BYTES + TAG_BYTES) {
    throw new Error("[envelope-crypto] KEK ciphertext blob too short.");
  }
  const version = buf[0]!;
  if (version !== HEADER_VERSION_KEK) {
    throw new Error(`[envelope-crypto] Unsupported KEK blob version 0x${version.toString(16)}.`);
  }
  const iv = buf.subarray(1, 1 + IV_BYTES);
  const tag = buf.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(1 + IV_BYTES + TAG_BYTES);

  const kek = loadKek();
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ─── Test-only hook ────────────────────────────────────────────────────

/**
 * Reset the in-memory KEK cache. Test-only helper so a test can swap
 * process.env.DOABLE_KEK between cases.
 */
export function __resetKekCacheForTests(): void {
  cachedKek = null;
}
