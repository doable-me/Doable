"use client";

import { useCallback, useState } from "react";
import { UIResourceRenderer, type UIActionResult } from "@mcp-ui/client";
import type { McpUiResource } from "../hooks/use-editor-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Props {
  resource: McpUiResource;
  projectId: string;
  /**
   * Called when the iframe sends a `tools/call` action and the host receives
   * back a new MCP-Apps UI resource. The chat surface should attach the new
   * resource to the SAME assistant message so the iframe replaces (or stacks
   * with) the previous one without an LLM round-trip.
   */
  onResource?: (resource: McpUiResource) => void;
}

/**
 * Standards-compliant MCP App renderer. Wraps @mcp-ui/client's
 * <UIResourceRenderer /> (sandboxed iframe via srcDoc) and proxies any
 * `tool` actions emitted by the iframe through the host's generic
 * `/chat/mcp-call` endpoint. The host knows nothing about specific tools;
 * the iframe drives everything.
 */
export function McpUiResourceCard({ resource, projectId, onResource }: Props) {
  const [error, setError] = useState<string | null>(null);

  const onUIAction = useCallback(
    async (action: UIActionResult) => {
      // Handle external link clicks (very common in download cards).
      if (action.type === "link") {
        const url = action.payload?.url;
        if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        return;
      }

      if (action.type === "notify") {
        // No-op: iframes can surface their own toasts; host doesn't need to.
        return;
      }

      if (action.type !== "tool") return;
      const toolName = action.payload?.toolName;
      const params = action.payload?.params ?? {};
      if (!toolName) return;

      const token = typeof window !== "undefined" ? localStorage.getItem("doable_access_token") : null;
      try {
        const res = await fetch(`${API_URL}/projects/${projectId}/chat/mcp-call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            connectorId: resource.connectorId,
            toolName,
            params,
          }),
        });
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          content?: Array<{ type: string; resource?: McpUiResource["resource"] }>;
        };
        if (!res.ok || !json.success) {
          setError(json.error ?? `Tool call failed (${res.status})`);
          return;
        }

        // Forward any `ui://…` resources the tool returned back into the
        // chat. The chat surface attaches them to the same assistant
        // message, no LLM round-trip needed.
        if (onResource && Array.isArray(json.content)) {
          for (const item of json.content) {
            if (item?.type !== "resource") continue;
            const r = item.resource;
            if (!r?.uri || !r.uri.startsWith("ui://")) continue;
            onResource({
              toolCallId: `${resource.toolCallId}-${Date.now()}`,
              connectorId: resource.connectorId,
              toolName,
              resource: {
                uri: r.uri,
                mimeType: r.mimeType,
                text: r.text,
                blob: r.blob,
              },
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [projectId, resource.connectorId, resource.toolCallId, onResource],
  );

  return (
    <div className="not-prose w-full">
      <UIResourceRenderer
        resource={resource.resource}
        onUIAction={onUIAction}
        htmlProps={{
          autoResizeIframe: { height: true },
          iframeProps: {
            style: { width: "100%", border: "0", display: "block" },
          },
        }}
      />
      {error && (
        <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
