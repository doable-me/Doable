"use client";

import { useState } from "react";
import {
  RefreshCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
} from "lucide-react";

type DeviceMode = "desktop" | "tablet" | "mobile";

interface PreviewToolbarProps {
  url: string;
  loading: boolean;
  onRefresh: () => void;
  onOpenExternal: () => void;
  deviceMode: DeviceMode;
  onDeviceModeChange: (mode: DeviceMode) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

const devices: { mode: DeviceMode; icon: typeof Monitor; label: string }[] = [
  { mode: "desktop", icon: Monitor, label: "Desktop" },
  { mode: "tablet", icon: Tablet, label: "Tablet" },
  { mode: "mobile", icon: Smartphone, label: "Mobile" },
];

export function PreviewToolbar({
  url,
  loading,
  onRefresh,
  onOpenExternal,
  deviceMode,
  onDeviceModeChange,
  isFullscreen,
  onToggleFullscreen,
}: PreviewToolbarProps) {
  return (
    <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/20 px-2">
      {/* Refresh */}
      <button
        onClick={onRefresh}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Refresh preview"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
        />
      </button>

      {/* URL display */}
      <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 min-w-0">
        <Globe className="h-3 w-3 flex-none text-muted-foreground" />
        <span className="truncate text-[11px] text-muted-foreground font-mono">
          {url || "No preview available"}
        </span>
      </div>

      {/* Device toggle */}
      <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
        {devices.map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => onDeviceModeChange(mode)}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              deviceMode === mode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={label}
          >
            <Icon className="h-3 w-3" />
          </button>
        ))}
      </div>

      {/* Fullscreen */}
      <button
        onClick={onToggleFullscreen}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Open external */}
      <button
        onClick={onOpenExternal}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Open in new tab"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
