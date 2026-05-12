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
} as const;

export type DnsMode = "per_publish" | "wildcard";

export function parseDnsMode(value: string | null | undefined): DnsMode {
  return value === "wildcard" ? "wildcard" : "per_publish";
}
