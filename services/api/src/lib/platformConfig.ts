/**
 * Platform config helper — typed access to the platform_config key-value table.
 *
 * Plain values are stored as JSONB. Encrypted values are AES-256-GCM blobs
 * stored as a JSONB string (the base64 ciphertext), encrypted/decrypted using
 * the same KEK-based helpers as the rest of the codebase (envelope-crypto).
 *
 * 30-second in-process read cache per key. Writes invalidate the cache entry.
 * NEVER return raw encrypted bytes to callers — use getEncryptedConfig() which
 * returns the decrypted plaintext, or mask the value before sending to the
 * browser.
 */

import { sql } from "../db/index.js";
import { encryptWithKek, decryptWithKek } from "./envelope-crypto.js";

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): { hit: true; value: unknown } | { hit: false } {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return { hit: true, value: entry.value };
  }
  cache.delete(key);
  return { hit: false };
}

function cacheSet(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheInvalidate(key: string): void {
  cache.delete(key);
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function dbGet(key: string): Promise<unknown> {
  const [row] = await sql<{ value: unknown }[]>`
    SELECT value FROM platform_config WHERE key = ${key}
  `;
  return row?.value ?? null;
}

async function dbSet(
  key: string,
  value: unknown,
  updatedBy?: string | null,
): Promise<void> {
  await sql`
    INSERT INTO platform_config (key, value, updated_by, updated_at)
    VALUES (${key}, ${sql.json(value as never)}, ${updatedBy ?? null}::uuid, now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
  `;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Read a plain (non-encrypted) config value.
 * Returns null if the key does not exist.
 * Cached for 30 seconds.
 */
export async function getConfig(key: string): Promise<unknown> {
  const cached = cacheGet(key);
  if (cached.hit) return cached.value;

  const value = await dbGet(key);
  cacheSet(key, value);
  return value;
}

/**
 * Write a plain or encrypted config value.
 * Pass `{ encrypted: true }` to store the value as an AES-256-GCM ciphertext
 * using the process KEK. Use setEncryptedConfig() as a convenience wrapper.
 */
export async function setConfig(
  key: string,
  value: unknown,
  opts: { encrypted?: boolean; updatedBy?: string | null } = {},
): Promise<void> {
  cacheInvalidate(key);

  if (opts.encrypted) {
    const plaintext = typeof value === "string" ? value : JSON.stringify(value);
    const ciphertext = encryptWithKek(plaintext);
    await dbSet(key, ciphertext, opts.updatedBy);
  } else {
    await dbSet(key, value, opts.updatedBy);
  }
}

/**
 * Read an encrypted config value and return the decrypted plaintext string.
 * Returns null if the key does not exist or its stored value is null/falsy.
 * NOTE: do NOT cache the decrypted value — only the ciphertext is cached.
 */
export async function getEncryptedConfig(key: string): Promise<string | null> {
  // Fetch raw value (may be cached ciphertext string or null)
  const raw = await getConfig(key);

  if (raw === null || raw === undefined) return null;

  // Stored value is the base64 ciphertext string (as a JSON string in JSONB)
  const ciphertext = typeof raw === "string" ? raw : String(raw);
  if (!ciphertext || ciphertext === "null") return null;

  try {
    const buf = decryptWithKek(ciphertext);
    return buf.toString("utf8");
  } catch {
    // If decryption fails, the row is corrupt — return null safely.
    return null;
  }
}

/**
 * Convenience: encrypt value and write to platform_config.
 */
export async function setEncryptedConfig(
  key: string,
  value: string,
  updatedBy?: string | null,
): Promise<void> {
  await setConfig(key, value, { encrypted: true, updatedBy });
}

/**
 * Invalidate the in-process cache for a key (e.g. after external write).
 */
export { cacheInvalidate as invalidatePlatformConfigCache };
