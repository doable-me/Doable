/**
 * @doable/sdk/server — Server-side client for Next.js API Routes & Server Actions.
 *
 * Usage:
 *   import { createServerClient } from "@doable/sdk/server";
 *   const doable = createServerClient();
 *   const result = await doable.integrations.run("slack", "send_channel_message", { channel, text });
 *
 * Auth: Uses DOABLE_PROJECT_KEY (server-only, not browser-exposed).
 * Transport: Calls the proxy over internal network (127.0.0.1), not public URL.
 */

import type { DoableClient, DoableSDKConfig, IntegrationCallResult, AvailableIntegration } from "./index.js";

export interface ServerClientConfig {
  /** Project API key. Defaults to process.env.DOABLE_PROJECT_KEY */
  apiKey?: string;
  /** Project ID. Defaults to process.env.DOABLE_PROJECT_ID */
  projectId?: string;
  /** Proxy URL. Defaults to process.env.DOABLE_PROXY_URL or http://127.0.0.1:4000/__doable/connector-proxy */
  proxyUrl?: string;
}

/**
 * Create a server-side Doable client for Next.js Server Actions, API Routes, etc.
 * Uses a project API key (higher rate limits than browser JWT).
 */
export function createServerClient(config?: ServerClientConfig): DoableClient {
  const apiKey = config?.apiKey ?? process.env.DOABLE_PROJECT_KEY;
  const projectId = config?.projectId ?? process.env.DOABLE_PROJECT_ID;
  const proxyUrl = config?.proxyUrl ?? process.env.DOABLE_PROXY_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? "4000"}/__doable/connector-proxy`;

  if (!apiKey) {
    console.warn("[@doable/sdk/server] No DOABLE_PROJECT_KEY set. Integration calls will fail with 401.");
  }

  return {
    integrations: {
      async run<T = unknown>(
        integrationId: string,
        actionName: string,
        props?: Record<string, unknown>,
      ): Promise<IntegrationCallResult<T>> {
        const url = `${proxyUrl}/${encodeURIComponent(integrationId)}/${encodeURIComponent(actionName)}`;
        const headers: Record<string, string> = { "content-type": "application/json" };

        if (apiKey) {
          headers["authorization"] = `Bearer ${apiKey}`;
        }
        if (projectId) {
          headers["x-doable-project-id"] = projectId;
        }

        try {
          const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ props: props ?? {} }),
          });

          const json = await res.json();

          // Normalize response
          if (json.success !== undefined) {
            return {
              success: json.success,
              data: json.success ? (json.data ?? json.output ?? null) : null,
              error: json.success ? null : { code: json.error?.code ?? "UNKNOWN", message: json.error?.detail ?? json.error?.message ?? "Unknown error" },
              meta: json.meta ?? { integrationId, actionName, durationMs: 0 },
            };
          }

          if ("output" in json) {
            return {
              success: json.success ?? true,
              data: json.output as T,
              error: json.error ? { code: "EXECUTION_FAILED", message: json.error } : null,
              meta: { integrationId, actionName, durationMs: 0 },
            };
          }

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
      },

      async list(): Promise<AvailableIntegration[]> {
        const url = `${proxyUrl}/available`;
        const headers: Record<string, string> = {};
        if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
        if (projectId) headers["x-doable-project-id"] = projectId;
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
