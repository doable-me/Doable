"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { getStoredTokens } from "@/lib/api";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode2,
  FileJson,
  FileText,
  Image,
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

// ─── Monaco Editor (dynamic import, no SSR) ──────────────────
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  { ssr: false }
);

// ─── Constants ───────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ───────────────────────────────────────────────────
interface FileTreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileTreeNode[];
}

interface OpenTab {
  path: string;
  name: string;
  language: string;
  isDirty: boolean;
  content: string;
}

// ─── API Helpers ─────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function fetchFileList(projectId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list files (${res.status})`);
  const json = (await res.json()) as { data: string[] };
  return json.data;
}

async function fetchFileContent(
  projectId: string,
  filePath: string
): Promise<string> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`Failed to read file (${res.status})`);
  const json = (await res.json()) as {
    data: { path: string; content: string };
  };
  return json.data.content;
}

async function saveFileContent(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(`Failed to save file (${res.status})`);
}

// ─── File Tree Builder ───────────────────────────────────────

function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const filePath of paths) {
    const parts = filePath.split("/");
    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      const existing = currentLevel.find((n) => n.name === part);
      if (existing) {
        if (!isLast && existing.children) {
          currentLevel = existing.children;
        }
      } else {
        const node: FileTreeNode = {
          name: part,
          type: isLast ? "file" : "folder",
          path: currentPath,
          children: isLast ? undefined : [],
        };
        currentLevel.push(node);
        if (!isLast && node.children) {
          currentLevel = node.children;
        }
      }
    }
  }

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (node.children) sortNodes(node.children);
    }
    return nodes;
  };

  return sortNodes(root);
}

// ─── Language Detection ──────────────────────────────────────

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    html: "html",
    md: "markdown",
    yaml: "yaml",
    yml: "yaml",
    py: "python",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    env: "plaintext",
    xml: "xml",
    svg: "xml",
    txt: "plaintext",
    gitignore: "plaintext",
  };
  return map[ext] ?? "plaintext";
}

// ─── File Icon Mapping ───────────────────────────────────────

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const iconMap: Record<string, typeof File> = {
    ts: FileCode2,
    tsx: FileCode2,
    js: FileCode2,
    jsx: FileCode2,
    json: FileJson,
    md: FileText,
    txt: FileText,
    png: Image,
    jpg: Image,
    jpeg: Image,
    svg: Image,
    gif: Image,
  };
  return iconMap[ext] ?? File;
}

// Color hints for file type icons
function getFileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const colorMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    json: "text-yellow-300",
    css: "text-brand-400",
    scss: "text-pink-400",
    html: "text-orange-400",
    md: "text-zinc-400",
    svg: "text-green-400",
    png: "text-green-400",
    jpg: "text-green-400",
  };
  return colorMap[ext] ?? "text-zinc-500";
}

// ─── File Tree Node Component ────────────────────────────────

function TreeNode({
  node,
  depth,
  searchQuery,
  expandedFolders,
  selectedFile,
  onFileClick,
  onToggleFolder,
}: {
  node: FileTreeNode;
  depth: number;
  searchQuery: string;
  expandedFolders: Set<string>;
  selectedFile: string | null;
  onFileClick: (path: string) => void;
  onToggleFolder: (path: string) => void;
}) {
  const isDir = node.type === "folder";
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = !isDir && node.path === selectedFile;
  const Icon = isDir
    ? isExpanded
      ? FolderOpen
      : Folder
    : getFileIcon(node.name);

  // Filter by search query
  const matchesSearch =
    !searchQuery ||
    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.path.toLowerCase().includes(searchQuery.toLowerCase());

  // For folders, check if any child matches
  const hasMatchingChild = useMemo((): boolean => {
    if (!searchQuery || !isDir || !node.children) return false;
    const checkChildren = (children: FileTreeNode[]): boolean =>
      children.some(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (c.children ? checkChildren(c.children) : false)
      );
    return checkChildren(node.children);
  }, [searchQuery, isDir, node.children, node.name, node.path]);

  if (searchQuery && !matchesSearch && !hasMatchingChild) return null;

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) {
            onToggleFolder(node.path);
          } else {
            onFileClick(node.path);
          }
        }}
        className={`group flex w-full items-center gap-1 py-[3px] pr-2 text-[13px] transition-colors ${
          isSelected
            ? "bg-zinc-700/60 text-zinc-100"
            : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 flex-none text-zinc-500" />
          ) : (
            <ChevronRight className="h-3 w-3 flex-none text-zinc-500" />
          )
        ) : (
          <span className="w-3 flex-none" />
        )}
        <Icon
          className={`h-3.5 w-3.5 flex-none ${
            isDir ? "text-zinc-500" : getFileIconColor(node.name)
          }`}
        />
        <span className="truncate">{node.name}</span>
      </button>

      {isDir && (isExpanded || (searchQuery && hasMatchingChild)) && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              searchQuery={searchQuery}
              expandedFolders={expandedFolders}
              selectedFile={selectedFile}
              onFileClick={onFileClick}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Code Panel Component ────────────────────────────────────

export function CodePanel({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  // File tree state
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [fileTreeLoading, setFileTreeLoading] = useState(true);
  const [fileTreeError, setFileTreeError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Tab state
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // File content loading
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  // Copy state
  const [copied, setCopied] = useState(false);

  // Read-only mode (free tier)
  const [readOnly] = useState(true);

  // Active tab reference
  const activeTab = useMemo(
    () => openTabs.find((t) => t.path === activeTabPath) ?? null,
    [openTabs, activeTabPath]
  );

  // ─── Load file tree ──────────────────────────────────────────

  const loadFileTree = useCallback(async () => {
    setFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const paths = await fetchFileList(projectId);
      const tree = buildFileTree(paths);
      setFileTree(tree);
      // Auto-expand top-level folders
      const topFolders = tree
        .filter((n) => n.type === "folder")
        .map((n) => n.path);
      setExpandedFolders((prev) => new Set([...prev, ...topFolders]));
    } catch (err) {
      setFileTreeError(
        err instanceof Error ? err.message : "Failed to load files"
      );
    } finally {
      setFileTreeLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadFileTree();
  }, [loadFileTree]);

  // ─── Open file in tab ────────────────────────────────────────

  const openFile = useCallback(
    async (filePath: string) => {
      // If already open, just activate
      const existing = openTabs.find((t) => t.path === filePath);
      if (existing) {
        setActiveTabPath(filePath);
        return;
      }

      setFileLoading(true);
      setFileError(null);
      try {
        const content = await fetchFileContent(projectId, filePath);
        const name = filePath.split("/").pop() ?? filePath;
        const language = detectLanguage(name);
        const newTab: OpenTab = {
          path: filePath,
          name,
          language,
          isDirty: false,
          content,
        };
        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(filePath);
      } catch (err) {
        setFileError(
          err instanceof Error ? err.message : "Failed to load file"
        );
      } finally {
        setFileLoading(false);
      }
    },
    [projectId, openTabs]
  );

  // ─── Close tab ───────────────────────────────────────────────

  const closeTab = useCallback(
    (path: string) => {
      setOpenTabs((prev) => prev.filter((t) => t.path !== path));
      if (activeTabPath === path) {
        setActiveTabPath((prev) => {
          const remaining = openTabs.filter((t) => t.path !== path);
          return remaining.length > 0
            ? remaining[remaining.length - 1]!.path
            : null;
        });
      }
    },
    [activeTabPath, openTabs]
  );

  // ─── Handle editor content change ───────────────────────────

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (!activeTabPath || readOnly) return;
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === activeTabPath
            ? { ...t, content: value ?? "", isDirty: true }
            : t
        )
      );
    },
    [activeTabPath, readOnly]
  );

  // ─── Save file (Ctrl+S) ─────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.isDirty || readOnly) return;
    try {
      await saveFileContent(projectId, activeTab.path, activeTab.content);
      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === activeTab.path ? { ...t, isDirty: false } : t
        )
      );
    } catch (err) {
      console.error("Failed to save:", err);
    }
  }, [activeTab, projectId, readOnly]);

  // ─── Keyboard shortcut handler ───────────────────────────────

  const handleKeyDown = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ─── Copy file content ───────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!activeTab) return;
    try {
      await navigator.clipboard.writeText(activeTab.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [activeTab]);

  // ─── Download file ───────────────────────────────────────────

  const handleDownload = useCallback(() => {
    if (!activeTab) return;
    const blob = new Blob([activeTab.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeTab.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeTab]);

  // ─── Toggle folder ──────────────────────────────────────────

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

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
