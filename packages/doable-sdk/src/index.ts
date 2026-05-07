/**
 * @doable/sdk — Secure integration proxy client.
 *
 * Lets generated Vite & Next.js apps call any connected integration
 * (Slack, Stripe, GitHub, etc.) through a secure server-side proxy.
 * Credentials never reach the browser.
 *
 * Usage:
 *   import { createDoableClient } from "@doable/sdk";
 *   const doable = createDoableClient();
 *   const result = await doable.integrations.run("slack", "send_channel_message", { channel: "#general", text: "hi" });
 */

export interface IntegrationCallResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { integrationId: string; actionName: string; durationMs: number } | null;
}

export interface McpCallResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { connectorName: string; toolName: string; durationMs: number } | null;
}

export interface McpTool {
  /** Full prefixed tool name — use this in doable.mcp.call() */
  fullName: string;
  /** Alias for fullName (convenience) */
  name: string;
  connectorName: string;
  toolName: string;
  description?: string;
}

export interface AvailableIntegration {
  id: string;
  displayName: string;
  actions: Array<{
    name: string;
    displayName: string;
    description: string;
  }>;
}

export interface DoableSDKConfig {
  /** Override proxy base URL (defaults to same-origin /__doable/connector-proxy) */
  proxyUrl?: string;
  /** Project API key for deployed apps (omit in preview — token arrives via postMessage) */
  apiKey?: string;
  /** Project ID (required when using apiKey) */
  projectId?: string;
}

export interface DoableClient {
  integrations: {
    /**
     * Call an integration action through the secure proxy.
     * Credentials are decrypted server-side — never exposed to the browser.
     */
    run<T = unknown>(
      integrationId: string,
      actionName: string,
      props?: Record<string, unknown>,
    ): Promise<IntegrationCallResult<T>>;

    /**
     * List integrations available for this project.
     */
    list(): Promise<{ success: boolean; data: AvailableIntegration[]; error: { code: string; message: string } | null }>;
  };

  mcp: {
    /**
     * Call an MCP tool through the secure proxy.
     * Use the full AI-prefixed tool name (e.g. "mcp_hpca_mcp_get_user_info")
     * or connector-scoped name. Credentials are resolved server-side.
     */
    call<T = unknown>(
      toolName: string,
      args?: Record<string, unknown>,
    ): Promise<McpCallResult<T>>;

    /**
     * List available MCP tools for this workspace.
     */
    list(): Promise<{ success: boolean; data: McpTool[]; error: { code: string; message: string } | null }>;
  };
}

/**
 * Create a Doable client for calling integrations from the browser.
 *
 * In preview mode (editor open): token arrives via postMessage automatically.
 * In deployed mode: pass apiKey from env.
 */
export function createDoableClient(config?: DoableSDKConfig): DoableClient {
  // Auto-detect VITE_DOABLE_PROJECT_KEY from env when no apiKey is explicitly provided.
  // This allows generated projects to just call createDoableClient() and have the key
  // automatically injected at build time via the auto-provisioning pipeline.
  let autoKey = config?.apiKey;
  if (!autoKey) {
    try {
      // Vite replaces import.meta.env.* at build time with the literal value
      const envKey = (import.meta as any).env?.VITE_DOABLE_PROJECT_KEY;
      if (typeof envKey === "string" && envKey.length > 0) {
        autoKey = envKey;
      }
    } catch {
      // Not in a Vite context (SSR, tests, etc.) — ignore
    }
  }

  // Auto-detect proxy URL from VITE_DOABLE_API_URL env var for deployed sites.
  // Published sites need an absolute URL because they're served from a different
  // domain (e.g. dev-my-app-x7k2m.doable.me) than the API (dev-api.doable.me).
  let autoProxyUrl = config?.proxyUrl;
  if (!autoProxyUrl) {
    try {
      const apiUrl = (import.meta as any).env?.VITE_DOABLE_API_URL;
      if (typeof apiUrl === "string" && apiUrl.length > 0) {
        autoProxyUrl = `${apiUrl.replace(/\/$/, "")}/__doable/connector-proxy`;
      }
    } catch {
      // Not in a Vite context — ignore
    }
  }

  const resolvedConfig: DoableSDKConfig = {
    proxyUrl: autoProxyUrl ?? "/__doable/connector-proxy",
    apiKey: autoKey,
    projectId: config?.projectId,
  };

  const tokenManager = new TokenManager(resolvedConfig.apiKey);

  return {
    integrations: {
      async run<T = unknown>(
        integrationId: string,
        actionName: string,
        props?: Record<string, unknown>,
      ): Promise<IntegrationCallResult<T>> {
        return callProxy<T>(integrationId, actionName, props ?? {}, resolvedConfig, tokenManager);
      },

      async list(): Promise<{ success: boolean; data: AvailableIntegration[]; error: { code: string; message: string } | null }> {
        const baseUrl = resolvedConfig.proxyUrl!;
        const url = `${baseUrl}/available`;
        const token = await tokenManager.getToken();
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        if (resolvedConfig.projectId) {
          headers["x-doable-project-id"] = resolvedConfig.projectId;
        }
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return { success: false, data: [], error: { code: "HTTP_ERROR", message: `HTTP ${res.status}` } };
          const body = await res.json();
          return { success: true, data: body.integrations ?? [], error: null };
        } catch (err) {
          return { success: false, data: [], error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Failed to list integrations" } };
        }
      },
    },

    mcp: {
      async call<T = unknown>(
        toolName: string,
        args?: Record<string, unknown>,
      ): Promise<McpCallResult<T>> {
        return callMcpProxy<T>(toolName, args ?? {}, resolvedConfig, tokenManager);
      },

      async list(): Promise<{ success: boolean; data: McpTool[]; error: { code: string; message: string } | null }> {
        const baseUrl = resolvedConfig.proxyUrl!;
        const url = `${baseUrl}/mcp/available`;
        const token = await tokenManager.getToken();
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        if (resolvedConfig.projectId) {
          headers["x-doable-project-id"] = resolvedConfig.projectId;
        }
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return { success: false, data: [], error: { code: "HTTP_ERROR", message: `HTTP ${res.status}` } };
          const body = await res.json();
          const tools: McpTool[] = (body.tools ?? []).map((t: Record<string, string>) => ({
            ...t,
            name: t.fullName ?? t.name ?? "",
          }));
          return { success: true, data: tools, error: null };
        } catch (err) {
          return { success: false, data: [], error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Failed to list MCP tools" } };
        }
      },
    },
  };
}

// ─── Token Management ──────────────────────────────────────

class TokenManager {
  private token: string | null;
  private waiters: Array<(token: string) => void> = [];
  private listening = false;

  constructor(apiKey?: string) {
    this.token = apiKey ?? null;

    // In browser without API key: use postMessage flow
    if (!apiKey && typeof window !== "undefined") {
      this.setupPostMessage();
    }
  }

  private setupPostMessage(): void {
    if (this.listening) return;
    this.listening = true;

    window.addEventListener("message", (ev) => {
      if (!ev.data || typeof ev.data !== "object") return;
      if (ev.data.type === "doable:connector-proxy-token" && typeof ev.data.token === "string") {
        this.token = ev.data.token;
        const queue = this.waiters;
        this.waiters = [];
        queue.forEach((resolve) => resolve(this.token!));
      }
    });

    // If in an iframe, signal to parent that we need a token
    if (window.parent !== window) {
      try {
        window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*");
      } catch {
        // Not in iframe or cross-origin — fall through to standalone fetch
      }
    } else {
      // Standalone mode — fetch token directly from the preview token endpoint
      this.fetchTokenDirect();
    }
  }

  private fetchTokenDirect(): void {
    // Extract project ID from URL path: /preview/:projectId/...
    const pathMatch = window.location.pathname.match(/^\/preview\/([0-9a-f-]{36})\//i);
    let pid = pathMatch?.[1] ?? null;
    if (!pid) {
      const meta = document.querySelector('meta[name="doable-project-id"]');
      pid = meta?.getAttribute("content") ?? null;
    }
    if (!pid) return;
    fetch(`/preview/${pid}/__doable/token`, { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { token?: string } | null) => {
        if (d?.token) {
          this.token = d.token;
          const queue = this.waiters;
          this.waiters = [];
          queue.forEach((resolve) => resolve(this.token!));
        }
      })
      .catch(() => {});
  }

  async getToken(): Promise<string> {
    if (this.token) return this.token;
    if (typeof window === "undefined") {
      throw new Error("@doable/sdk: No API key provided and not running in browser. Use createServerClient() for server-side.");
    }
    return new Promise<string>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  invalidate(): void {
    this.token = null;
    if (typeof window !== "undefined") {
      if (window.parent !== window) {
        try {
          window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*");
        } catch {
          // ignore
        }
      } else {
        this.fetchTokenDirect();
      }
    }
  }
}

// ─── Proxy Fetch ───────────────────────────────────────────

async function callProxy<T>(
  integrationId: string,
  actionName: string,
  props: Record<string, unknown>,
  config: DoableSDKConfig,
  tokenManager: TokenManager,
): Promise<IntegrationCallResult<T>> {
  const baseUrl = config.proxyUrl ?? "/__doable/connector-proxy";
  const url = `${baseUrl}/${encodeURIComponent(integrationId)}/${encodeURIComponent(actionName)}`;

  const headers: Record<string, string> = { "content-type": "application/json" };

  const token = await tokenManager.getToken();
  headers["authorization"] = `Bearer ${token}`;
  if (config.projectId) {
    headers["x-doable-project-id"] = config.projectId;
  }

  const body = JSON.stringify({ props });

  try {
    let res = await fetch(url, { method: "POST", headers, body });

    // Token expired — refresh and retry once (preview mode only)
    if (res.status === 401 && !config.apiKey) {
      tokenManager.invalidate();
      const freshToken = await tokenManager.getToken();
      headers["authorization"] = `Bearer ${freshToken}`;
      res = await fetch(url, { method: "POST", headers, body });
    }

    const json = await res.json();

    // Normalize the response into our standard format
    if (json.success !== undefined) {
      // New format from updated proxy
      return {
        success: json.success,
        data: json.success ? (json.data ?? json.output ?? null) : null,
        error: json.success ? null : { code: json.error?.code ?? "UNKNOWN", message: json.error?.detail ?? json.error?.message ?? "Unknown error" },
        meta: json.meta ?? null,
      };
    }

    // Legacy format from existing connector-proxy (returns { success, output, error })
    if ("output" in json) {
      return {
        success: json.success ?? true,
        data: json.output as T,
        error: json.error ? { code: "EXECUTION_FAILED", message: json.error } : null,
        meta: { integrationId, actionName, durationMs: 0 },
      };
    }

    // Error format
    if (json.error) {
      return {
        success: false,
        data: null,
        error: { code: json.error.code ?? "UNKNOWN", message: json.error.detail ?? json.error.message ?? "Unknown error" },
        meta: null,
      };
    }

    return { success: true, data: json as T, error: null, meta: { integrationId, actionName, durationMs: 0 } };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network request failed" },
      meta: null,
    };
  }
}

// ─── MCP Proxy Fetch ───────────────────────────────────────

async function callMcpProxy<T>(
  toolName: string,
  args: Record<string, unknown>,
  config: DoableSDKConfig,
  tokenManager: TokenManager,
): Promise<McpCallResult<T>> {
  const baseUrl = config.proxyUrl ?? "/__doable/connector-proxy";
  const url = `${baseUrl}/mcp/${encodeURIComponent(toolName)}`;

  const headers: Record<string, string> = { "content-type": "application/json" };

  const token = await tokenManager.getToken();
  headers["authorization"] = `Bearer ${token}`;
  if (config.projectId) {
    headers["x-doable-project-id"] = config.projectId;
  }

  const body = JSON.stringify({ props: args });

  try {
    let res = await fetch(url, { method: "POST", headers, body });

    // Token expired — refresh and retry once
    if (res.status === 401 && !config.apiKey) {
      tokenManager.invalidate();
      const freshToken = await tokenManager.getToken();
      headers["authorization"] = `Bearer ${freshToken}`;
      res = await fetch(url, { method: "POST", headers, body });
    }

    const json = await res.json();

    return {
      success: json.success ?? false,
      data: json.success ? (json.data as T ?? null) : null,
      error: json.success ? null : { code: json.error?.code ?? "UNKNOWN", message: json.error?.message ?? "MCP call failed" },
      meta: json.meta ?? null,
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network request failed" },
      meta: null,
    };
  }
}

export type { DoableSDKConfig as Config, DoableClient as Client };
