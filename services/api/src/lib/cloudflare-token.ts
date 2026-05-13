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

const platformSettings = platformSettingQueries(sql);

export async function getEffectiveCfApiToken(): Promise<string | undefined> {
  try {
    const override = await platformSettings.get(PLATFORM_SETTING_KEYS.CF_API_TOKEN);
    if (override && override.length > 0) return override;
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
}> {
  try {
    const override = await platformSettings.get(PLATFORM_SETTING_KEYS.CF_API_TOKEN);
    if (override && override.length > 0) {
      return { source: "platform_settings", tokenSuffix: override.slice(-4) };
    }
  } catch {
    // Same fall-through.
  }
  const envValue = process.env.CF_API_TOKEN;
  if (envValue && envValue.length > 0) {
    return { source: "env", tokenSuffix: envValue.slice(-4) };
  }
  return { source: "none", tokenSuffix: "" };
}
