import { credentialVault } from "./credential-vault.js";

/**
 * Allows integration actions to look up other integration connections.
 * Used by ~2% of actions that need cross-integration access.
 * Implements the Activepieces ConnectionsManager interface.
 */
export class DoableConnectionsManager {
  constructor(
    private userId: string,
    private workspaceId: string,
  ) {}

  async get(key: string): Promise<unknown | null> {
    // key is typically the integration name (e.g., "slack")
    const connection = await credentialVault.get(this.userId, key, this.workspaceId);
    if (!connection) return null;
    return connection.credentials;
  }
}
