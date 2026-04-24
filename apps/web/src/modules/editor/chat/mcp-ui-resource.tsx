"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * Called when the iframe sends a `prompt` action — injects a synthetic user
   * message into the chat so the AI continues with new context (e.g. picker
   * choices that feed the AI a skill prompt).
   */
  onPrompt?: (text: string) => void;
}

interface ParentMessage {
  type?: string;
  payload?: {
    toolName?: string;
    params?: Record<string, unknown>;
    url?: string;
    height?: number;
    message?: string;
    prompt?: string;
    text?: string;
  };
  // Some MCP App hosts use { method, params } shape; accept both.
  method?: string;
  params?: Record<string, unknown>;
}

/**
 * Standards-compliant MCP App renderer per
 * https://modelcontextprotocol.io/extensions/apps and https://mcpui.dev:
 *
 *  - Renders the resource HTML in a sandboxed iframe via `srcdoc`.
 *  - Listens for `window.postMessage` events from the iframe and dispatches
 *    them per the MCP Apps wire format:
 *      { type: 'tool',   payload: { toolName, params } }
 *      { type: 'link',   payload: { url } }
 *      { type: 'notify', payload: { message } }
 *      { type: 'size',   payload: { height } }   (used to auto-resize)
 *
 *  - For `tool`, calls the host's GENERIC `/chat/mcp-call` proxy (no per-tool
 *    logic in the host) and forwards any returned `ui://` resources back into
 *    the chat via `onResource`.
 *
 * This is intentionally implemented from scratch — no `@mcp-ui/client` —
 * to keep it dependency-light and to serve as a reference implementation
 * of the spec.
 */
export function McpUiResourceCard({ resource, projectId, onResource, onPrompt }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(280);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const html = typeof resource.resource.text === "string" ? resource.resource.text : "";

  const handleToolCall = useCallback(
    async (toolName: string, params: Record<string, unknown>) => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("doable_access_token") : null;
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

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Only accept messages from our iframe.
      if (!iframeRef.current || ev.source !== iframeRef.current.contentWindow) return;
      const data = ev.data as ParentMessage | undefined;
      if (!data || typeof data !== "object") return;

      // Spec form: { type, payload }. Tolerate { method, params } too.
      const type = data.type ?? data.method;
      const payload = data.payload ?? data.params ?? {};

      if (type === "tool") {
        const toolName = payload.toolName as string | undefined;
        const params = (payload.params as Record<string, unknown> | undefined) ?? {};
        if (toolName) void handleToolCall(toolName, params);
        return;
      }
      if (type === "prompt") {
        // Inject a synthetic user message into the chat so the AI picks it up
        // and continues from there. Used by MCP App pickers that need the AI
        // to generate creative content (e.g. presentation builder picker that
        // hands off skill instructions for HTML/PPTX generation).
        const text = (payload.prompt as string | undefined)
          ?? (payload.text as string | undefined)
          ?? (payload.message as string | undefined);
        if (text && onPrompt) onPrompt(text);
        return;
      }
      if (type === "link") {
        const url = payload.url as string | undefined;
        if (url && (url.startsWith("https://") || url.startsWith("http://"))) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        return;
      }
      if (type === "size") {
        const h = Number(payload.height);
        if (Number.isFinite(h) && h > 0 && h < 4000) setIframeHeight(Math.ceil(h));
        return;
      }
      // 'notify' and unknown types: no-op (iframe can surface its own UI).
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [handleToolCall, onPrompt]);

  if (!html) {
    return (
      <div className="not-prose w-full rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm dark:border-amber-400/50 dark:bg-amber-950/80 dark:text-amber-200">
        MCP UI resource has no HTML payload.
      </div>
    );
  }

  return (
    <div className="not-prose w-full">
      <iframe
        ref={iframeRef}
        title={`mcp-app:${resource.toolName}`}
        sandbox="allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox"
        srcDoc={html}
        style={{
          width: "100%",
          height: `${iframeHeight}px`,
          border: "0",
          display: "block",
          background: "transparent",
        }}
      />
      {error && (
        <div className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow-sm dark:border-red-400/50 dark:bg-red-950/80 dark:text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
