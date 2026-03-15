import { mkdir, cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DeployAdapter, DeployInput, DeployResult } from "../adapter.js";

const SITES_ROOT = process.env.SITES_ROOT ?? path.join(process.cwd(), "sites");
const DOMAIN = process.env.DOABLE_DOMAIN ?? "doable.app";

/**
 * Default deploy adapter: copies build output to a local /sites/[slug]/ directory
 * and generates a *.doable.app URL.
 *
 * On the local dev path, the URL points to the sites directory served by a
 * static file server or reverse proxy. In production, a CDN or edge server
 * would serve the files from the same directory structure.
 */
export class DoableCloudAdapter implements DeployAdapter {
  readonly name = "doable-cloud";

  async deploy(input: DeployInput): Promise<DeployResult> {
    const { projectId, projectSlug, workspaceSlug, buildOutputDir, environment } = input;

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

    // Sanitize slugs to prevent path traversal
    const safeProjectSlug = projectSlug.replace(/[^a-z0-9-]/gi, "-");
    const safeWorkspaceSlug = workspaceSlug.replace(/[^a-z0-9-]/gi, "-");

    const subdomain =
      environment === "preview"
        ? `preview-${safeProjectSlug}-${safeWorkspaceSlug}`
        : `${safeProjectSlug}-${safeWorkspaceSlug}`;

    const targetDir = path.join(SITES_ROOT, subdomain);

    try {
      // Ensure the sites root directory exists
      await mkdir(SITES_ROOT, { recursive: true });

      // Clean existing deployment
      if (existsSync(targetDir)) {
        await rm(targetDir, { recursive: true, force: true });
      }

      // Create target directory and copy build output
      await mkdir(targetDir, { recursive: true });
      await cp(buildOutputDir, targetDir, { recursive: true });

      // Verify the copy succeeded
      const copiedFiles = await readdir(targetDir);
      if (copiedFiles.length === 0) {
        throw new Error("Copy completed but target directory is empty");
      }

      console.log(
        `[doable-cloud] Deployed ${copiedFiles.length} files for project ${projectId} ` +
        `(${environment}) to ${targetDir}`
      );
    } catch (err) {
      // Wrap filesystem errors with more context
      if (err instanceof Error && err.message.includes("Copy completed")) {
        throw err; // Re-throw our own errors
      }
      throw new Error(
        `Failed to deploy to ${targetDir}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    const url = `https://${subdomain}.${DOMAIN}`;

    return {
      url,
      adapter: this.name,
      metadata: {
        targetDir,
        subdomain,
        domain: DOMAIN,
        filesDeployed: buildFiles.length,
      },
    };
  }

  async teardown(projectId: string, environment: string): Promise<void> {
    console.log(
      `[doable-cloud] Teardown requested for project=${projectId} env=${environment}`
    );

    // Attempt to find and remove the deployment directory.
    // In production, this would look up the subdomain from the DB.
    try {
      if (!existsSync(SITES_ROOT)) return;

      const entries = await readdir(SITES_ROOT);
      // Find directories that match this project's pattern
      // (We don't have the slug here, but we can match by projectId in metadata later)
      for (const entry of entries) {
        const dirPath = path.join(SITES_ROOT, entry);
        // For now, log and skip — a full implementation would track
        // projectId -> subdomain in the database
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
