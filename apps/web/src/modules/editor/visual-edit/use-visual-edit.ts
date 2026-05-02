import { useState, useCallback, useEffect, useRef } from "react";
import type { SelectedElement, VisualEditMode, BridgeToParentMessage } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface UseVisualEditOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  projectId: string;
  onSendMessage: (message: string) => void;
  onSaveComplete?: () => void;
}

interface PendingChange {
  property: string;
  value: string;
}

interface UseVisualEditReturn {
  mode: VisualEditMode;
  selectedElement: SelectedElement | null;
  hoveredElement: SelectedElement | null;
  bridgeReady: boolean;
  activateVisualEdit: () => void;
  deactivateVisualEdit: () => void;
  selectParent: () => void;
  deselectElement: () => void;
  deleteElement: () => void;
  sendElementPrompt: (prompt: string) => void;
  injectBridge: () => void;
  highlightElement: (selector: string) => void;
  applyLiveStyle: (property: string, value: string) => void;
  applyLiveText: (text: string) => void;
  revertChanges: () => void;
  hasPendingChanges: boolean;
  pendingChanges: PendingChange[];
  commitChanges: () => void;
  discardChanges: () => void;
  directSave: () => Promise<boolean>;
  isSaving: boolean;
}

export function useVisualEdit({ iframeRef, projectId, onSendMessage, onSaveComplete }: UseVisualEditOptions): UseVisualEditReturn {
  const [mode, setMode] = useState<VisualEditMode>("idle");
  const [selectedElement, setSelectedElement] = useState<SelectedElement | null>(null);
  const [hoveredElement, setHoveredElement] = useState<SelectedElement | null>(null);
  const [bridgeReady, setBridgeReady] = useState(false);
  const enablePendingRef = useRef(false);

  // ─── Listen for messages from iframe ───────────────────────
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data as BridgeToParentMessage;
      if (!msg || !msg.type || !msg.type.startsWith("visual-edit:")) return;

      switch (msg.type) {
        case "visual-edit:ready":
          setBridgeReady(true);
          // If we were waiting to enable selection, do it now
          if (enablePendingRef.current) {
            enablePendingRef.current = false;
            const iframe = iframeRef.current;
            if (iframe?.contentWindow) {
              iframe.contentWindow.postMessage({ type: "visual-edit:enable-selection" }, "*");
            }
          }
          break;
        case "visual-edit:element-hovered":
          setHoveredElement(msg.element);
          break;
        case "visual-edit:element-selected":
          setSelectedElement(msg.element);
          setMode("editing");
          break;
        case "visual-edit:element-deselected":
          setSelectedElement(null);
          setMode("selecting");
          break;
        case "visual-edit:parent-selected":
          setSelectedElement(msg.element);
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [iframeRef]);

  // ─── Send message to iframe ────────────────────────────────
  const sendToIframe = useCallback(
    (message: Record<string, unknown>) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.postMessage(message, "*");
    },
    [iframeRef],
  );

  // ─── Activate visual edit mode ─────────────────────────────
  const activateVisualEdit = useCallback(() => {
    setMode("selecting");
    setSelectedElement(null);
    setHoveredElement(null);
    enablePendingRef.current = true;

    // Send enable-selection immediately (works if bridge is already listening)
    sendToIframe({ type: "visual-edit:enable-selection" });

    // Also force-refresh the iframe to ensure a fresh bridge load.
    // This guarantees the bridge sends new `ready` messages that our
    // hook listener will catch, fixing the timing issue where the
    // initial `ready` fired before the hook was mounted.
    const iframe = iframeRef.current;
    if (iframe) {
      const url = new URL(iframe.src);
      url.searchParams.set("_ve", Date.now().toString());
      iframe.src = url.toString();
    }
  }, [sendToIframe, iframeRef]);

  // ─── Deactivate visual edit mode ───────────────────────────
  const deactivateVisualEdit = useCallback(() => {
    setMode("idle");
    setSelectedElement(null);
    setHoveredElement(null);
    enablePendingRef.current = false;
    sendToIframe({ type: "visual-edit:disable-selection" });
  }, [sendToIframe]);

  // ─── Select parent element ─────────────────────────────────
  const selectParent = useCallback(() => {
    sendToIframe({ type: "visual-edit:select-parent" });
  }, [sendToIframe]);

  // ─── Deselect element ──────────────────────────────────────
  const deselectElement = useCallback(() => {
    setSelectedElement(null);
    setMode("selecting");
    sendToIframe({ type: "visual-edit:deselect" });
  }, [sendToIframe]);

  // ─── Delete element (via AI prompt) ────────────────────────
  const deleteElement = useCallback(() => {
    if (!selectedElement) return;
    const desc = selectedElement.className
      ? `the <${selectedElement.tagName}> element with class "${selectedElement.className.split(" ").slice(0, 3).join(" ")}"`
      : `the <${selectedElement.tagName}> element`;
    onSendMessage(`Remove ${desc} from the page`);
    setSelectedElement(null);
    setMode("selecting");
    sendToIframe({ type: "visual-edit:deselect" });
  }, [selectedElement, onSendMessage, sendToIframe]);

  // ─── Send AI prompt about selected element ─────────────────
  const sendElementPrompt = useCallback(
    (prompt: string) => {
      if (!selectedElement || !prompt.trim()) return;
      const desc = selectedElement.className
        ? `the <${selectedElement.tagName}> element with class "${selectedElement.className.split(" ").slice(0, 3).join(" ")}"`
        : `the <${selectedElement.tagName}> element`;
      // Build a detailed prompt with element context
      const fullPrompt = `[Visual Edit] For ${desc} (selector: ${selectedElement.selector}): ${prompt.trim()}`;
      onSendMessage(fullPrompt);
      // Deselect after sending so the user can see the AI work
      setSelectedElement(null);
      setMode("idle");
      sendToIframe({ type: "visual-edit:disable-selection" });
    },
    [selectedElement, onSendMessage, sendToIframe],
  );

  // No-op injectBridge — bridge is now injected by the API server
  const injectBridge = useCallback(() => {}, []);

  // ─── Highlight element by selector ────────────────────────
  const highlightElement = useCallback(
    (selector: string) => {
      sendToIframe({ type: "visual-edit:highlight-element", selector });
    },
    [sendToIframe],
  );

  // ─── Live DOM editing (Phase 1: instant preview) ──────────
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [pendingText, setPendingText] = useState<string | null>(null);

  const hasPendingChanges = pendingChanges.length > 0 || pendingText !== null;

  const applyLiveStyle = useCallback(
    (property: string, value: string) => {
      sendToIframe({ type: "visual-edit:apply-style", property, value });
      window.dispatchEvent(new CustomEvent("doable:ve-style", { detail: { property, value } }));
      setPendingChanges((prev) => {
        const existing = prev.findIndex((c) => c.property === property);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { property, value };
          return updated;
        }
        return [...prev, { property, value }];
      });
    },
    [sendToIframe],
  );

  const applyLiveText = useCallback(
    (text: string) => {
      sendToIframe({ type: "visual-edit:apply-text", text });
      window.dispatchEvent(new CustomEvent("doable:ve-text", { detail: { text } }));
      setPendingText(text);
    },
    [sendToIframe],
  );

  const revertChanges = useCallback(() => {
    sendToIframe({ type: "visual-edit:revert-changes" });
    setPendingChanges([]);
    setPendingText(null);
  }, [sendToIframe]);

  const commitChanges = useCallback(() => {
    if (!selectedElement) return;
    const desc = selectedElement.className
      ? `the <${selectedElement.tagName}> element with class "${selectedElement.className.split(" ").slice(0, 3).join(" ")}"`
      : `the <${selectedElement.tagName}> element`;
    const parts: string[] = [];
    if (pendingText !== null) {
      parts.push(`text content to "${pendingText}"`);
    }
    for (const change of pendingChanges) {
      parts.push(`${change.property} to ${change.value}`);
    }
    if (parts.length === 0) return;
    const prompt = `[Visual Edit] For ${desc} (selector: ${selectedElement.selector}): Change ${parts.join(", ")}`;
    onSendMessage(prompt);
    // Clear pending state but don't revert DOM (AI will rebuild)
    setPendingChanges([]);
    setPendingText(null);
    setSelectedElement(null);
    setMode("idle");
    sendToIframe({ type: "visual-edit:disable-selection" });
  }, [selectedElement, pendingChanges, pendingText, onSendMessage, sendToIframe]);

  const discardChanges = useCallback(() => {
    revertChanges();
  }, [revertChanges]);

  // ─── Direct save (no AI — reads file, applies change, writes back) ─
  const [isSaving, setIsSaving] = useState(false);

  const directSave = useCallback(async (): Promise<boolean> => {
    if (!selectedElement || (!pendingText && pendingChanges.length === 0)) return false;
    if (!selectedElement.sourceLocation) {
      console.warn("[Visual Edit] No source location - use AI Save instead");
      return false;
    }
    setIsSaving(true);
    try {
      const { getStoredTokens } = await import("@/lib/api");
      const { accessToken } = getStoredTokens();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const changes: Array<
        | { type: "text"; oldText: string; newText: string }
        | { type: "style"; property: string; value: string }
      > = [];
      if (pendingText !== null) {
        changes.push({
          type: "text" as const,
          oldText: selectedElement.textContent,
          newText: pendingText,
        });
      }
      for (const change of pendingChanges) {
        changes.push({
          type: "style" as const,
          property: change.property,
          value: change.value,
        });
      }

      const res = await fetch(`${API_URL}/projects/${projectId}/direct-save`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          sourceLocation: selectedElement.sourceLocation,
          changes,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }

      const json = await res.json();
      const result = json.data ?? json;
      if (!result.success) {
        throw new Error(result.applied?.find((a: { success: boolean; reason?: string }) => !a.success)?.reason || "Save failed");
      }

      // Clear pending state
      setPendingChanges([]);
      setPendingText(null);

      // HMR will auto-refresh, but force a refresh after a small delay as fallback
      const iframe = iframeRef.current;
      if (iframe) {
        setTimeout(() => { iframe.src = iframe.src; }, 1000);
      }

      // Notify collaborators to refresh their preview
      onSaveComplete?.();

      return true;
    } catch (err) {
      console.error("[Visual Edit] Direct save failed:", err);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [selectedElement, pendingText, pendingChanges, projectId, iframeRef]);

  // ─── Track iframe reloads — bridge auto-reloads via <script> tag ──
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      setBridgeReady(false);
      if (mode !== "idle") {
        // Bridge will re-initialize via the <script> tag in the HTML
        // Just set pending so we enable selection when ready message arrives
        enablePendingRef.current = true;
      }
    };

    iframe.addEventListener("load", handleLoad);
    return () => iframe.removeEventListener("load", handleLoad);
  }, [iframeRef, mode]);

  return {
    mode,
    selectedElement,
    hoveredElement,
    bridgeReady,
    activateVisualEdit,
    deactivateVisualEdit,
    selectParent,
    deselectElement,
    deleteElement,
    sendElementPrompt,
    injectBridge,
    highlightElement,
    applyLiveStyle,
    applyLiveText,
    revertChanges,
    hasPendingChanges,
    pendingChanges,
    commitChanges,
    discardChanges,
    directSave,
    isSaving,
  };
}
