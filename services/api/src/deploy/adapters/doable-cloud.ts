import { mkdir, cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DeployAdapter, DeployInput, DeployResult } from "../adapter.js";

const SITES_ROOT = process.env.SITES_ROOT ?? path.join(process.cwd(), "sites");
const DOMAIN = process.env.DOABLE_DOMAIN ?? "doable.app";

/**
 * Default deploy adapter: copies build output to a local /sites/[subdomain]/ directory
 * and generates a *.doable.me URL.
 *
 * Subdomains are short and user-friendly (e.g. "bean-brew-a7k2").
 * The subdomain is generated once and stored in the project record,
 * then reused for every subsequent publish.
 */
export class DoableCloudAdapter implements DeployAdapter {
  readonly name = "doable-cloud";

  async deploy(input: DeployInput): Promise<DeployResult> {
    const { projectId, buildOutputDir, environment } = input;

    // Subdomain must be provided by the pipeline (generated + stored in DB)
    const subdomain = (input as DeployInput & { subdomain?: string }).subdomain;
    if (!subdomain) {
      throw new Error("subdomain is required for doable-cloud adapter");
    }

    // For preview, prefix with "p-"
    const siteSubdomain =
      environment === "preview" ? `p-${subdomain}` : subdomain;

    // Validate build output exists and contains files
    if (!existsSync(buildOutputDir)) {
      throw new Error(
        `Build output directory not found: ${buildOutputDir}. ` +
        `The Vite build may have failed or output to a different location.`
      );
    }

    let buildFiles: string[];
    try {
      buildFiles = await readdir(buildOutputDir);
    } catch (err) {
      throw new Error(
        `Cannot read build output directory: ${buildOutputDir}. ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (buildFiles.length === 0) {
      throw new Error(
        `Build output directory is empty: ${buildOutputDir}. ` +
        `The Vite build likely produced no output.`
      );
    }

    const targetDir = path.join(SITES_ROOT, siteSubdomain);

    try {
      await mkdir(SITES_ROOT, { recursive: true });

      if (existsSync(targetDir)) {
        await rm(targetDir, { recursive: true, force: true });
      }

      await mkdir(targetDir, { recursive: true });
      await cp(buildOutputDir, targetDir, { recursive: true });

      const copiedFiles = await readdir(targetDir);
      if (copiedFiles.length === 0) {
        throw new Error("Copy completed but target directory is empty");
      }

      console.log(
        `[doable-cloud] Deployed ${copiedFiles.length} files for project ${projectId} ` +
        `(${environment}) to ${targetDir}`
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes("Copy completed")) {
        throw err;
      }
      throw new Error(
        `Failed to deploy to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const url = `https://${siteSubdomain}.${DOMAIN}`;

    return {
      url,
      adapter: this.name,
      metadata: {
        targetDir,
        subdomain: siteSubdomain,
        domain: DOMAIN,
        filesDeployed: buildFiles.length,
      },
    };
  }

  async teardown(projectId: string, environment: string): Promise<void> {
    console.log(
      `[doable-cloud] Teardown requested for project=${projectId} env=${environment}`
    );

    try {
      if (!existsSync(SITES_ROOT)) return;

      const entries = await readdir(SITES_ROOT);
      for (const entry of entries) {
        const dirPath = path.join(SITES_ROOT, entry);
        console.log(`[doable-cloud] Found deployment dir: ${dirPath}`);
      }
    } catch (err) {
      console.warn(
        `[doable-cloud] Teardown error for project=${projectId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}

// ── Subdomain generation ─────────────────────────────────
const RANDOM_SUFFIX_LEN = 5;

/**
 * Generate a short, human-friendly subdomain from a project name.
 * Example: "Build A Simple Portfolio Page" → "portfolio-page-x7k2m"
 *
 * Takes the last two meaningful words (more recognizable than the first)
 * and appends a random suffix for uniqueness.
 */
export function generateSubdomain(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  // Take last 2 meaningful words (or whatever is available)
  const words = slug.slice(-2).join("-") || "app";

  // Random alphanumeric suffix
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < RANDOM_SUFFIX_LEN; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }

  // Keep total under 30 chars for readability
  const base = words.slice(0, 30 - RANDOM_SUFFIX_LEN - 1);
  return `${base}-${suffix}`.replace(/--+/g, "-");
}

const STOP_WORDS = new Set([
  "the", "for", "and", "with", "that", "this", "from",
  "create", "build", "make", "simple", "basic", "new",
]);
