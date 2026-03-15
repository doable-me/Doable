export interface DeployInput {
  projectId: string;
  projectSlug: string;
  workspaceSlug: string;
  buildOutputDir: string;
  environment: "preview" | "production";
}

export interface DeployResult {
  url: string;
  adapter: string;
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
   * Optional: tear down a deployment.
   */
  teardown?(projectId: string, environment: string): Promise<void>;
}
