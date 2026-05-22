/**
 * Resolves the effective Cloudflare API token for runtime CF API calls.
 *
 * Lookup order (first non-empty wins):
 *   1. platform_settings.cf_api_token — set by the admin /admin panel when
 *      the operator pastes a broader-scoped token (DNS:Edit + Zone:Read +
 *      SSL/Certificates:Read). Unlocks ACM auto-detection.
 *   2. process.env.CF_API_TOKEN — the cfut_* token extracted from
 *      /root/.cloudflared/cert.pem during `cloudflared tunnel login`.
 *      Carries DNS:Edit + tunnel scopes only — sufficient for all DNS
 *      operations (auto-configure, wildcard create/delete, per-publish
 *      CNAMEs) but cannot detect ACM (returns 9109 Unauthorized on
 *      /ssl/certificate_packs).
 *
 * Never throws; returns undefined when neither source is set. Callers that
 * cannot proceed without a token surface their own "creds missing" path.
 */
import { sql } from "../db/index.js";
import { platformSettingQueries, PLATFORM_SETTING_KEYS } from "@doable/db";
import { encryptWithKek, decryptWithKek } from "./envelope-crypto.js";

const platformSettings = platformSettingQueries(sql);

// ─── At-rest encryption for sensitive platform_settings values ─────────
// Sensitive keys (cf_api_token) are stored as `enc:v1:<base64>`. The base64
// payload is a HEADER_VERSION_KEK envelope from envelope-crypto.ts so DOABLE_KEK
// rotation goes through the existing path. Non-sensitive keys (dns_mode) stay
// plaintext — encrypting them adds no value and makes debugging harder.
//
// The prefix is the discriminator: when get() returns a string that does NOT
// start with `enc:v1:`, we assume it's legacy plaintext and return it as-is.
// This makes the rollout backward-compatible: any pre-existing rows
// (including on dodev) keep working without a migration.
const ENC_PREFIX = "enc:v1:";

export function encryptPlatformValue(plaintext: string): string {
  return ENC_PREFIX + encryptWithKek(plaintext);
}

export function decryptPlatformValue(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  return decryptWithKek(stored.slice(ENC_PREFIX.length)).toString("utf8");
}

export async function getEffectiveCfApiToken(): Promise<string | undefined> {
  try {
    const stored = await platformSettings.get(PLATFORM_SETTING_KEYS.CF_API_TOKEN);
    if (stored && stored.length > 0) {
      try {
        const value = decryptPlatformValue(stored);
        if (value.length > 0) return value;
      } catch (err) {
        // Decrypt failure means the DB row was encrypted under a different
        // KEK (rotation, restore-from-backup with stale .env) OR corrupted.
        // Don't throw — log and fall through to env so the cert.pem token
        // still works.
        console.warn(
          "[cf-token] Failed to decrypt platform_settings.cf_api_token; falling back to env.",
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch {
    // platform_settings table missing (pre-migration 081) — fall through.
  }
  const envValue = process.env.CF_API_TOKEN;
  return envValue && envValue.length > 0 ? envValue : undefined;
}

/**
 * Reports which source the resolver will use, without leaking the value.
 * Used by GET /admin/dns-mode/cf-token to render the panel state.
 */
export async function getCfApiTokenSource(): Promise<{
  source: "platform_settings" | "env" | "none";
  tokenSuffix: string;
  /** True when platform_settings had a non-empty value that failed to
   * decrypt (e.g. KEK mismatch after backup restore). The panel uses this
   * to surface a "re-paste" prompt instead of silently treating the
   * resolver's env-fallback as the operator's intent. */
  decryptFailed: boolean;
}> {
  let decryptFailed = false;
  try {
    const stored = await platformSettings.get(PLATFORM_SETTING_KEYS.CF_API_TOKEN);
    if (stored && stored.length > 0) {
      try {
        const value = decryptPlatformValue(stored);
        if (value.length > 0) {
          return { source: "platform_settings", tokenSuffix: value.slice(-4), decryptFailed: false };
        }
      } catch {
        // Stored ciphertext exists but won't decrypt under the current
        // KEK. Flag it so the panel can prompt for re-paste; the resolver
        // continues to env so DNS ops keep working.
        decryptFailed = true;
      }
    }
  } catch {
    // platform_settings table missing — leave decryptFailed=false.
  }
  const envValue = process.env.CF_API_TOKEN;
  if (envValue && envValue.length > 0) {
    return { source: "env", tokenSuffix: envValue.slice(-4), decryptFailed };
  }
  return { source: "none", tokenSuffix: "", decryptFailed };
}
