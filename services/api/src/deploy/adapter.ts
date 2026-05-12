export interface DeployInput {
  projectId: string;
  projectSlug: string;
  workspaceSlug: string;
  subdomain: string;
  buildOutputDir: string;
  environment: "preview" | "production";
  /**
   * Public path prefix the site is served from. Defaults to "/" for
   * subdomain hosting; set to e.g. "/_sites/my-app/" when using
   * path-based hosting (PUBLISH_PATH_PREFIX env var). Used by the
   * adapter to compute the final URL and ensure consistency with the
   * builder's --base flag.
   */
  basePath?: string;
  /**
   * When true, the adapter MUST NOT make per-publish DNS API calls. Set by
   * the pipeline when the platform admin has chosen DNS_MODE=wildcard
   * (admin-managed wildcard CNAME covers the hostname).
   */
  skipDnsRegistration?: boolean;
}

export interface DeployResult {
  url: string;
  adapter: string;
  /** Total bytes deployed */
  totalSize?: number;
  /** Individual file info for artifact tracking */
  files?: Array<{ path: string; size: number; hash: string }>;
  metadata?: Record<string, unknown>;
}

/**
 * Interface that all deploy adapters must implement.
 * Each adapter handles copying/uploading built assets to a hosting target.
 */
export interface DeployAdapter {
  readonly name: string;

  /**
   * Deploy build output to the target.
   * Throws on failure.
   */
  deploy(input: DeployInput): Promise<DeployResult>;

  /**
   * Optional: tear down a deployment (remove deployed files).
   */
  teardown?(projectId: string, environment: string): Promise<void>;
}
