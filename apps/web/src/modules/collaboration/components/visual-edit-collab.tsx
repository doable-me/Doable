"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import {
  useCollaboration,
  type RemoteVisualSelection,
  type RemoteVisualCursor,
} from "../collaboration-context";

// ─── RemoteSelectionOverlays ──────────────────────────────────────
// Renders colored selection outlines over elements that other users
// have selected in visual edit mode.

interface RemoteSelectionOverlaysProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

export function RemoteSelectionOverlays({ iframeRef }: RemoteSelectionOverlaysProps) {
  const { remoteSelections } = useCollaboration();
  const [positions, setPositions] = useState<
    Map<string, { x: number; y: number; width: number; height: number }>
  >(new Map());

  // Ask the iframe for the current bounding rect of each selector
  const updatePositions = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    remoteSelections.forEach((sel, userId) => {
      try {
        iframe.contentWindow!.postMessage(
          {
            type: "__doable_get_element_rect",
            selector: sel.selector,
            userId,
          },
          "*",
        );
      } catch {
        // iframe may be cross-origin or not ready
      }
    });
  }, [iframeRef, remoteSelections]);

  // Listen for rect responses from the iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === "__doable_element_rect_response") {
        const { userId, rect } = e.data as {
          type: string;
          userId: string;
          rect: { x: number; y: number; width: number; height: number } | null;
        };
        if (rect) {
          setPositions((prev) => {
            const next = new Map(prev);
            next.set(userId, rect);
            return next;
          });
        } else {
          setPositions((prev) => {
            const next = new Map(prev);
            next.delete(userId);
            return next;
          });
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Refresh positions on resize and selection changes (no contentDocument access — cross-origin)
  useEffect(() => {
    updatePositions();
    const handleResize = () => updatePositions();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updatePositions]);

  // Also re-request on an interval for scroll-inside-iframe scenarios
  useEffect(() => {
    const interval = setInterval(updatePositions, 500);
    return () => clearInterval(interval);
  }, [updatePositions]);

  const entries = useMemo(() => {
    const result: Array<{
      userId: string;
      selection: RemoteVisualSelection;
      rect: { x: number; y: number; width: number; height: number };
    }> = [];

    remoteSelections.forEach((sel, userId) => {
      // Use live position from iframe if available, fall back to broadcast rect
      const rect = positions.get(userId) ?? sel.boundingRect;
      result.push({ userId, selection: sel, rect });
    });

    return result;
  }, [remoteSelections, positions]);

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(({ userId, selection, rect }) => (
        <div
          key={userId}
          className="pointer-events-none absolute z-40"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            border: `2px solid ${selection.color}`,
            backgroundColor: `${selection.color}30`,
            transition: "left 150ms ease, top 150ms ease, width 150ms ease, height 150ms ease",
          }}
        >
          {/* Name label above the top-left corner */}
          <span
            className="absolute -top-6 left-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-md"
            style={{ backgroundColor: selection.color }}
          >
            {selection.displayName}
          </span>
        </div>
      ))}
    </>
  );
}

// ─── RemoteVisualCursors ──────────────────────────────────────────
// Renders remote user cursors in the preview area.

interface RemoteVisualCursorsProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

export function RemoteVisualCursors({ iframeRef }: RemoteVisualCursorsProps) {
  const { remoteVisualCursors } = useCollaboration();

  const entries = useMemo(() => {
    const result: Array<{
      userId: string;
      cursor: RemoteVisualCursor;
    }> = [];
    remoteVisualCursors.forEach((cursor, userId) => {
      result.push({ userId, cursor });
    });
    return result;
  }, [remoteVisualCursors]);

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(({ userId, cursor }) => (
        <div
          key={userId}
          className="pointer-events-none absolute z-50"
          style={{
            left: cursor.x,
            top: cursor.y,
            transition: "left 80ms linear, top 80ms linear",
          }}
        >
          {/* Arrow cursor icon */}
          <svg
            width="16"
            height="20"
            viewBox="0 0 16 20"
            fill="none"
            className="drop-shadow-md"
          >
            <path
              d="M0.5 0.5L15 10.5L8 11.5L5.5 19L0.5 0.5Z"
              fill={cursor.color}
              stroke="white"
              strokeWidth="1"
            />
          </svg>
          {/* Name label */}
          <span
            className="absolute left-4 top-3 flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap shadow-md"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.displayName}
          </span>
        </div>
      ))}
    </>
  );
}

// ─── VisualEditConflictWarning ────────────────────────────────────
// Shows a warning when you select an element another user is editing.

interface VisualEditConflictWarningProps {
  selectedSelector: string | null;
}

export function VisualEditConflictWarning({ selectedSelector }: VisualEditConflictWarningProps) {
  const { remoteSelections } = useCollaboration();

  const conflict = useMemo(() => {
    if (!selectedSelector) return null;

    let found: RemoteVisualSelection | null = null;
    remoteSelections.forEach((sel) => {
      if (sel.selector === selectedSelector) {
        found = sel;
      }
    });
    return found as RemoteVisualSelection | null;
  }, [selectedSelector, remoteSelections]);

  if (!conflict) return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-4 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div
        className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
        style={{ borderColor: conflict.color }}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: conflict.color }}
        />
        <span className="text-zinc-300">
          <span className="font-semibold text-white">{conflict.displayName}</span>{" "}
          is editing this element
        </span>
      </div>
    </div>
  );
}

// ─── useVisualEditBroadcast ───────────────────────────────────────
// Hook that wraps visual edit actions to broadcast them to collaborators.

interface UseVisualEditBroadcastOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

interface UseVisualEditBroadcastReturn {
  broadcastSelect: (selector: string, boundingRect: { x: number; y: number; width: number; height: number }) => void;
  broadcastDeselect: () => void;
  broadcastStyleChange: (selector: string, property: string, value: string) => void;
  broadcastTextChange: (selector: string, newText: string) => void;
  handlePreviewMouseMove: (e: React.MouseEvent | MouseEvent) => void;
}

export function useVisualEditBroadcast({
  iframeRef,
}: UseVisualEditBroadcastOptions): UseVisualEditBroadcastReturn {
  const {
    sendVisualEditSelect,
    sendVisualEditDeselect,
    sendVisualEditStyleChange,
    sendVisualEditTextChange,
    sendVisualEditCursorMove,
  } = useCollaboration();

  // Throttle cursor broadcasts to 50ms
  const lastCursorSendRef = useRef(0);

  const broadcastSelect = useCallback(
    (selector: string, boundingRect: { x: number; y: number; width: number; height: number }) => {
      sendVisualEditSelect(selector, boundingRect);
    },
    [sendVisualEditSelect],
  );

  const broadcastDeselect = useCallback(() => {
    sendVisualEditDeselect();
  }, [sendVisualEditDeselect]);

  const broadcastStyleChange = useCallback(
    (selector: string, property: string, value: string) => {
      sendVisualEditStyleChange(selector, property, value);
    },
    [sendVisualEditStyleChange],
  );

  const broadcastTextChange = useCallback(
    (selector: string, newText: string) => {
      sendVisualEditTextChange(selector, newText);
    },
    [sendVisualEditTextChange],
  );

  const handlePreviewMouseMove = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const now = Date.now();
      if (now - lastCursorSendRef.current < 50) return;
      lastCursorSendRef.current = now;

      const iframe = iframeRef.current;
      if (!iframe) return;

      const iframeRect = iframe.getBoundingClientRect();
      const x = e.clientX - iframeRect.left;
      const y = e.clientY - iframeRect.top;

      sendVisualEditCursorMove(x, y);
    },
    [iframeRef, sendVisualEditCursorMove],
  );

  // Clean up: deselect on unmount
  useEffect(() => {
    return () => {
      sendVisualEditDeselect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    broadcastSelect,
    broadcastDeselect,
    broadcastStyleChange,
    broadcastTextChange,
    handlePreviewMouseMove,
  };
}

// ─── useRemoteVisualEdits ──────────────────────────────────────
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
