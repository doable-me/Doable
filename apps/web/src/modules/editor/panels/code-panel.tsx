"use client";

import dynamic from "next/dynamic";
import {
  File,
  Search,
  X,
  Circle,
  Copy,
  Check,
  Download,
  Lock,
  Zap,
  Loader2,
  AlertCircle,
  Code2,
} from "lucide-react";
import { getFileIcon, getFileIconColor } from "./code-panel-utils";
import { TreeNode } from "./code-panel-tree";
import { useCodePanel } from "./use-code-panel";
import { useDarkMode } from "@/hooks/use-dark-mode";

// ─── Monaco Editor (dynamic import, no SSR) ──────────────────
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false }
);

// ─── Code Panel Component ────────────────────────────────────

export function CodePanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const {
    fileTree,
    fileTreeLoading,
    fileTreeError,
    expandedFolders,
    searchQuery,
    setSearchQuery,
    openTabs,
    activeTabPath,
    setActiveTabPath,
    fileLoading,
    fileError,
    copied,
    readOnly,
    activeTab,
    loadFileTree,
    openFile,
    closeTab,
    handleEditorChange,
    handleCopy,
    handleDownload,
    toggleFolder,
  } = useCodePanel(projectId);
  const { isDark } = useDarkMode();

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex h-12 flex-none items-center justify-between border-b border-border bg-background px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Code</h2>
          </div>
          {readOnly && (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground border border-border">
              <Lock className="h-3 w-3" />
              Read only
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Action buttons */}
          {activeTab && (
            <>
              <button
                onClick={handleCopy}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Copy file content"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={handleDownload}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Download file"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {/* Upgrade button */}
          {readOnly && (
            // TODO: replace with brand token
            <button className="ml-2 flex h-7 items-center gap-1.5 rounded-md bg-[#5337CD] px-3 text-[11px] font-medium text-white hover:bg-[#5337CD]/90 transition-colors">
              <Zap className="h-3 w-3" />
              Upgrade
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close code panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body (file tree + editor) ──────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── File Tree Sidebar ──────────────────────────────── */}
        <div className="flex w-[250px] flex-none flex-col border-r border-border bg-card">
          {/* Search input */}
          <div className="flex-none p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search code"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none focus:ring-1 focus:ring-border transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {fileTreeLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">Loading files...</p>
              </div>
            ) : fileTreeError ? (
              <div className="flex flex-col items-center justify-center px-4 py-12">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <p className="mt-2 text-xs text-red-400 text-center">
                  {fileTreeError}
                </p>
                <button
                  onClick={loadFileTree}
                  className="mt-2 text-xs text-muted-foreground underline hover:text-foreground"
                >
                  Retry
                </button>
              </div>
            ) : fileTree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <File className="h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">No files yet</p>
              </div>
            ) : (
              <div className="pb-4">
                {fileTree.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    searchQuery={searchQuery}
                    expandedFolders={expandedFolders}
                    selectedFile={activeTabPath}
                    onFileClick={openFile}
                    onToggleFolder={toggleFolder}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Code Editor Area ───────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Tab bar */}
          {openTabs.length > 0 && (
            <div className="flex h-9 flex-none items-center overflow-x-auto border-b border-border bg-background">
              {openTabs.map((tab) => {
                const isActive = tab.path === activeTabPath;
                const TabIcon = getFileIcon(tab.name);
                return (
                  <div
                    key={tab.path}
                    onClick={() => setActiveTabPath(tab.path)}
                    className={`group flex h-full cursor-pointer items-center gap-1.5 border-r border-border px-3 text-xs transition-colors ${
                      isActive
                        // TODO: replace with brand token
                        ? "bg-secondary text-foreground border-t-2 border-t-[#5337CD]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground border-t-2 border-t-transparent"
                    }`}
                  >
                    <TabIcon
                      className={`h-3 w-3 flex-none ${getFileIconColor(
                        tab.name
                      )}`}
                    />
                    <span className="truncate max-w-[120px]">{tab.name}</span>
                    {tab.isDirty && (
                      // TODO: replace with brand token
                      <Circle className="h-2 w-2 flex-none fill-current text-[#5337CD]" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.path);
                      }}
                      className="flex h-4 w-4 flex-none items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Breadcrumb */}
          {activeTab && (
            <div className="flex h-7 flex-none items-center border-b border-border bg-background px-3">
              <span className="text-[11px] text-muted-foreground font-mono truncate">
                {activeTab.path}
              </span>
            </div>
          )}

          {/* Editor or empty state */}
          <div className="flex-1 min-h-0">
            {fileLoading ? (
              <div className="flex h-full flex-col items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">Loading file...</p>
              </div>
            ) : fileError ? (
              <div className="flex h-full flex-col items-center justify-center px-8">
                <AlertCircle className="h-6 w-6 text-red-400" />
                <p className="mt-2 text-sm text-red-400 text-center">
                  {fileError}
                </p>
              </div>
            ) : activeTab ? (
              <MonacoEditor
                height="100%"
                language={activeTab.language}
                value={activeTab.content}
                onChange={handleEditorChange}
                theme={isDark ? "vs-dark" : "vs"}
                options={{
                  readOnly,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineHeight: 20,
                  padding: { top: 8, bottom: 8 },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  lineNumbers: "on",
                  renderLineHighlight: "line",
                  cursorBlinking: "smooth",
                  smoothScrolling: true,
                  contextmenu: true,
                  folding: true,
                  foldingHighlight: true,
                  bracketPairColorization: { enabled: true },
                  guides: {
                    bracketPairs: true,
                    indentation: true,
                  },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  scrollbar: {
                    verticalScrollbarSize: 8,
                    horizontalScrollbarSize: 8,
                    verticalSliderSize: 8,
                  },
                }}
                loading={
                  <div className="flex h-full items-center justify-center bg-background">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center">
                <Code2 className="h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a file to view its code
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Browse the file tree on the left to open files
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
