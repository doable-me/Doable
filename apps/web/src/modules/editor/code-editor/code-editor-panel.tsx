"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useEditorStore } from "../hooks/use-editor-store";
import { useProjectFiles } from "../hooks/use-project-files";
import {
  X,
  FileCode2,
  Circle,
  Code2,
  Lock,
  Sparkles,
  Map,
} from "lucide-react";
import type { MonacoEditorWrapperProps } from "./monaco-editor-wrapper";
import { useCollaboration } from "@/modules/collaboration/collaboration-context";
import { RemoteCursorManager } from "@/modules/collaboration/cursors";

// Dynamically import Monaco to avoid SSR issues
const MonacoEditorWrapper = dynamic<MonacoEditorWrapperProps>(
  () =>
    import("./monaco-editor-wrapper").then((mod) => mod.MonacoEditorWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand-400" />
          <span className="text-xs text-muted-foreground">Loading editor...</span>
        </div>
      </div>
    ),
  },
);

// ─── Constants ────────────────────────────────────────────────
const AUTOSAVE_DELAY_MS = 1500;

// ─── Component ────────────────────────────────────────────────
export function CodeEditorPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { openTabs, activeFilePath, activeFileContent } = useEditorStore();
  const projectId = useEditorStore((s) => s.projectId);
  const closeTab = useEditorStore((s) => s.closeTab);
  const setActiveFile = useEditorStore((s) => s.setActiveFile);
  const setActiveFileContent = useEditorStore((s) => s.setActiveFileContent);
  const markTabDirty = useEditorStore((s) => s.markTabDirty);
  const { readFile, saveFile } = useProjectFiles(projectId);

  const [showMinimap, setShowMinimap] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Remote cursor collaboration ──────────────────────────
  const { cursors, sendCursorMove } = useCollaboration();
  const cursorManagerRef = useRef<RemoteCursorManager | null>(null);

  const handleEditorMount = useCallback((editor: any) => {
    cursorManagerRef.current?.dispose();
    cursorManagerRef.current = new RemoteCursorManager(editor);
  }, []);

  const handleCursorChange = useCallback(
    (line: number, column: number) => {
      if (activeFilePath) {
        sendCursorMove(activeFilePath, line, column);
      }
    },
    [activeFilePath, sendCursorMove],
  );

  // Update remote cursor decorations when cursors or active file change
  useEffect(() => {
    if (cursorManagerRef.current && activeFilePath) {
      cursorManagerRef.current.updateCursors(cursors, activeFilePath);
    }
  }, [cursors, activeFilePath]);

  // Clean up cursor manager on unmount
  useEffect(() => {
    return () => {
      cursorManagerRef.current?.dispose();
    };
  }, []);

  // Track the content per-file so tab switching preserves edits
  const fileContentsRef = useRef<Record<string, string>>({});

  // When active file changes, update the ref cache
  useEffect(() => {
    if (activeFilePath && activeFileContent !== undefined) {
      fileContentsRef.current[activeFilePath] = activeFileContent;
    }
  }, [activeFilePath, activeFileContent]);

  const activeTab = openTabs.find((t) => t.path === activeFilePath);

  // ─── Handle tab click ─────────────────────────────────────
  const handleTabClick = useCallback(
    (path: string) => {
      // If we have cached content, use it; otherwise fetch from API
      const cached = fileContentsRef.current[path];
      if (cached !== undefined) {
        setActiveFile(path, cached);
      } else {
        readFile(path);
      }
    },
    [setActiveFile, readFile],
  );

  // ─── Handle close tab ────────────────────────────────────
  const handleCloseTab = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      delete fileContentsRef.current[path];
      closeTab(path);
    },
    [closeTab],
  );

  // ─── Handle editor content change ────────────────────────
  const handleEditorChange = useCallback(
    (newValue: string) => {
      if (!activeFilePath) return;

      setActiveFileContent(newValue);
      fileContentsRef.current[activeFilePath] = newValue;
      markTabDirty(activeFilePath, true);

      // Debounced auto-save
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      autosaveTimerRef.current = setTimeout(() => {
        if (activeFilePath) {
          const content = fileContentsRef.current[activeFilePath];
          if (content !== undefined) {
            saveFile(activeFilePath, content);
          }
        }
      }, AUTOSAVE_DELAY_MS);
    },
    [activeFilePath, setActiveFileContent, markTabDirty, saveFile],
  );

  // ─── Handle explicit save (Ctrl+S) ───────────────────────
  const handleSave = useCallback(
    (value: string) => {
      if (!activeFilePath) return;

      // Cancel any pending autosave
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      fileContentsRef.current[activeFilePath] = value;
      saveFile(activeFilePath, value);
    },
    [activeFilePath, saveFile],
  );

  // ─── Keyboard shortcut: Ctrl+W to close tab ──────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        if (activeFilePath) {
          delete fileContentsRef.current[activeFilePath];
          closeTab(activeFilePath);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeFilePath, closeTab]);

  // ─── Cleanup autosave timer on unmount ────────────────────
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  // ─── Empty state ──────────────────────────────────────────
  if (openTabs.length === 0) {
    return <EmptyEditor />;
  }

  return (
    <div className="flex h-full flex-col border-l border-border bg-background">
      {/* ─── Tab bar ───────────────────────────────────────── */}
      <div className="flex h-9 items-center overflow-x-auto border-b border-border bg-background scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
        {openTabs.map((tab) => {
          const isActive = tab.path === activeFilePath;
          return (
            <div
              key={tab.path}
              className={`group flex h-full items-center gap-1.5 border-r border-border px-3 text-xs cursor-pointer select-none transition-colors ${
                isActive
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              onClick={() => handleTabClick(tab.path)}
            >
              <FileCode2 className="h-3 w-3 flex-none text-muted-foreground" />
              <span className="truncate max-w-[120px]">{tab.name}</span>
              {tab.isDirty && (
                <Circle className="h-2 w-2 flex-none fill-current text-brand-400" />
              )}
              <button
                onClick={(e) => handleCloseTab(e, tab.path)}
                className="flex h-4 w-4 flex-none items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                title="Close (Ctrl+W)"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* Minimap toggle at far right */}
        <div className="ml-auto flex items-center gap-1 px-2">
          <button
            onClick={() => setShowMinimap((v) => !v)}
            className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
              showMinimap
                ? "text-brand-400 bg-secondary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={showMinimap ? "Hide minimap" : "Show minimap"}
          >
            <Map className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ─── Breadcrumb / path ─────────────────────────────── */}
      {activeTab && (
        <div className="flex h-6 items-center border-b border-border bg-background px-3">
          <span className="text-[11px] text-muted-foreground font-mono truncate">
            {activeTab.path}
          </span>
        </div>
      )}

      {/* ─── Read-only banner ──────────────────────────────── */}
      {readOnly && (
        <div className="flex items-center gap-2 border-b border-amber-800/30 bg-amber-950/20 px-3 py-1.5">
          <Lock className="h-3 w-3 text-amber-500" />
          <span className="text-[11px] text-amber-400">
            Read-only mode.
          </span>
          <button className="ml-auto flex items-center gap-1 rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-500 transition-colors">
            <Sparkles className="h-3 w-3" />
            Upgrade to edit
          </button>
        </div>
      )}

      {/* ─── Monaco editor ─────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {activeTab ? (
          <MonacoEditorWrapper
            value={activeFileContent}
            language={activeTab.language}
            filePath={activeTab.path}
            readOnly={readOnly}
            onChange={readOnly ? undefined : handleEditorChange}
            onSave={readOnly ? undefined : handleSave}
            showMinimap={showMinimap}
            onEditorMount={handleEditorMount}
            onCursorChange={handleCursorChange}
          />
        ) : (
          <EmptyEditor />
        )}
      </div>
    </div>
  );
}

// ─── Empty state ────────────────────────────────────────────
function EmptyEditor() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center bg-background">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
        <Code2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground mb-1">
        Select a file to view its code
      </p>
      <p className="text-xs text-muted-foreground">
        Use the file explorer or chat with AI to generate files
      </p>
      <div className="mt-4 flex flex-col gap-1 text-[11px] text-muted-foreground">
        <span>Ctrl+S to save</span>
        <span>Ctrl+F to search</span>
        <span>Ctrl+H to replace</span>
        <span>Ctrl+W to close tab</span>
      </div>
    </div>
  );
}
