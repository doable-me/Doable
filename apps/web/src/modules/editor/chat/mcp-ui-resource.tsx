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
   * choices that feed the AI a skill prompt). The optional `displayText`
   * lets the iframe show a short friendly bubble in the chat instead of the
   * full machine-readable prompt that the model receives.
   */
  onPrompt?: (text: string, displayText?: string) => void;
  /**
   * Whether the parent chat is currently streaming a response. When true,
   * the card holds off on sending the `host-ready` handshake to the iframe,
   * because injecting a synthetic user message (`onPrompt`) is a no-op
   * during active streams (`sendMessage` early-returns on `isStreaming`).
   * Release the handshake the moment streaming flips idle so auto-build
   * cards can fire their BUILD_DECK follow-up turn without being dropped.
   */
  isStreaming?: boolean;
  /**
   * Live status lines the host wants to surface inside the iframe (e.g.
   * emoji-prefixed narration lines extracted from the AI's streaming
   * assistant text). Each new line the card hasn't seen yet is posted
   * to the iframe as `{type:'status', payload:{text}}` so cards like
   * the presentation-builder auto-build card can replace their static
   * "Designing your deck…" message with a live progress log.
   */
  statusLines?: readonly string[];
  /**
   * Signals the iframe that the long-running operation this card
   * represents has finished successfully. Posted as
   * `{type:'deck-ready', payload:{text}}` so the card can flip its
   * spinner to a check-mark.
   */
  completedText?: string;
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
    displayText?: string;
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
export function McpUiResourceCard({ resource, projectId, onResource, onPrompt, isStreaming, statusLines, completedText }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(280);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // Track which status lines we've already posted to the iframe so each
  // new line streams in exactly once as the AI produces it.
  const postedLinesRef = useRef<Set<string>>(new Set());
  const hostReadyRef = useRef<boolean>(false);

  // Observe the host page's dark/light theme so iframe cards stay in sync.
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const html = typeof resource.resource.text === "string" ? resource.resource.text : "";

  // Inject theme info into the iframe HTML so MCP cards can adapt their
  // styles to dark/light mode.
  const themeListenerScript = `<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="theme"&&e.data.payload){document.documentElement.setAttribute("data-theme",e.data.payload.theme);document.documentElement.style.colorScheme=e.data.payload.theme;}});<\/script>`;
  // Ensure no white canvas leaks through. Two failure modes to defeat:
  //   1. Default `color-scheme: light` makes the iframe's *user-agent
  //      canvas* (the area behind a transparent <html>) render WHITE in
  //      Chromium, even when html/body explicitly say `background:
  //      transparent`. Setting color-scheme on <html> is the only way to
  //      flip the canvas to dark for transparent iframes.
  //   2. Many MCP-app HTML payloads set `body { padding: 10px 0 }` so a
  //      transparent body strip is visible above/below their card,
  //      revealing the canvas. Force margin/padding to zero with
  //      !important — apps that need internal whitespace should put it on
  //      their own .card wrappers.
  const themeResetStyle = `<style>:root{color-scheme:${isDark ? "dark" : "light"};}html,body{background:transparent !important;margin:0 !important;}html{padding:0 !important;}body{padding:0 !important;}</style>`;
  const themedHtml = html
    ? (() => {
        let h = html.replace(/<html(?=[>\s])/i, `<html data-theme="${isDark ? "dark" : "light"}"`);
        // Inject theme reset + listener script — prefer before the LAST
        // `</body>`, fallback to end. Using `lastIndexOf` avoids
        // corrupting MCP cards whose own scripts contain a literal
        // `</body>` substring inside JSON-encoded build prompts (e.g.
        // markdown/spreadsheet/pdf builders include print-ready HTML
        // skeleton text in their auto-build prompt). A naive
        // `replace("</body>", …)` matched the first occurrence inside
        // the script string, which split the script in half and caused
        // the auto-build card to freeze with the build prompt leaking
        // into the iframe body.
        const injectSnippet = themeResetStyle + themeListenerScript;
        const lastBody = h.lastIndexOf("</body>");
        if (lastBody !== -1) {
          h = h.slice(0, lastBody) + injectSnippet + h.slice(lastBody);
        } else {
          h += injectSnippet;
        }
        return h;
      })()
    : html;

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
        const displayText = payload.displayText as string | undefined;
        console.log(`[McpUiResource][Trace] prompt message received (${text?.length ?? 0} chars, display="${displayText?.slice(0, 50)}")`);
        if (text && onPrompt) onPrompt(text, displayText);
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

  // Handshake: once the iframe finishes loading AND the parent chat is
  // idle (not currently streaming a response), tell the iframe the host
  // listener is attached. Auto-start cards (e.g. presentation builder's
  // "Designing your deck…" card) wait for this signal before posting
  // their initial `prompt` message. We MUST gate on `!isStreaming`
  // because the parent's `sendMessage` early-returns while a stream is
  // active — a prompt injected during streaming is silently dropped and
  // the auto-build flow stalls forever.
  const handleIframeLoad = useCallback(() => {
    if (isStreaming) {
      console.log("[McpUiResource][Trace] handleIframeLoad skipped — isStreaming=true");
      return; // will be fired by the isStreaming-gated effect below
    }
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    console.log("[McpUiResource][Trace] handleIframeLoad → posting host-ready");
    try {
      target.postMessage({ type: "host-ready" }, "*");
    } catch {
      /* cross-origin edge cases — ignore */
    }
  }, [isStreaming]);

  // Mount/idle effect: re-post host-ready whenever streaming transitions
  // to idle. Also retries on a short schedule so we beat any race between
  // React commit and the iframe script's addEventListener call. The
  // iframe side guards with a `fired` flag so duplicate messages are
  // harmless.
  useEffect(() => {
    if (!html) return;
    if (isStreaming) {
      console.log("[McpUiResource][Trace] idle-effect skipped — isStreaming=true");
      return; // wait for idle
    }
    console.log("[McpUiResource][Trace] idle-effect firing — isStreaming=false, scheduling host-ready retries");
    let cancelled = false;
    const send = () => {
      const target = iframeRef.current?.contentWindow;
      if (!target) return;
      try {
        target.postMessage({ type: "host-ready" }, "*");
      } catch {
        /* ignore */
      }
    };
    send();
    const timers = [50, 150, 400, 1000, 2000].map((ms) =>
      setTimeout(() => {
        if (!cancelled) send();
      }, ms),
    );
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [html, isStreaming]);

  // Reset the posted-lines memo whenever the underlying resource changes
  // (new card → new iframe → replay from scratch).
  useEffect(() => {
    postedLinesRef.current = new Set();
    hostReadyRef.current = false;
  }, [html]);

  // Forward any NEW status lines to the iframe. The iframe side dedups
  // internally too, but we also gate here to avoid spamming postMessage
  // every render. We don't gate on isStreaming — status updates are the
  // whole point of the streaming state.
  useEffect(() => {
    if (!statusLines || statusLines.length === 0) return;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    const fresh: string[] = [];
    for (const line of statusLines) {
      if (!line) continue;
      const key = line.trim();
      if (!key) continue;
      if (postedLinesRef.current.has(key)) continue;
      postedLinesRef.current.add(key);
      fresh.push(key);
    }
    if (fresh.length === 0) return;
    try {
      target.postMessage({ type: "status", payload: { lines: fresh } }, "*");
    } catch {
      /* ignore */
    }
  }, [statusLines]);

  // Flip the card to a "done" state when the host declares completion.
  useEffect(() => {
    if (!completedText) return;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    try {
      target.postMessage({ type: "deck-ready", payload: { text: completedText } }, "*");
    } catch {
      /* ignore */
    }
  }, [completedText]);

  // Forward theme changes to the iframe via postMessage so it can
  // update its styles without a full reload.
  useEffect(() => {
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    try {
      target.postMessage({ type: "theme", payload: { theme: isDark ? "dark" : "light" } }, "*");
    } catch { /* ignore */ }
  }, [isDark]);

  if (!themedHtml) {
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
        sandbox="allow-scripts allow-forms allow-downloads allow-popups"
        srcDoc={themedHtml}
        onLoad={handleIframeLoad}
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
