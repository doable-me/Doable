/**
 * Centralized secret configuration with boot-time validation.
 *
 * In production (NODE_ENV=production), missing secrets crash the process
 * immediately — never allow the app to run on fallback dev keys.
 *
 * In development, fallbacks are allowed but warnings are logged.
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function requireSecret(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value !== fallback) return value;

  if (IS_PRODUCTION) {
    console.error(`[FATAL] ${name} is not set or is using the insecure default. Set a strong secret before starting in production.`);
    process.exit(1);
  }

  console.warn(`[SECURITY] ${name} is using the insecure dev fallback — set it in .env for production.`);
  return value ?? fallback;
}

/** JWT signing key (HS256). Must be a strong random string in production. */
export const JWT_SECRET = requireSecret("JWT_SECRET", "fallback-dev-secret-change-me");

/** AES key for pgp_sym_encrypt. Must match across API and migration runs. */
export const ENCRYPTION_KEY = requireSecret("ENCRYPTION_KEY", "doable-dev-encryption-key");

/** Shared secret for API ↔ WS internal communication. */
export const INTERNAL_SECRET = requireSecret("INTERNAL_SECRET", "internal-dev-secret");

/** JWT issuer claim. */
export const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";
