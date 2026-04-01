import type { EnhancedAuthResource } from "../types.js";

/**
 * Interface that each enhanced auth provider module must implement.
 * Each module lives at enhanced-auth/{providerKey}.ts and produces
 * the EXACT same credential shape as manual entry — the runner
 * never knows enhanced auth was used.
 */
export interface EnhancedAuthModule {
  /**
   * After OAuth completes, list available resources (projects/accounts/sites).
   * Called with the management OAuth access token.
   * Return empty array if no resource selection is needed.
   */
  listResources(accessToken: string): Promise<EnhancedAuthResource[]>;

  /**
   * Given the OAuth access token and selected resource, extract the
   * credentials in the EXACT shape the Activepieces piece expects.
   *
   * @returns Credential object stored directly via credentialVault — identical to manual entry.
   */
  extractCredentials(
    accessToken: string,
    resource: EnhancedAuthResource | null,
  ): Promise<{
    authType: "custom_auth" | "secret_text" | "basic_auth";
    credentials: Record<string, unknown>;
    displayName: string;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Optional: validate that extracted credentials actually work.
   * Return null if valid, or an error message string if invalid.
   */
  validateCredentials?(credentials: Record<string, unknown>): Promise<string | null>;
}
