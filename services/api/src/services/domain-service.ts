/**
 * Domain service — orchestrates custom domain lifecycle.
 *
 * Flow (Cloudflare Zones + DNS — free plan):
 * 1. User adds domain → create zone on Cloudflare → save to DB (status: pending)
 * 2. User changes nameservers at their registrar (one-time)
 * 3. Poll Cloudflare API → zone status goes pending → active
 * 4. Once active → create CNAME to tunnel + www CNAME → SSL auto-provisions
 * 5. Update Caddy config → domain is live
 * 6. Remove → delete zone from Cloudflare → remove Caddy block → delete from DB
 */
import { sql } from "../db/index.js";
import { customDomainQueries } from "@doable/db/queries/custom-domains";
import { projectQueries } from "@doable/db/queries/projects";
import {
  createZone,
  getZone,
  deleteZone,
  findZone,
  createTunnelCname,
  createWwwCname,
} from "../lib/cloudflare-domains.js";
import { applyCaddyConfig } from "./caddy-domains.js";
import type { CustomDomainRow, CustomDomainStatus } from "@doable/db/types";

const domains = customDomainQueries(sql);
const projects = projectQueries(sql);

/** Validate domain format */
function isValidDomain(domain: string): boolean {
  // Must be a valid hostname (no protocol, no path, no port)
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) &&
    domain.length <= 253 &&
    !domain.includes("..") &&
    !domain.endsWith("doable.me") &&
    !domain.endsWith("doable.me");
}

/** Add a custom domain to a project */
export async function addDomain(opts: {
  projectId: string;
  domain: string;
  userId: string;
}): Promise<CustomDomainRow> {
  const { projectId, domain: rawDomain, userId } = opts;
  const domain = rawDomain.toLowerCase().trim();

  // Validate format
  if (!isValidDomain(domain)) {
    throw new DomainError("Invalid domain format. Use a valid domain like app.example.com", 400);
  }

  // Check project exists
  const project = await projects.findById(projectId);
  if (!project) {
    throw new DomainError("Project not found", 404);
  }

  // Check project has a subdomain (must be published at least once)
  if (!project.subdomain) {
    throw new DomainError("Project must be published at least once before adding a custom domain", 400);
  }

  // Check domain not already taken
  const existing = await domains.findByDomain(domain);
  if (existing) {
    throw new DomainError("This domain is already in use by another project", 409);
  }

  // Check if zone already exists on our account (e.g. from a previous attempt)
  let zone;
  try {
    const existingZone = await findZone(domain);
    if (existingZone) {
      zone = existingZone;
    } else {
      zone = await createZone(domain);
    }
  } catch (err) {
    console.error("[domain-service] Cloudflare API error:", err);
    throw new DomainError(
      "Failed to register domain with Cloudflare. Please try again.",
      502
    );
  }

  const tunnelId = process.env.CLOUDFLARE_TUNNEL_ID!;
  const tunnelCname = `${tunnelId}.cfargotunnel.com`;

  // Save to database
  const row = await domains.create({
    projectId,
    domain,
    cnameTarget: tunnelCname,
    createdBy: userId,
  });

  // Update with Cloudflare metadata:
  //   cloudflareHostnameId → zone ID (repurposed column)
  //   verificationTxtName  → nameserver 1 (repurposed column)
  //   verificationTxtValue → nameserver 2 (repurposed column)
  const updated = await domains.updateStatus(row.id, {
    cloudflareHostnameId: zone.id,
    sslStatus: null,
    verificationTxtName: zone.name_servers[0] ?? null,
    verificationTxtValue: zone.name_servers[1] ?? null,
    lastCheckedAt: new Date(),
  });

  return updated ?? row;
}

/** Remove a custom domain */
export async function removeDomain(domainId: string): Promise<void> {
  const domainRow = await domains.findById(domainId);
  if (!domainRow) {
    throw new DomainError("Domain not found", 404);
  }

  // Mark as removing
  await domains.updateStatus(domainId, { status: "removing" });

  // Delete zone from Cloudflare
  if (domainRow.cloudflare_hostname_id) {
    try {
      await deleteZone(domainRow.cloudflare_hostname_id);
    } catch (err) {
      console.warn("[domain-service] Cloudflare zone delete failed (continuing):", err);
    }
  }

  // Delete from DB
  await domains.deleteById(domainId);

  // Refresh Caddy config (remove the domain block)
  await refreshCaddyConfig();
}

/** Check verification status for a specific domain */
export async function checkDomainStatus(domainId: string): Promise<CustomDomainRow> {
  const domainRow = await domains.findById(domainId);
  if (!domainRow) {
    throw new DomainError("Domain not found", 404);
  }

  if (!domainRow.cloudflare_hostname_id) {
    return domainRow;
  }

  // Don't re-check if already active
  if (domainRow.status === "active") {
    return domainRow;
  }

  // Poll Cloudflare zone status
  let zone;
  try {
    zone = await getZone(domainRow.cloudflare_hostname_id);
  } catch (err) {
    console.error("[domain-service] Cloudflare poll error:", err);
    await domains.updateStatus(domainId, {
      verificationErrors: err instanceof Error ? err.message : "Cloudflare API error",
      lastCheckedAt: new Date(),
    });
    return (await domains.findById(domainId))!;
  }

  // Map zone status to our domain status
  let newStatus: CustomDomainStatus = domainRow.status;

  if (zone.status === "active" && domainRow.status === "pending") {
    // Zone is active — nameservers propagated! Create CNAME records to our tunnel.
    try {
      await createTunnelCname(zone.id, domainRow.domain);
      await createWwwCname(zone.id, domainRow.domain);
    } catch (err) {
      console.error("[domain-service] Failed to create CNAME records:", err);
      await domains.updateStatus(domainId, {
        verificationErrors: err instanceof Error ? err.message : "Failed to create DNS records",
        lastCheckedAt: new Date(),
      });
      return (await domains.findById(domainId))!;
    }

    // CNAME created, Cloudflare Universal SSL will auto-provision
    newStatus = "ssl_pending";
  }

  if (zone.status === "active" && domainRow.status === "ssl_pending") {
    // SSL should be ready within minutes of zone activation
    newStatus = "active";
  }

  if (zone.status === "pending") {
    // Still waiting for user to change nameservers
    newStatus = "pending";
  }

  if (zone.status === "moved" || zone.status === "deleted") {
    newStatus = "failed";
  }

  await domains.updateStatus(domainId, {
    status: newStatus,
    sslStatus: zone.status === "active" ? "active" : "pending",
    verificationErrors: null,
    lastCheckedAt: new Date(),
  });

  // If newly active, update Caddy (domainRow.status is guaranteed non-active
  // due to the early return above, so we only check newStatus)
  if (newStatus === "active") {
    await refreshCaddyConfig();
  }

  return (await domains.findById(domainId))!;
}

/** Background job: poll all pending domains */
export async function pollPendingDomains(): Promise<void> {
  const pending = await domains.listPending();
  if (pending.length === 0) return;

  console.log(`[domain-service] Polling ${pending.length} pending domain(s)`);

  for (const row of pending) {
    try {
      await checkDomainStatus(row.id);
    } catch (err) {
      console.warn(`[domain-service] Failed to poll ${row.domain}:`, err);
    }
  }
}

/** Rebuild Caddy config from all active custom domains */
async function refreshCaddyConfig(): Promise<void> {
  // Get all active custom domains with their project subdomains
  const allActive = await sql<Array<{ domain: string; subdomain: string }>>`
    SELECT cd.domain, p.subdomain
    FROM custom_domains cd
    JOIN projects p ON p.id = cd.project_id
    WHERE cd.status = 'active'
      AND p.subdomain IS NOT NULL
    ORDER BY cd.created_at
  `;

  await applyCaddyConfig(
    allActive.map((r) => ({ domain: r.domain, subdomain: r.subdomain }))
  );
}

/** Custom error class for domain operations */
export class DomainError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "DomainError";
  }
}
