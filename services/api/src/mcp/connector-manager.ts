import type { McpConnectorConfig, McpToolDefinition, ResolvedMcpTool } from "./types.js";
import { McpClient } from "./client.js";
import { createTransport } from "./transport.js";
import { refreshMcpAccessToken } from "./oauth.js";
import { connectorQueries } from "@doable/db";
import { sql } from "../db/index.js";

const connectors = connectorQueries(sql);

interface ConnectorEntry {
  config: McpConnectorConfig;
  client: McpClient;
  tools: McpToolDefinition[];
  lastUsed: number;
  connectRetries: number;
  /**
   * For oauth2 connectors: epoch-ms when the access token baked into this
   * client's transport headers expires. A cached HTTP client keeps using the
   * header set at connect time, so once this passes we must NOT reuse the
   * cached client — getClient() forces a reconnect, which refreshes the token.
   * undefined = no known expiry (don't proactively recycle).
   */
  oauthExpiresAt?: number;
}

/**
 * Manages MCP connector lifecycle: lazy connect, pooling, reconnection, eviction.
 */
export class ConnectorManager {
  private connections = new Map<string, ConnectorEntry>();
  private readonly maxConnections: number;
  private readonly idleTimeoutMs: number;
  private evictionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts?: { maxConnections?: number; idleTimeoutMs?: number }) {
    this.maxConnections = opts?.maxConnections ?? 50;
    this.idleTimeoutMs = opts?.idleTimeoutMs ?? 30 * 60 * 1000; // 30 minutes

    // Run eviction check every 5 minutes
    this.evictionTimer = setInterval(() => this.evictIdle(), 5 * 60 * 1000);
  }

  /**
   * Get or create a connection to an MCP server.
   * Lazy connects on first use.
   */
  async getClient(config: McpConnectorConfig): Promise<McpClient> {
    const existing = this.connections.get(config.id);
    // Don't reuse a cached client whose baked-in OAuth access token has (nearly)
    // expired — the reconnect below refreshes it. 60s safety margin.
    const tokenStillValid =
      !existing?.oauthExpiresAt || Date.now() < existing.oauthExpiresAt - 60_000;
    if (existing?.client.isReady() && tokenStillValid) {
      existing.lastUsed = Date.now();
      return existing.client;
    }
    if (existing && !tokenStillValid) {
      existing.client.disconnect().catch(() => {});
      this.connections.delete(config.id);
    }

    // Evict LRU if at capacity
    if (this.connections.size >= this.maxConnections) {
      this.evictLRU();
    }

    return this.connect(config);
  }

  /**
   * Get the tools discovered from a connector.
   * Connects if needed, caches the tool list.
   * Returns cached tools even if the connection has since dropped — the tool
   * handler in tool-bridge.ts will reconnect on demand when a tool is called.
   */
  async getTools(config: McpConnectorConfig): Promise<McpToolDefinition[]> {
    const entry = this.connections.get(config.id);
    if (entry?.tools.length) {
      entry.lastUsed = Date.now();
      return entry.tools;
    }

    const client = await this.getClient(config);
    const tools = await client.listTools();

    const existing = this.connections.get(config.id);
    if (existing) {
      existing.tools = tools;
    }

    return tools;
  }

  /**
   * Like getTools but retries once on failure after a short delay.
   * Used by getEffectiveTools to handle transient subprocess startup failures.
   */
  private async getToolsWithRetry(config: McpConnectorConfig): Promise<McpToolDefinition[]> {
    try {
      return await this.getTools(config);
    } catch (firstErr) {
      console.warn(
        `[ConnectorManager] First attempt failed for ${config.name}, retrying in 1s:`,
        firstErr instanceof Error ? firstErr.message : firstErr,
      );
      // Clean up any partial state from the failed attempt
      await this.disconnect(config.id).catch(() => {});
      await new Promise((r) => setTimeout(r, 1000));
      return this.getTools(config);
    }
  }

  /**
   * Resolve all effective MCP tools for a given scope.
   * Merges tools from workspace + project + user connectors.
   */
  async getEffectiveTools(
    connectors: McpConnectorConfig[],
  ): Promise<ResolvedMcpTool[]> {
    const resolved: ResolvedMcpTool[] = [];

    // Process connectors, collecting tools from each
    const results = await Promise.allSettled(
      connectors
        .filter((c) => c.status === "active")
        .map(async (connector) => {
          try {
            const tools = await this.getToolsWithRetry(connector);
            return tools.map((tool) => ({
              connectorId: connector.id,
              connectorName: connector.name,
              tool,
            }));
          } catch (err) {
            console.warn(
              `[ConnectorManager] Failed to get tools from ${connector.name}:`,
              err instanceof Error ? err.message : err,
            );
            return [];
          }
        }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        resolved.push(...result.value);
      } else {
        console.warn(`[ConnectorManager] Connector tool resolution rejected:`, result.reason);
      }
    }

    // Log full tool manifest from MCP connectors
    if (resolved.length > 0) {
      console.log(`[ConnectorManager] Resolved ${resolved.length} MCP tools:\n${resolved.map(t =>
        `  [${t.connectorName}] ${t.tool.name} — ${(t.tool.description ?? "").slice(0, 100)} params=${JSON.stringify(Object.keys(t.tool.inputSchema?.properties ?? {}))}`
      ).join("\n")}`);
    }

    return resolved;
  }

  /**
   * Test a connector — try to connect and list tools.
   */
  async testConnection(config: McpConnectorConfig): Promise<{
    success: boolean;
    tools?: McpToolDefinition[];
    error?: string;
  }> {
    try {
      // Disconnect any stale cached connection first to ensure a fresh session
      await this.disconnect(config.id).catch(() => {});
      const client = await this.connect(config);
      const tools = await client.listTools();
      return { success: true, tools };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Disconnect a specific connector.
   */
  async disconnect(connectorId: string): Promise<void> {
    const entry = this.connections.get(connectorId);
    if (entry) {
      await entry.client.disconnect();
      this.connections.delete(connectorId);
    }
  }

  /**
   * Graceful shutdown — disconnect all connectors.
   */
  async shutdown(): Promise<void> {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }

    const disconnects = Array.from(this.connections.entries()).map(
      async ([id, entry]) => {
        try {
          await entry.client.disconnect();
        } catch (err) {
          console.warn(`[ConnectorManager] Error disconnecting ${id}:`, err);
        }
      },
    );

    await Promise.allSettled(disconnects);
    this.connections.clear();
    console.log("[ConnectorManager] All connections closed");
  }

  /** Number of active connections */
  get activeCount(): number {
    return this.connections.size;
  }

  // ── Private ──

  private async connect(config: McpConnectorConfig): Promise<McpClient> {
    const headers: Record<string, string> = {};
    let stdioEnv: Record<string, string> | undefined;
    // For oauth2: epoch-ms the access token now in `headers` expires (so the
    // cached client can be recycled before it goes stale). undefined = unknown.
    let oauthExpiresAtMs: number | undefined;

    // Phase 2B: virtual connectors (preset-synthesized) carry their env map
    // inline and have NO DB row, so calling `connectors.getDecrypted(config.id)`
    // would return null and silently drop their env. Short-circuit here.
    if (config.inlineServerEnv) {
      stdioEnv = config.inlineServerEnv;
    } else {
      // Stdio transports may need server env vars even without auth headers,
      // so always fetch the decrypted row for stdio. HTTP transports only need
      // a decrypt round-trip when an auth scheme is configured.
      const needsDecrypt =
        config.transportType === "stdio" ||
        (config.authType && config.authType !== "none");

      if (needsDecrypt) {
        const decrypted = await connectors.getDecrypted(config.id);
        const creds = (decrypted?.credentials ?? {}) as Record<string, unknown>;
        stdioEnv = decrypted?.serverEnv ?? undefined;

        switch (config.authType) {
          case "bearer_token":
            if (creds.token) {
              headers["Authorization"] = `Bearer ${String(creds.token)}`;
            }
            break;
          case "api_key": {
            const headerName =
              (creds.header as string | undefined) ?? "X-API-Key";
            if (creds.apiKey) {
              headers[headerName] = String(creds.apiKey);
            }
            break;
          }
          case "oauth2": {
            // OAuth2 access tokens are short-lived. The previous code used the
            // stored access_token verbatim with no expiry check or refresh — so
            // once it expired the MCP server returned 401 and every runtime call
            // (preview AND deployed app) silently returned no data. Refresh the
            // token using the stored refresh_token when it's expired (or about to
            // be), then persist the rotated credentials. Generic RFC-6749 flow —
            // works for any OAuth2 MCP server.
            let accessToken = creds.access_token as string | undefined;
            const refreshToken = creds.refresh_token as string | undefined;
            const tokenEndpoint = creds.token_endpoint as string | undefined;
            const clientId = creds.client_id as string | undefined;
            const obtainedAt = Number(creds.obtained_at) || 0;
            const expiresIn = Number(creds.expires_in) || 0;
            // Refresh 60s before actual expiry. If the AS didn't advertise an
            // expiry (expiresAtMs === 0) we can't proactively detect staleness;
            // the call then surfaces a clear re-auth error rather than hanging.
            const expiresAtMs = obtainedAt && expiresIn ? obtainedAt + expiresIn * 1000 : 0;
            const isExpired = expiresAtMs > 0 && Date.now() >= expiresAtMs - 60_000;
            oauthExpiresAtMs = expiresAtMs || undefined;
            if ((isExpired || !accessToken) && refreshToken && tokenEndpoint) {
              try {
                console.log(`[ConnectorManager] Refreshing expired OAuth token for ${config.name}`);
                const refreshed = await refreshMcpAccessToken(tokenEndpoint, refreshToken, clientId);
                accessToken = refreshed.access_token;
                const newExpIn = refreshed.expires_in ?? expiresIn;
                oauthExpiresAtMs = newExpIn ? Date.now() + newExpIn * 1000 : undefined;
                await connectors.updateConnector(config.id, {
                  credentials: {
                    access_token: refreshed.access_token,
                    // Some authorization servers rotate the refresh token on use;
                    // keep the new one when present, else retain the existing one.
                    refresh_token: refreshed.refresh_token ?? refreshToken,
                    token_type: refreshed.token_type ?? creds.token_type,
                    expires_in: refreshed.expires_in ?? expiresIn,
                    scope: refreshed.scope ?? creds.scope,
                    obtained_at: Date.now(),
                    token_endpoint: tokenEndpoint,
                    client_id: clientId,
                  },
                });
              } catch (refreshErr) {
                console.error(
                  `[ConnectorManager] OAuth token refresh failed for ${config.name}:`,
                  refreshErr instanceof Error ? refreshErr.message : refreshErr,
                );
                // Fall through with the (stale) token — the call surfaces a clear
                // 401 → "re-authenticate" rather than a confusing empty result.
              }
            }
            if (accessToken) {
              headers["Authorization"] = `Bearer ${String(accessToken)}`;
            } else {
              throw new Error("OAuth credentials missing or expired. Please re-authenticate by connecting via OAuth again.");
            }
            break;
          }
          // 'none' or unknown — leave headers empty (existing behavior)
        }
      }
    }

    const transport = createTransport(config.transportType, {
      serverUrl: config.serverUrl,
      serverCommand: config.serverCommand,
      serverArgs: config.serverArgs,
      serverEnv: stdioEnv,
      headers,
      // Per-project context for builtin: transports (e.g. builtin:data routes to
      // the right PGlite worker). Real transports ignore it.
      projectId: config.projectId,
    });

    const client = new McpClient(transport);

    try {
      const capabilities = await client.initialize();

      this.connections.set(config.id, {
        config,
        client,
        tools: [],
        lastUsed: Date.now(),
        connectRetries: 0,
        oauthExpiresAt: oauthExpiresAtMs,
      });

      console.log(
        `[ConnectorManager] Connected to ${config.name} (${config.transportType})`,
        capabilities,
      );

      return client;
    } catch (err) {
      // Track retry count for exponential backoff
      const entry = this.connections.get(config.id);
      const retries = (entry?.connectRetries ?? 0) + 1;

      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      console.error(
        `[ConnectorManager] Failed to connect to ${config.name} (attempt ${retries}):`,
        errMsg,
      );
      if (errStack) {
        console.error(`[ConnectorManager] Stack trace:`, errStack);
      }
      // For stdio transports, the error may contain stderr from the server process
      if (config.transportType === "stdio") {
        console.error(
          `[ConnectorManager] Stdio transport failed for ${config.name} — command: ${config.serverCommand} ${(config.serverArgs ?? []).join(" ")}`,
        );
      }

      throw err;
    }
  }

  private evictIdle(): void {
    const now = Date.now();
    for (const [id, entry] of this.connections) {
      if (now - entry.lastUsed > this.idleTimeoutMs) {
        console.log(`[ConnectorManager] Evicting idle connection: ${entry.config.name}`);
        entry.client.disconnect().catch(() => {});
        this.connections.delete(id);
      }
    }
  }

  private evictLRU(): void {
    let oldest: { id: string; lastUsed: number } | null = null;
    for (const [id, entry] of this.connections) {
      if (!oldest || entry.lastUsed < oldest.lastUsed) {
        oldest = { id, lastUsed: entry.lastUsed };
      }
    }
    if (oldest) {
      const entry = this.connections.get(oldest.id);
      console.log(`[ConnectorManager] Evicting LRU connection: ${entry?.config.name}`);
      entry?.client.disconnect().catch(() => {});
      this.connections.delete(oldest.id);
    }
  }
}

// ─── Singleton ──────────────────────────────────────────

let _manager: ConnectorManager | null = null;

export function getConnectorManager(): ConnectorManager {
  if (!_manager) {
    _manager = new ConnectorManager();
  }
  return _manager;
}
