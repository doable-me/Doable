import { mkdir, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { DeployAdapter, DeployInput, DeployResult } from "../adapter.js";

const SITES_ROOT = process.env.SITES_ROOT ?? "/sites";
const DOMAIN = process.env.DOABLE_DOMAIN ?? "doable.app";

/**
 * Default deploy adapter: copies build output to a local /sites/[slug]/ directory
 * and generates a *.doable.app URL.
 */
export class DoableCloudAdapter implements DeployAdapter {
  readonly name = "doable-cloud";

  async deploy(input: DeployInput): Promise<DeployResult> {
    const { projectSlug, workspaceSlug, buildOutputDir, environment } = input;

    const subdomain =
      environment === "preview"
        ? `preview-${projectSlug}-${workspaceSlug}`
        : `${projectSlug}-${workspaceSlug}`;

    const targetDir = path.join(SITES_ROOT, subdomain);

    // Clean existing deployment
    if (existsSync(targetDir)) {
      await rm(targetDir, { recursive: true, force: true });
    }

    // Create target directory and copy build output
    await mkdir(targetDir, { recursive: true });
    await cp(buildOutputDir, targetDir, { recursive: true });

    const url = `https://${subdomain}.${DOMAIN}`;

    return {
      url,
      adapter: this.name,
      metadata: {
        targetDir,
        subdomain,
        domain: DOMAIN,
      },
    };
  }

  async teardown(projectId: string, environment: string): Promise<void> {
    // In a real implementation, we'd look up the subdomain from the DB
    // and remove the directory. For now this is a placeholder.
    console.log(
      `[doable-cloud] Teardown requested for project=${projectId} env=${environment}`
    );
  }
}
