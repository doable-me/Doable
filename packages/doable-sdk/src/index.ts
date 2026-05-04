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
     * List integrations available for this project (cached).
     */
    list(): Promise<AvailableIntegration[]>;
  };
}

/**
 * Create a Doable client for calling integrations from the browser.
 *
 * In preview mode (editor open): token arrives via postMessage automatically.
 * In deployed mode: pass apiKey from env.
 */
export function createDoableClient(config?: DoableSDKConfig): DoableClient {
  const resolvedConfig: DoableSDKConfig = {
    proxyUrl: config?.proxyUrl ?? "/__doable/connector-proxy",
    apiKey: config?.apiKey,
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

      async list(): Promise<AvailableIntegration[]> {
        const baseUrl = resolvedConfig.proxyUrl!;
        const url = `${baseUrl}/available`;
        const token = await tokenManager.getToken();
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        if (resolvedConfig.projectId) {
          headers["x-doable-project-id"] = resolvedConfig.projectId;
        }
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return [];
          const body = await res.json();
          return body.integrations ?? [];
        } catch {
          return [];
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

    // Signal to parent that we need a token
    try {
      window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*");
    } catch {
      // Not in iframe or cross-origin — will use API key path
    }
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
      try {
        window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*");
      } catch {
        // ignore
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

export type { DoableSDKConfig as Config, DoableClient as Client };
