/**
 * DNS verification for custom domains.
 *
 * Users add a proxied CNAME on their own Cloudflare account
 * pointing to our tunnel hostname. We verify via DNS lookup.
 *
 * No Cloudflare API needed — the user manages their own DNS.
 */
import { resolve } from "node:dns/promises";

/**
 * Get the tunnel CNAME target that users should point their domain to.
 */
export function getTunnelCnameTarget(): string {
  const tunnelId = process.env.CLOUDFLARE_TUNNEL_ID;
  if (!tunnelId) {
    throw new Error("CLOUDFLARE_TUNNEL_ID is required for custom domains");
  }
  return `${tunnelId}.cfargotunnel.com`;
}

/**
 * Verify that a domain has a CNAME (or A record) that resolves.
 *
 * When a user adds a proxied CNAME on Cloudflare, the CNAME is hidden
 * behind Cloudflare's proxy IPs (the domain resolves to Cloudflare edge IPs).
 * So we can't check the CNAME target directly — we just verify the domain
 * resolves to SOMETHING (meaning DNS is configured).
 *
 * Returns { verified: true, addresses } if domain resolves, { verified: false, error } otherwise.
 */
export async function verifyDomainDns(domain: string): Promise<{
  verified: boolean;
  addresses?: string[];
  error?: string;
}> {
  try {
    // Try A record resolution first (most common for proxied Cloudflare domains)
    const addresses = await resolve(domain, "A");
    if (addresses.length > 0) {
      return { verified: true, addresses };
    }
    return { verified: false, error: "Domain does not resolve to any IP addresses" };
  } catch (err) {
    // Try CNAME as fallback (non-proxied)
    try {
      const cnames = await resolve(domain, "CNAME");
      if (cnames.length > 0) {
        return { verified: true, addresses: cnames };
      }
    } catch {
      // ignore
    }
    return {
      verified: false,
      error: `DNS lookup failed for ${domain}. Make sure you've added the CNAME record in your Cloudflare DNS.`,
    };
  }
}
