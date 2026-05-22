/**
 * Domain service — orchestrates custom domain lifecycle.
 *
 * Flow (user-managed Cloudflare DNS):
 * 1. User adds domain → save to DB (status: pending)
 * 2. We show user: "Add CNAME pointing to {tunnel}.cfargotunnel.com in your Cloudflare DNS"
 * 3. User adds proxied CNAME on their own Cloudflare account
 * 4. User clicks Verify → we do DNS lookup → if resolves → active
 * 5. When active → update Caddy config → domain is live
 * 6. Remove → delete from DB → refresh Caddy
 *
 * No Cloudflare API calls needed. Users manage their own DNS.
 */
import { sql } from "../db/index.js";
import { customDomainQueries } from "@doable/db/queries/custom-domains";
import { projectQueries } from "@doable/db/queries/projects";
import { getTunnelCnameTarget, verifyDomainDns } from "../lib/cloudflare-domains.js";
import { applyCaddyConfig } from "./caddy-domains.js";
import type { CustomDomainRow } from "@doable/db/types";

const domains = customDomainQueries(sql);
const projects = projectQueries(sql);

/** Validate domain format */
function isValidDomain(domain: string): boolean {
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain) &&
    domain.length <= 253 &&
    !domain.includes("..") &&
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

  if (!isValidDomain(domain)) {
    throw new DomainError("Invalid domain format. Use a valid domain like app.example.com", 400);
  }

  const project = await projects.findById(projectId);
  if (!project) {
    throw new DomainError("Project not found", 404);
  }

  if (!project.subdomain) {
    throw new DomainError("Project must be published at least once before adding a custom domain", 400);
  }

  const existing = await domains.findByDomain(domain);
  if (existing) {
    throw new DomainError("This domain is already in use by another project", 409);
  }

  const cnameTarget = getTunnelCnameTarget();

  const row = await domains.create({
    projectId,
    domain,
    cnameTarget,
    createdBy: userId,
  });

  return row;
}

/** Remove a custom domain */
export async function removeDomain(domainId: string): Promise<void> {
  const domainRow = await domains.findById(domainId);
  if (!domainRow) {
    throw new DomainError("Domain not found", 404);
  }

  await domains.updateStatus(domainId, { status: "removing" });
  await domains.deleteById(domainId);
  await refreshCaddyConfig();
}

/** Check verification status for a specific domain via DNS lookup */
export async function checkDomainStatus(domainId: string): Promise<CustomDomainRow> {
  const domainRow = await domains.findById(domainId);
  if (!domainRow) {
    throw new DomainError("Domain not found", 404);
  }

  if (domainRow.status === "active") {
    return domainRow;
  }

  const result = await verifyDomainDns(domainRow.domain);

  if (result.verified) {
    await domains.updateStatus(domainId, {
      status: "active",
      sslStatus: "active",
      verificationErrors: null,
      lastCheckedAt: new Date(),
    });

    // Update Caddy to serve this domain
    await refreshCaddyConfig();

    return (await domains.findById(domainId))!;
  }

  // Not yet verified
  await domains.updateStatus(domainId, {
    verificationErrors: result.error ?? null,
    lastCheckedAt: new Date(),
  });

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
