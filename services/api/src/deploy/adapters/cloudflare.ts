import type { DeployAdapter, DeployInput, DeployResult } from "../adapter.js";

/**
 * Cloudflare Pages deploy adapter (placeholder).
 *
 * When implemented, this will:
 * 1. Upload build output via Cloudflare Pages Direct Upload API
 * 2. Create a deployment on the configured Cloudflare Pages project
 * 3. Return the deployment URL
 *
 * Required env vars:
 * - CLOUDFLARE_API_TOKEN
 * - CLOUDFLARE_ACCOUNT_ID
 * - CLOUDFLARE_PROJECT_NAME (optional, defaults to "doable-sites")
 */
export class CloudflareAdapter implements DeployAdapter {
  readonly name = "cloudflare";

  private readonly accountId: string;
  private readonly apiToken: string;
  private readonly projectName: string;

  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";
    this.projectName = process.env.CLOUDFLARE_PROJECT_NAME ?? "doable-sites";
  }

  async deploy(input: DeployInput): Promise<DeployResult> {
    if (!this.accountId || !this.apiToken) {
      throw new Error(
        "Cloudflare adapter not configured: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required"
      );
    }

    // TODO: Implement Cloudflare Pages Direct Upload
    // 1. Create upload session via POST /pages/projects/:name/deployments
    // 2. Upload files from input.buildOutputDir
    // 3. Poll for deployment completion
    // 4. Return deployment URL

    throw new Error(
      "Cloudflare Pages adapter not yet implemented. Use doable-cloud adapter."
    );
  }

  async teardown(projectId: string, environment: string): Promise<void> {
    // TODO: Delete deployment via Cloudflare API
    console.log(
      `[cloudflare] Teardown requested for project=${projectId} env=${environment}`
    );
  }
}
