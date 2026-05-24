/**
 * Centralized secret configuration with boot-time validation.
 *
 * Resolution is delegated to the shared `resolveSecret` (see
 * @doable/shared/security/secret-resolver) so the api and ws processes use ONE
 * implementation with identical, restart-stable behavior:
 *   - env var set            → use it (production / managed deployments).
 *   - production + missing    → fatal; never boot on a generated key.
 *   - dev/self-host + missing → a STABLE secret persisted to disk, shared with
 *                               ws. (The old code returned a fresh random value
 *                               every boot, which rotated JWT_SECRET on each
 *                               restart and logged users out within seconds.)
 */

import { resolveSecret } from "@doable/shared/security/secret-resolver.js";

/** JWT signing key (HS256). Must be a strong random string in production. */
export const JWT_SECRET = resolveSecret("JWT_SECRET", "api");

/** AES key for pgp_sym_encrypt. Must match across API and migration runs. */
export const ENCRYPTION_KEY = resolveSecret("ENCRYPTION_KEY", "api");

/** Shared secret for API ↔ WS internal communication. */
export const INTERNAL_SECRET = resolveSecret("INTERNAL_SECRET", "api");

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
