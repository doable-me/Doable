/**
 * Centralized secret configuration with boot-time validation.
 *
 * In production (NODE_ENV=production), missing secrets crash the process
 * immediately — never allow the app to run on fallback dev keys.
 *
 * In development, random ephemeral secrets are generated (sessions won't
 * survive restarts — set real values in .env for a stable dev experience).
 */

import { randomBytes } from "node:crypto";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function requireSecret(name: string): string {
  const value = process.env[name];
  if (value) return value;

  if (IS_PRODUCTION) {
    console.error(`[FATAL] ${name} is not set. Set a strong secret before starting in production.`);
    process.exit(1);
  }

  const ephemeral = randomBytes(32).toString("hex");
  console.warn(`[SECURITY] ${name} is not set — using a random ephemeral value. Set it in .env for stable sessions.`);
  return ephemeral;
}

/** JWT signing key (HS256). Must be a strong random string in production. */
export const JWT_SECRET = requireSecret("JWT_SECRET");

/** AES key for pgp_sym_encrypt. Must match across API and migration runs. */
export const ENCRYPTION_KEY = requireSecret("ENCRYPTION_KEY");

/** Shared secret for API ↔ WS internal communication. */
export const INTERNAL_SECRET = requireSecret("INTERNAL_SECRET");

/**
 * HS256 signing key for short-lived project JWTs (connector-proxy, preview).
 * Falls back to JWT_SECRET so existing deployments keep working — both are
 * validated in prod by `requireSecret`, so the chain never resolves to a
 * hardcoded literal.
 */
export const PROJECT_JWT_SECRET =
  process.env.PROJECT_JWT_SECRET ?? JWT_SECRET;

/** JWT issuer claim. */
export const JWT_ISSUER = process.env.JWT_ISSUER ?? "doable";
