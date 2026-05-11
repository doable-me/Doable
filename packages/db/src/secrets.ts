/**
 * Encryption-key resolution for the `@doable/db` package.
 *
 * Mirrors the production-crash behaviour of services/api/src/lib/secrets.ts:
 *   - In production (NODE_ENV=production), missing ENCRYPTION_KEY exits the
 *     process so we never silently write credentials under a hardcoded
 *     fallback key.
 *   - In dev, we keep the stable fallback string so pgp_sym_encrypt/decrypt
 *     stays deterministic across restarts (an ephemeral random key would
 *     orphan every credential written in the previous session).
 *
 * Centralising this here avoids each query file shipping its own
 * `process.env.ENCRYPTION_KEY ?? "doable-dev-encryption-key"` line — the
 * pattern caught by the security audit as "silent weak encryption if env
 * var missing".
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DEV_FALLBACK = "doable-dev-encryption-key";

let warned = false;

export function getEncryptionKey(): string {
  const value = process.env.ENCRYPTION_KEY;
  if (value) return value;

  if (IS_PRODUCTION) {
    console.error(
      "[FATAL] ENCRYPTION_KEY is not set. Set a strong secret before starting in production.",
    );
    process.exit(1);
  }

  if (!warned) {
    console.warn(
      "[SECURITY] ENCRYPTION_KEY is not set — using dev fallback. Set it in .env for stable credentials.",
    );
    warned = true;
  }
  return DEV_FALLBACK;
}
