export interface DeployInput {
  projectId: string;
  projectSlug: string;
  workspaceSlug: string;
  subdomain: string;
  buildOutputDir: string;
  environment: "preview" | "production";
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
