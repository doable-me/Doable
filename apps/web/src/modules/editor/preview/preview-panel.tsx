"use client";

import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import { useEditorStore } from "../hooks/use-editor-store";
import { usePreview } from "../hooks/use-preview";
import { PreviewToolbar } from "./preview-toolbar";
import { Eye, Loader2, AlertTriangle } from "lucide-react";
import type { DeviceMode } from "@/modules/editor/visual-edit/types";
import { DEVICE_WIDTHS } from "@/modules/editor/visual-edit/types";

// ─── Component ──────────────────────────────────────────────

export function PreviewPanel() {
  const projectId = useEditorStore((s) => s.projectId);
  const fileTree = useEditorStore((s) => s.fileTree);
  const isStreaming = useEditorStore((s) => s.isStreaming);
  const { iframeRef, previewUrl, previewLoading, refresh, navigate, onLoad, openExternal } =
    usePreview(projectId);

  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const prevStreamingRef = useRef(isStreaming);
  const hmrConnectedRef = useRef(false);
  const lastHmrUpdateRef = useRef(0);

  // ─── Listen for HMR signals from preview iframe ───────────
  // The preview injects a script that detects HMR WebSocket activity
  // and posts messages to the parent frame. When HMR is active, we skip
  // full-page reloads and let the dev server handle live updates automatically.
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;
      // Only accept messages from our preview iframe
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      if (e.data.type === "doable-hmr-connected") {
        hmrConnectedRef.current = true;
      } else if (e.data.type === "doable-hmr-update") {
        lastHmrUpdateRef.current = Date.now();
        hmrConnectedRef.current = true;
      } else if (e.data.type === "doable-theme-ready") {
        // Bridge announced ready — pin its theme to light (see useEffect below for why).
        try {
          iframeRef.current?.contentWindow?.postMessage(
            { type: "doable-theme", theme: "light" },
            "*",
          );
        } catch { /* ignore */ }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [iframeRef]);

  // ─── Sync Doable theme into preview iframe ─────────────────
  // Always push `light` — the editor's dark theme is Doable chrome, not the
  // user's app. AI-scaffolded `.dark` rules typically only flip `--foreground`
  // while leaving `--background` light, so forcing dark on the iframe yields
  // invisible (white-on-white) text. The user's preview shows their app's
  // intended (light) theme regardless of editor chrome.
  useEffect(() => {
    function pushLight() {
      try {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "doable-theme", theme: "light" },
          "*",
        );
      } catch { /* ignore */ }
    }
    pushLight();
  }, [iframeRef, previewUrl]);

  // Reset HMR state when iframe reloads (e.g. new project, manual refresh)
  const onLoadWithHmrReset = useCallback(() => {
    hmrConnectedRef.current = false;
    onLoad();
  }, [onLoad]);

  // ─── Auto-refresh after AI code generation ──────────────────
  // When streaming transitions from true -> false, the AI finished.
  // If HMR was delivering updates, skip the reload — the preview is
  // already up to date. Otherwise do one final refresh as a safety net.
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      const recentHmr = Date.now() - lastHmrUpdateRef.current < 5000;
      if (!recentHmr) {
        // No HMR activity during this stream — do a full refresh
        const timer = setTimeout(() => {
          setHasError(false);
          refresh();
        }, 800);
        return () => clearTimeout(timer);
      }
      // HMR was active — preview is already current, no refresh needed
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, refresh]);

  // ─── Fallback refresh during streaming (only when HMR is not active) ─
  // If HMR is connected, the dev server pushes updates automatically — no polling needed.
  // If HMR is NOT connected (first build, dev server just started), fall back
  // to refreshing on tool_result events so the user still sees progress.
  const toolResultVersion = useEditorStore((s) => s.toolResultVersion);
  const prevToolResultRef = useRef(toolResultVersion);
  useEffect(() => {
    if (!isStreaming || toolResultVersion === prevToolResultRef.current) return;
    prevToolResultRef.current = toolResultVersion;
    // Only do a full refresh if HMR is not connected
    if (hmrConnectedRef.current) return;
    const timer = setTimeout(() => {
      setHasError(false);
      refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [isStreaming, toolResultVersion, refresh]);

  // ─── Route detection from file tree ─────────────────────────
  const routes = useMemo(() => {
    const entries: { label: string; path: string }[] = [];
    function walk(nodes: typeof fileTree) {
      for (const node of nodes) {
        if (node.type === "directory" && node.children) {
          walk(node.children);
        }
        if (node.type !== "file") continue;
        const lowerPath = node.path.toLowerCase().replace(/\\/g, "/");
        if (lowerPath.includes("src/pages/")) {
          const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
          if (!["tsx", "jsx", "ts", "js"].includes(ext)) continue;
          const baseName = node.name.replace(/\.[^.]+$/, "");
          const lower = baseName.toLowerCase();
          const route =
            lower === "home" || lower === "index"
              ? "/"
              : `/${baseName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()}`;
          entries.push({ label: baseName, path: route });
        }
      }
    }
    walk(fileTree);
    // Always include root
    if (!entries.some((e) => e.path === "/")) {
      entries.unshift({ label: "Home", path: "/" });
    }
    entries.sort((a, b) => {
      if (a.path === "/") return -1;
      if (b.path === "/") return 1;
      return a.label.localeCompare(b.label);
    });
    return entries;
  }, [fileTree]);

  // ─── Fullscreen toggle ──────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);

  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ─── Event handlers ─────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setHasError(false);
    refresh();
  }, [refresh]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleNavigate = useCallback(
    (path: string) => {
      const routePath = path === "/" ? "" : path;
      navigate(routePath);
    },
    [navigate],
  );

  // ─── Render ─────────────────────────────────────────────────

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background flex flex-col"
    : "flex h-full flex-col";

  if (!projectId) {
    return <EmptyPreview />;
  }

  const isMobileDevice = deviceMode === "mobile";
  const isTabletDevice = deviceMode === "tablet";
  const isSmallDevice = isMobileDevice || isTabletDevice;

  return (
    <div ref={containerRef} className={containerClass}>
      <PreviewToolbar
        url={previewUrl}
        loading={previewLoading}
        onRefresh={handleRefresh}
        onOpenExternal={openExternal}
        deviceMode={deviceMode}
        onDeviceModeChange={setDeviceMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        routes={routes}
        onNavigate={handleNavigate}
      />

      {/* Preview frame */}
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/10 p-2">
        {/* Device frame wrapper for mobile/tablet */}
        <div
          className={`relative h-full overflow-hidden transition-all duration-300 ${
            isMobileDevice
              ? "rounded-[24px] border-4 border-border shadow-2xl shadow-md"
              : isTabletDevice
                ? "rounded-2xl border-[3px] border-border shadow-xl shadow-md"
                : "rounded-md border border-border shadow-sm"
          } bg-white`}
          style={{
            width: DEVICE_WIDTHS[deviceMode],
            maxWidth: "100%",
            maxHeight: isMobileDevice ? "calc(100% - 16px)" : undefined,
          }}
        >
          {/* Mobile notch */}
          {isMobileDevice && (
            <div className="absolute top-0 left-1/2 z-20 -translate-x-1/2">
              <div className="h-[22px] w-[120px] rounded-b-xl bg-foreground" />
            </div>
          )}

          {/* Loading overlay */}
          {previewLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">
                  Loading preview...
                </span>
              </div>
            </div>
          )}

          {/* Streaming indicator */}
          {isStreaming && !previewLoading && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-primary/90 px-2.5 py-1 shadow-md">
              <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] font-medium text-white">AI generating...</span>
            </div>
          )}

          {/* Error state */}
          {hasError && !previewLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  Preview unavailable
                </p>
                <p className="text-xs text-muted-foreground">
                  The preview server may not be running.
                </p>
                <button
                  onClick={handleRefresh}
                  className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {/* iframe — bridge script is auto-injected by the API preview proxy */}
          <iframe
            ref={iframeRef}
            src={previewUrl}
            onLoad={onLoadWithHmrReset}
            onError={handleError}
            className="h-full w-full border-0"
            // Pin color-scheme so the embedded preview's `prefers-color-scheme: dark`
            // doesn't inherit from the editor's dark theme — that triggers AI scaffolds'
            // media-based dark CSS and renders text invisibly. Theme propagation goes via
            // the visual-edit bridge's class-based `.dark` mirror instead.
            style={{ colorScheme: "light" }}
            // allow-same-origin: required so user apps that use localStorage
            // don't crash in the iframe (opaque-origin Storage throws and the
            // in-memory polyfill can't redefine the non-configurable getter).
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-fullscreen"
            title="Project preview"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────

function EmptyPreview() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center px-6">
      <Eye className="h-10 w-10 text-muted-foreground/30" />
      <h3 className="mt-3 text-sm font-medium text-foreground">
        Live Preview
      </h3>
      <p className="mt-1 text-xs text-muted-foreground max-w-[200px]">
        Your app preview will appear here as the AI generates code.
      </p>
    </div>
  );
}
