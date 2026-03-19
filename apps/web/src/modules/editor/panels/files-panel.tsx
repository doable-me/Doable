"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
  FileType,
  Image,
  Palette,
  Globe,
  Cog,
  Plus,
  FolderPlus,
  Search,
  Trash2,
  Pencil,
  Copy,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react";

// ─── Constants ──────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Types ──────────────────────────────────────────────────
interface Props {
  projectId: string;
  onClose?: () => void;
}

interface FileTreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileTreeNode[];
}

interface ContextMenuState {
  x: number;
  y: number;
  node: FileTreeNode;
}

interface FileInfo {
  name: string;
  path: string;
  type: string;
  size: number | null;
  lastModified: string | null;
}

// ─── API Helpers ────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const { accessToken } = getStoredTokens();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

async function apiListFiles(projectId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/projects/${projectId}/files`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to list files (${res.status})`);
  const json = (await res.json()) as { data: string[] };
  return json.data;
}

async function apiReadFile(
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

async function apiCreateFile(
  projectId: string,
  filePath: string,
  content: string = ""
): Promise<void> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ content }),
    }
  );
  if (!res.ok) throw new Error(`Failed to create file (${res.status})`);
}

async function apiUpdateFile(
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
  if (!res.ok) throw new Error(`Failed to update file (${res.status})`);
}

async function apiDeleteFile(
  projectId: string,
  filePath: string
): Promise<void> {
  const res = await fetch(
    `${API_URL}/projects/${projectId}/files/${encodeURIComponent(filePath)}`,
    {
      method: "DELETE",
      headers: authHeaders(),
    }
  );
  if (!res.ok) throw new Error(`Failed to delete file (${res.status})`);
}

// ─── File Icon Mapping ──────────────────────────────────────

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
    css: Palette,
    scss: Palette,
    less: Palette,
    html: Globe,
    htm: Globe,
    png: Image,
    jpg: Image,
    jpeg: Image,
    svg: Image,
    gif: Image,
    webp: Image,
    ico: Image,
    yaml: Cog,
    yml: Cog,
    toml: Cog,
    env: Cog,
    gitignore: Cog,
    d: FileType,
  };
  return iconMap[ext] ?? File;
}

function getFileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const colorMap: Record<string, string> = {
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    json: "text-yellow-300",
    css: "text-purple-400",
    scss: "text-pink-400",
    html: "text-orange-400",
    htm: "text-orange-400",
    md: "text-zinc-400",
    txt: "text-zinc-400",
    png: "text-green-400",
    jpg: "text-green-400",
    svg: "text-green-400",
  };
  return colorMap[ext] ?? "text-zinc-500";
}

// ─── Build File Tree ────────────────────────────────────────

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

// ─── File extension to type label ───────────────────────────

function getFileTypeLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const typeMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript JSX",
    js: "JavaScript",
    jsx: "JavaScript JSX",
    json: "JSON",
    css: "CSS",
    scss: "SCSS",
    less: "LESS",
    html: "HTML",
    htm: "HTML",
    md: "Markdown",
    txt: "Plain Text",
    svg: "SVG",
    png: "PNG Image",
    jpg: "JPEG Image",
    gif: "GIF Image",
    yaml: "YAML",
    yml: "YAML",
    toml: "TOML",
    env: "Environment",
  };
  return typeMap[ext] ?? (ext.toUpperCase() || "File");
}

// ─── Filter tree recursively ────────────────────────────────

function filterTree(
  nodes: FileTreeNode[],
  query: string
): FileTreeNode[] {
  const q = query.toLowerCase();
  const result: FileTreeNode[] = [];
  for (const node of nodes) {
    if (node.type === "file") {
      if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
        result.push(node);
      }
    } else if (node.children) {
      const filteredChildren = filterTree(node.children, query);
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
  }
  return result;
}

// ─── Collect all folder paths from a tree ───────────────────

function collectFolderPaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      paths.push(node.path);
      if (node.children) {
        paths.push(...collectFolderPaths(node.children));
      }
    }
  }
  return paths;
}

// ─── Default content templates ──────────────────────────────

function getDefaultContent(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "tsx":
      return `export default function Component() {\n  return (\n    <div>\n      <h1>New Component</h1>\n    </div>\n  );\n}\n`;
    case "ts":
      return `// ${filePath.split("/").pop()}\n\nexport {};\n`;
    case "jsx":
      return `export default function Component() {\n  return (\n    <div>\n      <h1>New Component</h1>\n    </div>\n  );\n}\n`;
    case "js":
      return `// ${filePath.split("/").pop()}\n\n`;
    case "css":
      return `/* ${filePath.split("/").pop()} */\n`;
    case "json":
      return `{}\n`;
    case "html":
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n`;
    case "md":
      return `# ${filePath.split("/").pop()?.replace(/\.md$/, "")}\n`;
    default:
      return "";
  }
}

// ═════════════════════════════════════════════════════════════
// ─── Main Component ─────────────────────────────────────────
// ═════════════════════════════════════════════════════════════

export function FilesPanel({ projectId, onClose }: Props) {
  // ─── State ──────────────────────────────────────────────
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set()
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFileInfo, setSelectedFileInfo] = useState<FileInfo | null>(
    null
  );

  // Context menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(
    null
  );

  // Dialogs
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null
  );
  const [newFilePath, setNewFilePath] = useState("");
  const [newFolderPath, setNewFolderPath] = useState("");

  // Inline rename
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Drag & drop
  const [draggedNode, setDraggedNode] = useState<FileTreeNode | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Operation in progress
  const [operationLoading, setOperationLoading] = useState(false);

  // ─── Fetch file tree ────────────────────────────────────
  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const paths = await apiListFiles(projectId);
      const tree = buildFileTree(paths);
      setFileTree(tree);

      // Auto-expand top-level folders
      const topFolders = tree
        .filter((n) => n.type === "folder")
        .map((n) => n.path);
      setExpandedFolders((prev: Set<string>) => new Set([...prev, ...topFolders]));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load files";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  // ─── Filtered tree ──────────────────────────────────────
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return fileTree;
    return filterTree(fileTree, searchQuery.trim());
  }, [fileTree, searchQuery]);

  // When searching, auto-expand all matched folders
  const displayExpandedFolders = useMemo(() => {
    if (!searchQuery.trim()) return expandedFolders;
    const allFolders = collectFolderPaths(filteredTree);
    return new Set([...expandedFolders, ...allFolders]);
  }, [searchQuery, filteredTree, expandedFolders]);

  // ─── Toggle folder ──────────────────────────────────────
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  // ─── Select file & load info ────────────────────────────
  const handleSelectFile = useCallback(
    async (node: FileTreeNode) => {
      if (node.type === "folder") {
        toggleFolder(node.path);
        return;
      }
      setSelectedFile(node.path);
      // Fetch file content to get size info
      try {
        const content = await apiReadFile(projectId, node.path);
        const size = new Blob([content]).size;
        setSelectedFileInfo({
          name: node.name,
          path: node.path,
          type: getFileTypeLabel(node.name),
          size,
          lastModified: null, // API doesn't return this
        });
      } catch {
        setSelectedFileInfo({
          name: node.name,
          path: node.path,
          type: getFileTypeLabel(node.name),
          size: null,
          lastModified: null,
        });
      }
    },
    [projectId, toggleFolder]
  );

  // ─── Create file ────────────────────────────────────────
  const handleCreateFile = useCallback(async () => {
    const path = newFilePath.trim();
    if (!path) return;

    setOperationLoading(true);
    try {
      const content = getDefaultContent(path);
      await apiCreateFile(projectId, path, content);
      await fetchTree();
      setShowNewFileDialog(false);
      setNewFilePath("");

      // Auto-expand parent folders
      const parts = path.split("/");
      if (parts.length > 1) {
        const parentPaths: string[] = [];
        for (let i = 1; i < parts.length; i++) {
          parentPaths.push(parts.slice(0, i).join("/"));
        }
        setExpandedFolders((prev: Set<string>) => new Set([...prev, ...parentPaths]));
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create file";
      setError(msg);
    } finally {
      setOperationLoading(false);
    }
  }, [projectId, newFilePath, fetchTree]);

  // ─── Create folder (by creating a .gitkeep inside) ──────
  const handleCreateFolder = useCallback(async () => {
    const folder = newFolderPath.trim().replace(/\/+$/, "");
    if (!folder) return;

    setOperationLoading(true);
    try {
      await apiCreateFile(projectId, `${folder}/.gitkeep`, "");
      await fetchTree();
      setShowNewFolderDialog(false);
      setNewFolderPath("");

      // Auto-expand the new folder and its parents
      const parts = folder.split("/");
      const parentPaths: string[] = [];
      for (let i = 1; i <= parts.length; i++) {
        parentPaths.push(parts.slice(0, i).join("/"));
      }
      setExpandedFolders((prev: Set<string>) => new Set([...prev, ...parentPaths]));
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to create folder";
      setError(msg);
    } finally {
      setOperationLoading(false);
    }
  }, [projectId, newFolderPath, fetchTree]);

  // ─── Rename file ────────────────────────────────────────
  const startRename = useCallback((node: FileTreeNode) => {
    setRenamingPath(node.path);
    setRenameValue(node.name);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const handleRename = useCallback(async () => {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }

    const oldPath = renamingPath;
    const parts = oldPath.split("/");
    parts[parts.length - 1] = renameValue.trim();
    const newPath = parts.join("/");

    if (newPath === oldPath) {
      setRenamingPath(null);
      return;
    }

    setOperationLoading(true);
    try {
      // Read old content, create at new path, delete old
      const content = await apiReadFile(projectId, oldPath);
      await apiCreateFile(projectId, newPath, content);
      await apiDeleteFile(projectId, oldPath);
      await fetchTree();
      if (selectedFile === oldPath) {
        setSelectedFile(newPath);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to rename file";
      setError(msg);
    } finally {
      setRenamingPath(null);
      setOperationLoading(false);
    }
  }, [renamingPath, renameValue, projectId, fetchTree, selectedFile]);

  // ─── Delete file ────────────────────────────────────────
  const handleDelete = useCallback(
    async (path: string) => {
      setOperationLoading(true);
      try {
        await apiDeleteFile(projectId, path);
        await fetchTree();
        if (selectedFile === path) {
          setSelectedFile(null);
          setSelectedFileInfo(null);
        }
        setShowDeleteConfirm(null);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to delete file";
        setError(msg);
      } finally {
        setOperationLoading(false);
      }
    },
    [projectId, fetchTree, selectedFile]
  );

  // ─── Copy path to clipboard ─────────────────────────────
  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {
      // Fallback: noop
    });
  }, []);

  // ─── Drag & drop ────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: DragEvent<HTMLButtonElement>, node: FileTreeNode) => {
      e.dataTransfer.effectAllowed = "move";
      setDraggedNode(node);
    },
    []
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLButtonElement>, targetPath: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(targetPath);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLButtonElement>, targetFolderPath: string) => {
      e.preventDefault();
      setDropTarget(null);

      if (!draggedNode || draggedNode.type !== "file") {
        setDraggedNode(null);
        return;
      }

      const oldPath = draggedNode.path;
      const newPath = `${targetFolderPath}/${draggedNode.name}`;

      if (newPath === oldPath) {
        setDraggedNode(null);
        return;
      }

      setOperationLoading(true);
      try {
        const content = await apiReadFile(projectId, oldPath);
        await apiCreateFile(projectId, newPath, content);
        await apiDeleteFile(projectId, oldPath);
        await fetchTree();
        if (selectedFile === oldPath) {
          setSelectedFile(newPath);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to move file";
        setError(msg);
      } finally {
        setDraggedNode(null);
        setOperationLoading(false);
      }
    },
    [draggedNode, projectId, fetchTree, selectedFile]
  );

  // ─── Context menu ───────────────────────────────────────
  const handleContextMenu = useCallback(
    (e: ReactMouseEvent, node: FileTreeNode) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, node });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // ─── Render tree node ───────────────────────────────────
  const renderTreeNode = (node: FileTreeNode, depth: number) => {
    const isFolder = node.type === "folder";
    const isExpanded = displayExpandedFolders.has(node.path);
    const isSelected = selectedFile === node.path;
    const isRenaming = renamingPath === node.path;
    const isDragOver = dropTarget === node.path;
    const Icon = isFolder
      ? isExpanded
        ? FolderOpen
        : Folder
      : getFileIcon(node.name);
    const iconColor = isFolder ? "text-blue-400" : getFileIconColor(node.name);

    return (
      <div key={node.path}>
        {isRenaming ? (
          <div
            className="flex items-center gap-1.5 py-0.5"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isFolder ? (
              <ChevronRight className="h-3 w-3 flex-shrink-0 text-zinc-500" />
            ) : (
              <span className="w-3 flex-shrink-0" />
            )}
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${iconColor}`} />
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setRenamingPath(null);
              }}
              onBlur={handleRename}
              className="flex-1 min-w-0 bg-zinc-800 border border-purple-500/60 rounded px-1.5 py-0.5 text-[12px] text-zinc-200 outline-none"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => handleSelectFile(node)}
            onContextMenu={(e) => handleContextMenu(e, node)}
            draggable={node.type === "file"}
            onDragStart={(e) => handleDragStart(e, node)}
            onDragOver={
              isFolder ? (e) => handleDragOver(e, node.path) : undefined
            }
            onDragLeave={isFolder ? handleDragLeave : undefined}
            onDrop={
              isFolder ? (e) => handleDrop(e, node.path) : undefined
            }
            className={`group flex w-full items-center gap-1.5 py-1 pr-2 text-[12px] transition-colors rounded-sm ${
              isSelected && !isFolder
                ? "bg-purple-500/15 text-purple-300"
                : isDragOver && isFolder
                  ? "bg-blue-500/15 text-blue-300"
                  : "text-zinc-400 hover:bg-white/5 hover:text-zinc-300"
            }`}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isFolder ? (
              isExpanded ? (
                <ChevronDown className="h-3 w-3 flex-shrink-0 text-zinc-500" />
              ) : (
                <ChevronRight className="h-3 w-3 flex-shrink-0 text-zinc-500" />
              )
            ) : (
              <span className="w-3 flex-shrink-0" />
            )}
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${iconColor}`} />
            <span className="truncate">{node.name}</span>
          </button>
        )}

        {isFolder && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // ─── Format byte size ───────────────────────────────────
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ─── Render ─────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-[#1C1C1C] text-zinc-200">
      {/* ─── Header ────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Files
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewFileDialog(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
            title="New File"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setShowNewFolderDialog(true)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
            title="New Folder"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={fetchTree}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ─── Search ────────────────────────────────────────── */}
      <div className="border-b border-zinc-800/60 px-3 py-1.5">
        <div className="flex items-center gap-1.5 rounded-md bg-zinc-800/60 px-2 py-1">
          <Search className="h-3 w-3 flex-shrink-0 text-zinc-500" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-[12px] text-zinc-300 placeholder-zinc-600 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* ─── File Tree ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin mb-2" />
            <span className="text-[11px]">Loading files...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 px-4 text-center">
            <AlertCircle className="h-5 w-5 text-red-400/60 mb-2" />
            <span className="text-[11px] text-red-400/80 mb-2">{error}</span>
            <button
              onClick={() => {
                setError(null);
                fetchTree();
              }}
              className="text-[11px] text-purple-400 hover:text-purple-300 underline"
            >
              Retry
            </button>
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-600 px-4 text-center">
            <File className="h-6 w-6 mb-2 opacity-40" />
            <span className="text-[11px]">
              {searchQuery
                ? "No files match your search"
                : "No files yet. Start chatting to generate code."}
            </span>
          </div>
        ) : (
          filteredTree.map((node) => renderTreeNode(node, 0))
        )}
      </div>

      {/* ─── File Info Bar ─────────────────────────────────── */}
      {selectedFileInfo && (
        <div className="border-t border-zinc-800/80 px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <Info className="h-3 w-3 text-zinc-600" />
            <span className="text-[11px] font-medium text-zinc-400 truncate">
              {selectedFileInfo.name}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span>{selectedFileInfo.type}</span>
            {selectedFileInfo.size !== null && (
              <span>{formatSize(selectedFileInfo.size)}</span>
            )}
            <span className="truncate flex-1 text-right opacity-60">
              {selectedFileInfo.path}
            </span>
          </div>
        </div>
      )}

      {/* ─── Operation Loading Overlay ──────────────────────── */}
      {operationLoading && (
        <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-30">
          <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
        </div>
      )}

      {/* ─── Context Menu ──────────────────────────────────── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 min-w-[180px] rounded-md border border-zinc-700/80 bg-zinc-900 py-1 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                closeContextMenu();
                setNewFilePath(
                  contextMenu.node.type === "folder"
                    ? `${contextMenu.node.path}/`
                    : contextMenu.node.path.split("/").slice(0, -1).join("/") +
                      "/"
                );
                setShowNewFileDialog(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5 text-zinc-500" />
              New File
            </button>
            <button
              onClick={() => {
                closeContextMenu();
                setNewFolderPath(
                  contextMenu.node.type === "folder"
                    ? `${contextMenu.node.path}/`
                    : contextMenu.node.path.split("/").slice(0, -1).join("/") +
                      "/"
                );
                setShowNewFolderDialog(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 transition-colors"
            >
              <FolderPlus className="h-3.5 w-3.5 text-zinc-500" />
              New Folder
            </button>

            <div className="my-1 border-t border-zinc-800" />

            {contextMenu.node.type === "file" && (
              <button
                onClick={() => {
                  startRename(contextMenu.node);
                  closeContextMenu();
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                Rename
              </button>
            )}

            <button
              onClick={() => {
                handleCopyPath(contextMenu.node.path);
                closeContextMenu();
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-zinc-300 hover:bg-white/5 transition-colors"
            >
              <Copy className="h-3.5 w-3.5 text-zinc-500" />
              Copy Path
            </button>

            <div className="my-1 border-t border-zinc-800" />

            {contextMenu.node.type === "file" && (
              <button
                onClick={() => {
                  closeContextMenu();
                  setShowDeleteConfirm(contextMenu.node.path);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        </>
      )}

      {/* ─── New File Dialog ───────────────────────────────── */}
      {showNewFileDialog && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowNewFileDialog(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700/80 bg-zinc-900 p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-zinc-200 mb-3">
              Create New File
            </h3>
            <label className="block text-[11px] text-zinc-500 mb-1">
              File path (e.g. src/components/Button.tsx)
            </label>
            <input
              autoFocus
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFile();
                if (e.key === "Escape") setShowNewFileDialog(false);
              }}
              placeholder="src/components/MyComponent.tsx"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-purple-500/60"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowNewFileDialog(false)}
                className="rounded-md px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                disabled={!newFilePath.trim() || operationLoading}
                className="rounded-md bg-purple-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {operationLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── New Folder Dialog ─────────────────────────────── */}
      {showNewFolderDialog && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowNewFolderDialog(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700/80 bg-zinc-900 p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-zinc-200 mb-3">
              Create New Folder
            </h3>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Folder path (e.g. src/utils)
            </label>
            <input
              autoFocus
              value={newFolderPath}
              onChange={(e) => setNewFolderPath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
                if (e.key === "Escape") setShowNewFolderDialog(false);
              }}
              placeholder="src/components"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-[13px] text-zinc-200 placeholder-zinc-600 outline-none focus:border-purple-500/60"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowNewFolderDialog(false)}
                className="rounded-md px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderPath.trim() || operationLoading}
                className="rounded-md bg-purple-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {operationLoading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Delete Confirmation Dialog ────────────────────── */}
      {showDeleteConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={() => setShowDeleteConfirm(null)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-700/80 bg-zinc-900 p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-red-300 mb-2">
              Delete File
            </h3>
            <p className="text-[12px] text-zinc-400 mb-1">
              Are you sure you want to delete this file?
            </p>
            <p className="text-[12px] text-zinc-500 font-mono bg-zinc-800/60 rounded px-2 py-1 mb-4 truncate">
              {showDeleteConfirm}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="rounded-md px-3 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={operationLoading}
                className="rounded-md bg-red-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {operationLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
