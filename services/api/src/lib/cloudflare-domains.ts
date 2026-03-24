/**
 * Cloudflare Zones + DNS API client for custom domains.
 * Uses FREE Cloudflare plan — no paid features needed.
 *
 * Flow: create zone → user changes NS → zone activates → create CNAME to tunnel → SSL auto-provisions
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN   — API token with Zone:Edit, DNS:Edit permissions
 *   CLOUDFLARE_ACCOUNT_ID  — Account ID (found in Cloudflare dashboard)
 *   CLOUDFLARE_TUNNEL_ID   — Tunnel UUID for CNAME targets
 */

const CF_API = "https://api.cloudflare.com/client/v4";

function getConfig() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const tunnelId = process.env.CLOUDFLARE_TUNNEL_ID;
  if (!apiToken || !accountId || !tunnelId) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_TUNNEL_ID are required for custom domains"
    );
  }
  return { apiToken, accountId, tunnelId };
}

function headers() {
  return {
    Authorization: `Bearer ${getConfig().apiToken}`,
    "Content-Type": "application/json",
  };
}

interface CfResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

// ── Zone Management ──────────────────────────────────────

export interface CfZone {
  id: string;
  name: string;
  status: "initializing" | "pending" | "active" | "moved" | "deleted";
  name_servers: string[];
  original_name_servers?: string[];
}

/** Add a domain as a zone on our Cloudflare account (free) */
export async function createZone(domain: string): Promise<CfZone> {
  const { accountId } = getConfig();
  const res = await fetch(`${CF_API}/zones`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: domain,
      account: { id: accountId },
      type: "full",
      jump_start: true,
    }),
  });

  const data = (await res.json()) as CfResponse<CfZone>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare createZone failed: ${msg}`);
  }
  return data.result;
}

/** Check zone status (pending → active once user changes nameservers) */
export async function getZone(zoneId: string): Promise<CfZone> {
  const res = await fetch(`${CF_API}/zones/${zoneId}`, {
    method: "GET",
    headers: headers(),
  });

  const data = (await res.json()) as CfResponse<CfZone>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare getZone failed: ${msg}`);
  }
  return data.result;
}

/** Check if a zone already exists on our account */
export async function findZone(domain: string): Promise<CfZone | null> {
  const res = await fetch(`${CF_API}/zones?name=${encodeURIComponent(domain)}`, {
    method: "GET",
    headers: headers(),
  });

  const data = (await res.json()) as CfResponse<CfZone[]>;
  if (!data.success) return null;
  return (data.result as CfZone[])[0] ?? null;
}

/** Delete a zone from our account */
export async function deleteZone(zoneId: string): Promise<void> {
  const res = await fetch(`${CF_API}/zones/${zoneId}`, {
    method: "DELETE",
    headers: headers(),
  });

  const data = (await res.json()) as CfResponse<{ id: string }>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare deleteZone failed: ${msg}`);
  }
}

// ── DNS Record Management ────────────────────────────────

export interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

/** Create CNAME record pointing domain to our tunnel */
export async function createTunnelCname(zoneId: string, domain: string): Promise<CfDnsRecord> {
  const { tunnelId } = getConfig();
  const tunnelHostname = `${tunnelId}.cfargotunnel.com`;

  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "CNAME",
      name: domain,
      content: tunnelHostname,
      proxied: true,
      comment: "Doable custom domain → tunnel",
    }),
  });

  const data = (await res.json()) as CfResponse<CfDnsRecord>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare createTunnelCname failed: ${msg}`);
  }
  return data.result;
}

/** Create www CNAME redirecting to the apex domain */
export async function createWwwCname(zoneId: string, domain: string): Promise<CfDnsRecord> {
  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      type: "CNAME",
      name: "www",
      content: domain,
      proxied: true,
      comment: "Doable www redirect",
    }),
  });

  const data = (await res.json()) as CfResponse<CfDnsRecord>;
  if (!data.success) {
    // www might already exist — not critical
    console.warn("[cloudflare] www CNAME creation failed (non-critical):", data.errors);
  }
  return data.result;
}
