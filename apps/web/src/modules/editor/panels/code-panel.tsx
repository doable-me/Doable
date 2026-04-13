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

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-zinc-900 text-zinc-100">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex h-12 flex-none items-center justify-between border-b border-zinc-700/50 bg-zinc-900 px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Code</h2>
          </div>
          {readOnly && (
            <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-medium text-zinc-400 border border-zinc-700/50">
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
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
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
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                title="Download file"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {/* Upgrade button */}
          {readOnly && (
            <button className="ml-2 flex h-7 items-center gap-1.5 rounded-md bg-[#5337CD] px-3 text-[11px] font-medium text-white hover:bg-[#5337CD]/90 transition-colors">
              <Zap className="h-3 w-3" />
              Upgrade
            </button>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="ml-1 flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title="Close code panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Body (file tree + editor) ──────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* ── File Tree Sidebar ──────────────────────────────── */}
        <div className="flex w-[250px] flex-none flex-col border-r border-zinc-700/50 bg-zinc-900/80">
          {/* Search input */}
          <div className="flex-none p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search code"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 w-full rounded-md border border-zinc-700/50 bg-zinc-800/80 pl-7 pr-2 text-xs text-zinc-300 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
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
                <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                <p className="mt-2 text-xs text-zinc-500">Loading files...</p>
              </div>
            ) : fileTreeError ? (
              <div className="flex flex-col items-center justify-center px-4 py-12">
                <AlertCircle className="h-5 w-5 text-red-400" />
                <p className="mt-2 text-xs text-red-400 text-center">
                  {fileTreeError}
                </p>
                <button
                  onClick={loadFileTree}
                  className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-200"
                >
                  Retry
                </button>
              </div>
            ) : fileTree.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <File className="h-5 w-5 text-zinc-600" />
                <p className="mt-2 text-xs text-zinc-500">No files yet</p>
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
            <div className="flex h-9 flex-none items-center overflow-x-auto border-b border-zinc-700/50 bg-zinc-900/60">
              {openTabs.map((tab) => {
                const isActive = tab.path === activeTabPath;
                const TabIcon = getFileIcon(tab.name);
                return (
                  <div
                    key={tab.path}
                    onClick={() => setActiveTabPath(tab.path)}
                    className={`group flex h-full cursor-pointer items-center gap-1.5 border-r border-zinc-700/30 px-3 text-xs transition-colors ${
                      isActive
                        ? "bg-zinc-800/80 text-zinc-100 border-t-2 border-t-[#5337CD]"
                        : "text-zinc-500 hover:bg-zinc-800/40 hover:text-zinc-300 border-t-2 border-t-transparent"
                    }`}
                  >
                    <TabIcon
                      className={`h-3 w-3 flex-none ${getFileIconColor(
                        tab.name
                      )}`}
                    />
                    <span className="truncate max-w-[120px]">{tab.name}</span>
                    {tab.isDirty && (
                      <Circle className="h-2 w-2 flex-none fill-current text-[#5337CD]" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.path);
                      }}
                      className="flex h-4 w-4 flex-none items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-zinc-700 transition-all"
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
            <div className="flex h-7 flex-none items-center border-b border-zinc-700/30 bg-zinc-900/40 px-3">
              <span className="text-[11px] text-zinc-500 font-mono truncate">
                {activeTab.path}
              </span>
            </div>
          )}

          {/* Editor or empty state */}
          <div className="flex-1 min-h-0">
            {fileLoading ? (
              <div className="flex h-full flex-col items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                <p className="mt-2 text-sm text-zinc-500">Loading file...</p>
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
                theme="vs-dark"
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
                  <div className="flex h-full items-center justify-center bg-zinc-900">
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center">
                <Code2 className="h-10 w-10 text-zinc-700" />
                <p className="mt-3 text-sm text-zinc-500">
                  Select a file to view its code
                </p>
                <p className="mt-1 text-xs text-zinc-600">
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
