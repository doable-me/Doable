/**
 * Domain service — orchestrates custom domain lifecycle.
 *
 * Flow:
 * 1. User adds domain -> createCustomHostname on Cloudflare -> save to DB (status: pending)
 * 2. User adds CNAME + TXT records at their DNS provider
 * 3. Poll Cloudflare API for status -> update DB (verifying -> ssl_pending -> active)
 * 4. When active -> update Caddy config -> domain is live
 * 5. Remove -> delete from Cloudflare -> remove Caddy block -> delete from DB
 */
import { sql } from "../db/index.js";
import { customDomainQueries } from "@doable/db/queries/custom-domains";
import { projectQueries } from "@doable/db/queries/projects";
import * as cf from "../lib/cloudflare-domains.js";
import { applyCaddyConfig } from "./caddy-domains.js";
import type { CustomDomainRow, CustomDomainStatus } from "@doable/db/types";

const domains = customDomainQueries(sql);
const projects = projectQueries(sql);

const CNAME_TARGET = process.env.CUSTOM_DOMAIN_CNAME_TARGET ?? "custom.doable.me";

/** Validate domain format */
function isValidDomain(domain: string): boolean {
  // Must be a valid hostname (no protocol, no path, no port)
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) &&
    domain.length <= 253 &&
    !domain.includes("..") &&
    !domain.endsWith("doable.me") &&
    !domain.endsWith("doable.app");
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

  // Create on Cloudflare
  let cfHostname: cf.CfCustomHostname;
  try {
    cfHostname = await cf.createCustomHostname(domain);
  } catch (err) {
    console.error("[domain-service] Cloudflare API error:", err);
    throw new DomainError(
      "Failed to register domain with Cloudflare. Please try again.",
      502
    );
  }

  // Extract verification records
  const txtRecord = cfHostname.ssl?.validation_records?.[0];
  const ownershipVerification = cfHostname.ownership_verification;

  // Save to database
  const row = await domains.create({
    projectId,
    domain,
    cnameTarget: CNAME_TARGET,
    createdBy: userId,
  });

  // Update with Cloudflare metadata
  const updated = await domains.updateStatus(row.id, {
    cloudflareHostnameId: cfHostname.id,
    sslStatus: cfHostname.ssl?.status ?? null,
    verificationTxtName: ownershipVerification?.name ?? txtRecord?.txt_name ?? null,
    verificationTxtValue: ownershipVerification?.value ?? txtRecord?.txt_value ?? null,
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

  // Delete from Cloudflare
  if (domainRow.cloudflare_hostname_id) {
    try {
      await cf.deleteCustomHostname(domainRow.cloudflare_hostname_id);
    } catch (err) {
      console.warn("[domain-service] Cloudflare delete failed (continuing):", err);
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

  // Poll Cloudflare
  let cfHostname: cf.CfCustomHostname;
  try {
    cfHostname = await cf.getCustomHostname(domainRow.cloudflare_hostname_id);
  } catch (err) {
    console.error("[domain-service] Cloudflare poll error:", err);
    await domains.updateStatus(domainId, {
      verificationErrors: err instanceof Error ? err.message : "Cloudflare API error",
      lastCheckedAt: new Date(),
    });
    return (await domains.findById(domainId))!;
  }

  // Map Cloudflare status to our status
  let newStatus: CustomDomainStatus = domainRow.status;
  const sslStatus = cfHostname.ssl?.status ?? "unknown";

  if (cfHostname.status === "active" && sslStatus === "active") {
    newStatus = "active";
  } else if (cfHostname.status === "active" && sslStatus !== "active") {
    newStatus = "ssl_pending";
  } else if (cfHostname.status === "pending") {
    newStatus = "verifying";
  }

  // Collect errors
  const errors = [
    ...(cfHostname.verification_errors?.map((e) => e.message) ?? []),
    ...(cfHostname.ssl?.validation_errors?.map((e) => e.message) ?? []),
  ];

  if (errors.length > 0 && cfHostname.status !== "active") {
    newStatus = "failed";
  }

  // Update verification records if Cloudflare returned new ones
  const txtRecord = cfHostname.ssl?.validation_records?.[0];
  const ownershipVerification = cfHostname.ownership_verification;

  await domains.updateStatus(domainId, {
    status: newStatus,
    sslStatus,
    verificationTxtName: ownershipVerification?.name ?? txtRecord?.txt_name ?? domainRow.verification_txt_name,
    verificationTxtValue: ownershipVerification?.value ?? txtRecord?.txt_value ?? domainRow.verification_txt_value,
    verificationErrors: errors.length > 0 ? errors.join("; ") : null,
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
