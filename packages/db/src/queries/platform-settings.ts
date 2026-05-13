import type postgres from "postgres";

/**
 * Platform-wide singleton settings (DNS mode, etc).
 *
 * The `get` calls are wrapped in try/catch so callers can run on a database
 * that hasn't yet had migration 081 applied — they simply return `null` for
 * any missing key (or missing table). Set/upsert calls deliberately do NOT
 * swallow errors, since admin write paths need to surface failures.
 */
export function platformSettingQueries(sql: postgres.Sql) {
  return {
    async get(key: string): Promise<string | null> {
      try {
        const [row] = await sql<{ value: string }[]>`
          SELECT value FROM platform_settings WHERE key = ${key}
        `;
        return row?.value ?? null;
      } catch {
        // Table missing (pre-migration 081) — treat as unset.
        return null;
      }
    },

    async set(key: string, value: string, updatedBy?: string): Promise<void> {
      await sql`
        INSERT INTO platform_settings (key, value, updated_by)
        VALUES (${key}, ${value}, ${updatedBy ?? null})
        ON CONFLICT (key) DO UPDATE
          SET value = EXCLUDED.value,
              updated_at = now(),
              updated_by = EXCLUDED.updated_by
      `;
    },
  };
}

// ─── Well-known keys ────────────────────────────────────────
// Centralized so route handlers and pipeline read/write the same string.

/**
 * Well-known keys for the platform_settings table.
 *
 * **Sensitivity convention** (security): values for keys marked SENSITIVE
 * below MUST be wrapped via `encryptPlatformValue()` from
 * services/api/src/lib/cloudflare-token.ts before being passed to `set()`,
 * and unwrapped via `decryptPlatformValue()` after `get()`. Non-sensitive
 * keys (current: dns_mode) stay plaintext so SQL inspection during
 * debugging shows the actual value.
 *
 *   - DNS_MODE              — plaintext, low sensitivity (publish routing flag)
 *   - DNS_WILDCARD_HOSTNAME — plaintext, low sensitivity (hostname only)
 *   - CF_API_TOKEN          — SENSITIVE, must be encrypted at rest
 */
export const PLATFORM_SETTING_KEYS = {
  /**
   * DNS provisioning mode for published sites.
   *
   *   "per_publish" (default) — call Cloudflare API on each publish/unpublish
   *                              to create/delete a per-subdomain CNAME.
   *   "wildcard"              — trust an admin-managed wildcard CNAME
   *                              (e.g. *.doable.me) already in Cloudflare;
   *                              skip the per-publish CF API calls entirely.
   *
   * Wildcard mode requires the wildcard cert to actually cover the published
   * hostname — for multi-level wildcards (e.g. *.staging.doable.me) this
   * means Cloudflare ACM is enabled on the zone.
   */
  DNS_MODE: "dns_mode",
  /**
   * The actual wildcard hostname the admin configured via the /admin DNS
   * panel (e.g. "*.doable.me" or "*.dev.doable.me"). Persisted after a
   * successful auto-wildcard CF API write so the UI can reflect the operator's
   * real intent on subsequent loads — distinct from `*.${DOABLE_DOMAIN}`,
   * which is only the server's *recommendation*. Unset (or empty) means
   * the convention-based recommendedWildcard is still the source of truth.
   */
  DNS_WILDCARD_HOSTNAME: "dns_wildcard_hostname",
  /**
   * Optional broader-scope Cloudflare API token, overriding the cfut_* one
   * extracted from /root/.cloudflared/cert.pem. The cert.pem token has
   * DNS:Edit + tunnel scopes only, which is enough for everything EXCEPT
   * ACM detection (which requires SSL/Certificates:Read). When the operator
   * pastes a broader token via /admin, we store it here and the runtime
   * resolver prefers it over process.env.CF_API_TOKEN. Leaving this unset
   * is the default — every other DNS feature works fine without it.
   */
  CF_API_TOKEN: "cf_api_token",
} as const;

export type DnsMode = "per_publish" | "wildcard";

export function parseDnsMode(value: string | null | undefined): DnsMode {
  return value === "wildcard" ? "wildcard" : "per_publish";
}
