"use client";

import { useEffect, useRef } from "react";
import { useCollaboration } from "../collaboration-context";

// ─── CollabPreviewSync ──────────────────────────────────────
// Two-way bridge: broadcasts local visual edits to collaborators
// AND applies incoming remote edits to the local iframe.
// Non-intrusive — hooks into postMessage events without modifying
// the existing applyLiveStyle/applyLiveText flow.

// Rendered as a component INSIDE CollaborationProvider so it has context access.
// Handles ALL visual edit collaboration: selections, style/text changes,
// cursor tracking, and preview refresh — everything in one place.
export function CollabPreviewSync({ iframeRef }: { iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  const {
    subscribe,
    joined,
    send,
    sendVisualEditSelect,
    sendVisualEditDeselect,
    sendVisualEditStyleChange,
    sendVisualEditTextChange,
    sendVisualEditCursorMove,
  } = useCollaboration();

  const selectedSelectorRef = useRef<string | null>(null);
  const lastCursorRef = useRef(0);

  // ── Listen for iframe postMessages: track selections + broadcast them ──
  useEffect(() => {
    if (!joined) return;

    const handler = (e: MessageEvent) => {
      if (!e.data?.type) return;

      switch (e.data.type) {
        case "visual-edit:element-selected": {
          const sel = e.data.element;
          if (sel?.selector) {
            selectedSelectorRef.current = sel.selector;
            const r = sel.boundingRect;
            sendVisualEditSelect(sel.selector, {
              x: r?.left ?? r?.x ?? 0,
              y: r?.top ?? r?.y ?? 0,
              width: r?.width ?? 0,
              height: r?.height ?? 0,
            });
          }
          break;
        }
        case "visual-edit:element-deselected":
          selectedSelectorRef.current = null;
          sendVisualEditDeselect();
          break;
        case "visual-edit:cursor-in-preview": {
          // Iframe bridge relays mouse position
          const now = Date.now();
          if (now - lastCursorRef.current < 50) break;
          lastCursorRef.current = now;
          sendVisualEditCursorMove(e.data.x, e.data.y);
          break;
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [joined, sendVisualEditSelect, sendVisualEditDeselect, sendVisualEditCursorMove]);

  // ── Broadcast style/text changes via custom events from use-visual-edit ──
  useEffect(() => {
    if (!joined) return;
    const onStyle = (e: Event) => {
      const { property, value } = (e as CustomEvent).detail;
      const sel = selectedSelectorRef.current;
      if (sel) sendVisualEditStyleChange(sel, property, value);
    };
    const onText = (e: Event) => {
      const { text } = (e as CustomEvent).detail;
      const sel = selectedSelectorRef.current;
      if (sel) sendVisualEditTextChange(sel, text);
    };
    window.addEventListener("doable:ve-style", onStyle);
    window.addEventListener("doable:ve-text", onText);
    return () => {
      window.removeEventListener("doable:ve-style", onStyle);
      window.removeEventListener("doable:ve-text", onText);
    };
  }, [joined, sendVisualEditStyleChange, sendVisualEditTextChange]);

  // ── Broadcast preview refresh on save ──
  useEffect(() => {
    if (!joined) return;
    const onRefresh = () => send({ type: "visual-edit:preview-refresh" });
    window.addEventListener("doable:preview-refresh", onRefresh);
    return () => window.removeEventListener("doable:preview-refresh", onRefresh);
  }, [joined, send]);

  // ── Receive remote edits + refresh signals ──
  useEffect(() => {
    if (!joined) return;

    const unsub = subscribe((msg: any) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;

      switch (msg.type) {
        case "visual-edit:style-change":
          iframe.contentWindow.postMessage({ type: "visual-edit:select-element", selector: msg.selector }, "*");
          iframe.contentWindow.postMessage({ type: "visual-edit:apply-style", property: msg.property, value: msg.value }, "*");
          break;
        case "visual-edit:text-change":
          iframe.contentWindow.postMessage({ type: "visual-edit:select-element", selector: msg.selector }, "*");
          iframe.contentWindow.postMessage({ type: "visual-edit:apply-text", text: msg.newText }, "*");
          break;
        case "visual-edit:preview-refresh":
          setTimeout(() => { iframe.src = iframe.src; }, 500);
          break;
      }
    });

    return unsub;
  }, [joined, subscribe, iframeRef]);

  return null;
}
