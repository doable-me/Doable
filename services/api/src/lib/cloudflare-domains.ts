/**
 * Cloudflare Custom Hostnames API client.
 * Used for Cloudflare for SaaS — allows users to bring their own domains.
 *
 * Required env vars:
 *   CLOUDFLARE_API_TOKEN  — API token with "SSL and Certificates" edit permission
 *   CLOUDFLARE_ZONE_ID    — Zone ID for doable.me
 *
 * Docs: https://developers.cloudflare.com/api/resources/custom_hostnames/
 */

const CF_API = "https://api.cloudflare.com/client/v4";

function getConfig() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!apiToken || !zoneId) {
    throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required for custom domains");
  }
  return { apiToken, zoneId };
}

function headers() {
  const { apiToken } = getConfig();
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
}

export interface CfCustomHostname {
  id: string;
  hostname: string;
  status: "pending" | "active" | "moved" | "deleted";
  ssl: {
    status: string; // "initializing" | "pending_validation" | "pending_issuance" | "pending_deployment" | "active"
    method: string;
    type: string;
    validation_records?: Array<{
      txt_name: string;
      txt_value: string;
    }>;
    validation_errors?: Array<{ message: string }>;
  };
  ownership_verification?: {
    type: string;
    name: string;
    value: string;
  };
  verification_errors?: Array<{ message: string }>;
  created_at: string;
}

interface CfResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

/** Create a Custom Hostname in Cloudflare */
export async function createCustomHostname(domain: string): Promise<CfCustomHostname> {
  const { zoneId } = getConfig();
  const res = await fetch(`${CF_API}/zones/${zoneId}/custom_hostnames`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      hostname: domain,
      ssl: {
        method: "txt",      // TXT record validation for SSL
        type: "dv",          // Domain Validation
        settings: {
          min_tls_version: "1.2",
        },
      },
    }),
  });

  const data = (await res.json()) as CfResponse<CfCustomHostname>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare createCustomHostname failed: ${msg}`);
  }
  return data.result;
}

/** Get a Custom Hostname by its Cloudflare ID */
export async function getCustomHostname(hostnameId: string): Promise<CfCustomHostname> {
  const { zoneId } = getConfig();
  const res = await fetch(`${CF_API}/zones/${zoneId}/custom_hostnames/${hostnameId}`, {
    method: "GET",
    headers: headers(),
  });

  const data = (await res.json()) as CfResponse<CfCustomHostname>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare getCustomHostname failed: ${msg}`);
  }
  return data.result;
}

/** Delete a Custom Hostname */
export async function deleteCustomHostname(hostnameId: string): Promise<void> {
  const { zoneId } = getConfig();
  const res = await fetch(`${CF_API}/zones/${zoneId}/custom_hostnames/${hostnameId}`, {
    method: "DELETE",
    headers: headers(),
  });

  const data = (await res.json()) as CfResponse<{ id: string }>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare deleteCustomHostname failed: ${msg}`);
  }
}

/** Trigger re-validation for a pending hostname */
export async function refreshCustomHostname(hostnameId: string): Promise<CfCustomHostname> {
  const { zoneId } = getConfig();
  const res = await fetch(`${CF_API}/zones/${zoneId}/custom_hostnames/${hostnameId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      ssl: { method: "txt", type: "dv" },
    }),
  });

  const data = (await res.json()) as CfResponse<CfCustomHostname>;
  if (!data.success) {
    const msg = data.errors.map((e) => e.message).join(", ");
    throw new Error(`Cloudflare refreshCustomHostname failed: ${msg}`);
  }
  return data.result;
}
