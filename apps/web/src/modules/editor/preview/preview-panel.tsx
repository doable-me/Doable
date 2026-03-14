"use client";

import { useCallback, useState } from "react";
import { useEditorStore } from "../hooks/use-editor-store";
import { usePreview } from "../hooks/use-preview";
import { PreviewToolbar } from "./preview-toolbar";
import { Eye, Loader2, AlertTriangle } from "lucide-react";

type DeviceMode = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<DeviceMode, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

export function PreviewPanel() {
  const projectId = useEditorStore((s) => s.projectId);
  const { iframeRef, previewUrl, previewLoading, refresh, onLoad, openExternal } =
    usePreview(projectId);

  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleRefresh = useCallback(() => {
    setHasError(false);
    refresh();
  }, [refresh]);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const containerClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background flex flex-col"
    : "flex h-full flex-col";

  if (!projectId) {
    return <EmptyPreview />;
  }

  return (
    <div className={containerClass}>
      <PreviewToolbar
        url={previewUrl}
        loading={previewLoading}
        onRefresh={handleRefresh}
        onOpenExternal={openExternal}
        deviceMode={deviceMode}
        onDeviceModeChange={setDeviceMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* Preview frame */}
      <div className="flex flex-1 items-center justify-center overflow-hidden bg-muted/10 p-2">
        <div
          className="relative h-full overflow-hidden rounded-md border border-border bg-white shadow-sm transition-all duration-300"
          style={{
            width: DEVICE_WIDTHS[deviceMode],
            maxWidth: "100%",
          }}
        >
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

          {/* iframe */}
          <iframe
            ref={iframeRef}
            src={previewUrl}
            onLoad={onLoad}
            onError={handleError}
            className="h-full w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Project preview"
          />
        </div>
      </div>
    </div>
  );
}

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
