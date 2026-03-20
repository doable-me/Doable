"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  RefreshCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  MousePointer2,
  ChevronDown,
} from "lucide-react";
import type { DeviceMode } from "@/modules/editor/visual-edit/types";

// ─── Types ──────────────────────────────────────────────────

interface RouteEntry {
  label: string;
  path: string;
}

interface PreviewToolbarProps {
  url: string;
  loading: boolean;
  onRefresh: () => void;
  onOpenExternal: () => void;
  deviceMode: DeviceMode;
  onDeviceModeChange: (mode: DeviceMode) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  // Visual edit
  visualEditActive?: boolean;
  onToggleVisualEdit?: () => void;
  // Route navigation
  routes?: RouteEntry[];
  onNavigate?: (path: string) => void;
}

// ─── Device Definitions ─────────────────────────────────────

const devices: { mode: DeviceMode; icon: typeof Monitor; label: string }[] = [
  { mode: "desktop", icon: Monitor, label: "Desktop" },
  { mode: "tablet", icon: Tablet, label: "Tablet (768px)" },
  { mode: "mobile", icon: Smartphone, label: "Mobile (375px)" },
];

// ─── Component ──────────────────────────────────────────────

export function PreviewToolbar({
  url,
  loading,
  onRefresh,
  onOpenExternal,
  deviceMode,
  onDeviceModeChange,
  isFullscreen,
  onToggleFullscreen,
  visualEditActive = false,
  onToggleVisualEdit,
  routes = [],
  onNavigate,
}: PreviewToolbarProps) {
  const [showRouteDropdown, setShowRouteDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showRouteDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowRouteDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRouteDropdown]);

  const handleRouteSelect = useCallback(
    (path: string) => {
      setShowRouteDropdown(false);
      onNavigate?.(path);
    },
    [onNavigate],
  );

  // Extract the displayed path from the URL
  const displayPath = (() => {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      // Strip /preview/:projectId prefix if present
      const path = parsed.pathname.replace(/^\/preview\/[^/]+/, "") || "/";
      return path;
    } catch {
      return url;
    }
  })();

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

      {/* URL display / Route navigation */}
      <div className="relative flex flex-1 min-w-0" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => {
            if (routes.length > 0) setShowRouteDropdown(!showRouteDropdown);
          }}
          className="flex w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 min-w-0 hover:bg-accent/50 transition-colors"
        >
          <Globe className="h-3 w-3 flex-none text-muted-foreground" />
          <span className="truncate text-[11px] text-muted-foreground font-mono flex-1 text-left">
            {displayPath || url || "No preview available"}
          </span>
          {routes.length > 0 && (
            <ChevronDown className="h-3 w-3 flex-none text-muted-foreground" />
          )}
        </button>

        {/* Route dropdown */}
        {showRouteDropdown && routes.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background shadow-lg">
            {routes.map((route) => (
              <button
                key={route.path}
                type="button"
                onClick={() => handleRouteSelect(route.path)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors"
              >
                <span className="font-mono text-muted-foreground">{route.path}</span>
                <span className="text-foreground truncate">{route.label}</span>
              </button>
            ))}
          </div>
        )}
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

      {/* Visual edit toggle */}
      {onToggleVisualEdit && (
        <button
          onClick={onToggleVisualEdit}
          className={`flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors ${
            visualEditActive
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
          title={visualEditActive ? "Disable visual editing" : "Enable visual editing"}
        >
          <MousePointer2 className="h-3.5 w-3.5" />
        </button>
      )}

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
