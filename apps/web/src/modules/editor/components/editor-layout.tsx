"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useEditorStore } from "../hooks/use-editor-store";
import { PanelLeft } from "lucide-react";

interface EditorLayoutProps {
  sidebar: ReactNode;
  center: ReactNode;
  preview: ReactNode;
  toolbar: ReactNode;
}

export function EditorLayout({
  sidebar,
  center,
  preview,
  toolbar,
}: EditorLayoutProps) {
  const {
    panelSizes,
    sidebarCollapsed,
    viewMode,
    setPanelSizes,
    toggleSidebar,
  } = useEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);
  const dragStartRef = useRef({ x: 0, size: 0 });

  const sidebarWidth = sidebarCollapsed ? 0 : panelSizes.sidebar;

  const handleMouseDown = useCallback(
    (handle: "left" | "right", e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(handle);
      dragStartRef.current = {
        x: e.clientX,
        size: handle === "left" ? sidebarWidth : panelSizes.preview,
      };
    },
    [sidebarWidth, panelSizes.preview]
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartRef.current.x;

      if (dragging === "left") {
        const newWidth = Math.max(180, Math.min(400, dragStartRef.current.size + delta));
        setPanelSizes({ sidebar: newWidth });
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging, setPanelSizes]);

  const showCenter = viewMode !== "preview";
  const showPreview = viewMode !== "code";

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex-none">{toolbar}</div>

      {/* Main panels */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Sidebar toggle when collapsed */}
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="flex h-full w-10 flex-col items-center border-r border-border bg-muted/30 pt-3 hover:bg-muted/60 transition-colors"
            title="Expand sidebar"
          >
            <PanelLeft className="h-4 w-4 text-muted-foreground" />
          </button>
        )}

        {/* Sidebar */}
        {!sidebarCollapsed && (
          <>
            <div
              className="flex-none overflow-hidden border-r border-border"
              style={{ width: sidebarWidth }}
            >
              {sidebar}
            </div>
            {/* Left drag handle */}
            <div
              className="group relative z-10 w-1 cursor-col-resize flex-none"
              onMouseDown={(e) => handleMouseDown("left", e)}
            >
              <div
                className={`absolute inset-y-0 -left-0.5 w-1 transition-colors ${
                  dragging === "left"
                    ? "bg-primary"
                    : "group-hover:bg-primary/50"
                }`}
              />
            </div>
          </>
        )}

        {/* Center panel (chat + code) */}
        {showCenter && (
          <div className="flex flex-1 min-w-0 overflow-hidden">
            {center}
          </div>
        )}

        {/* Right drag handle */}
        {showCenter && showPreview && (
          <div
            className="group relative z-10 w-1 cursor-col-resize flex-none"
            onMouseDown={(e) => handleMouseDown("right", e)}
          >
            <div
              className={`absolute inset-y-0 -left-0.5 w-1 transition-colors ${
                dragging === "right"
                  ? "bg-primary"
                  : "group-hover:bg-primary/50"
              }`}
            />
          </div>
        )}

        {/* Preview panel */}
        {showPreview && (
          <div className="flex flex-1 min-w-0 overflow-hidden">
            {preview}
          </div>
        )}
      </div>
    </div>
  );
}
