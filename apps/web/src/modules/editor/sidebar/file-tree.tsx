"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useEditorStore, type FileNode } from "../hooks/use-editor-store";
import { useProjectFiles } from "../hooks/use-project-files";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FileCode2,
  FileJson,
  FileText,
  Image,
  Trash2,
  Pencil,
  ClipboardCopy,
  Plus,
  Search,
  FilePlus,
  X,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredTokens } from "@/lib/api";

// ─── File icon mapping ──────────────────────────────────────

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

// ─── Flatten for search ─────────────────────────────────────

function flattenTree(nodes: FileNode[]): FileNode[] {
  const result: FileNode[] = [];
  function walk(items: FileNode[]) {
    for (const node of items) {
      if (node.type === "file") result.push(node);
      if (node.type === "directory" && node.children) walk(node.children);
    }
  }
  walk(nodes);
  return result;
}

// ─── Delete Confirmation Dialog ─────────────────────────────

function DeleteConfirmation({
  path,
  onConfirm,
  onCancel,
}: {
  path: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const name = path.split("/").pop() ?? path;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onCancel} />
      <div className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] rounded-lg border border-border bg-popover p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-none mt-0.5" />
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-foreground">Delete file?</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-mono font-medium text-foreground">{name}</span>?
              This cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Inline Input (for new file/folder or rename) ───────────

function InlineInput({
  initialValue,
  depth,
  icon: Icon,
  iconColor,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  depth: number;
  icon: typeof File;
  iconColor: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center gap-1 py-0.5 pr-2"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="w-3.5 flex-none" />
      <Icon className={cn("h-3.5 w-3.5 flex-none", iconColor)} />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSubmit}
        className="flex-1 min-w-0 rounded-sm border border-ring bg-background px-1 py-0.5 text-sm text-foreground focus:outline-none"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Context Menu ───────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

interface ContextMenuAction {
  label: string;
  icon: typeof File;
  action: () => void;
  destructive?: boolean;
  separator?: boolean;
}

function ContextMenu({
  state,
  onClose,
  onDelete,
  onRename,
  onCopyPath,
  onNewFile,
  onNewFolder,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onDelete: (path: string) => void;
  onRename: (node: FileNode) => void;
  onCopyPath: (path: string) => void;
  onNewFile: (parentPath: string) => void;
  onNewFolder: (parentPath: string) => void;
}) {
  const isDir = state.node.type === "directory";

  const items: ContextMenuAction[] = [];

  if (isDir) {
    items.push(
      { label: "New File", icon: FilePlus, action: () => { onNewFile(state.node.path); onClose(); } },
      { label: "New Folder", icon: FolderPlus, action: () => { onNewFolder(state.node.path); onClose(); } },
    );
  }

  items.push(
    { label: "Rename", icon: Pencil, action: () => { onRename(state.node); onClose(); }, separator: isDir },
    { label: "Copy Path", icon: ClipboardCopy, action: () => { onCopyPath(state.node.path); onClose(); } },
    {
      label: "Delete",
      icon: Trash2,
      action: () => {
        onDelete(state.node.path);
        onClose();
      },
      destructive: true,
      separator: true,
    },
  );

  // Clamp menu position to viewport
  const menuWidth = 180;
  const menuHeight = items.length * 32 + 8;
  const x = Math.min(state.x, window.innerWidth - menuWidth - 8);
  const y = Math.min(state.y, window.innerHeight - menuHeight - 8);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover py-1 shadow-lg"
        style={{ left: x, top: y }}
      >
        {items.map(({ label, icon: Icon, action, destructive, separator }, i) => (
          <div key={label}>
            {separator && i > 0 && <div className="my-1 border-t border-border" />}
            <button
              onClick={action}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                destructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Tree Node ──────────────────────────────────────────────

function TreeNode({
  node,
  depth,
  onFileClick,
  onContextMenu,
  onDoubleClick,
  activeFilePath,
  renamingPath,
  onRenameSubmit,
  onRenameCancel,
  inlineNew,
  onInlineNewSubmit,
  onInlineNewCancel,
}: {
  node: FileNode;
  depth: number;
  onFileClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onDoubleClick: (node: FileNode) => void;
  activeFilePath: string | null;
  renamingPath: string | null;
  onRenameSubmit: (oldPath: string, newName: string) => void;
  onRenameCancel: () => void;
  inlineNew: { parentPath: string; type: "file" | "folder" } | null;
  onInlineNewSubmit: (name: string) => void;
  onInlineNewCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isActive = node.path === activeFilePath;
  const isRenaming = renamingPath === node.path;
  const Icon = isDir
    ? expanded
      ? FolderOpen
      : Folder
    : getFileIcon(node.name);

  // Auto-expand directory when creating a new file/folder inside it
  useEffect(() => {
    if (isDir && inlineNew && inlineNew.parentPath === node.path && !expanded) {
      setExpanded(true);
    }
  }, [isDir, inlineNew, node.path, expanded]);

  if (isRenaming) {
    return (
      <InlineInput
        initialValue={node.name}
        depth={depth}
        icon={Icon}
        iconColor={isDir ? "text-blue-400" : "text-muted-foreground"}
        onSubmit={(name) => onRenameSubmit(node.path, name)}
        onCancel={onRenameCancel}
      />
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) {
            setExpanded(!expanded);
          } else {
            onFileClick(node.path);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, node);
        }}
        onDoubleClick={(e) => {
          e.preventDefault();
          onDoubleClick(node);
        }}
        className={cn(
          "group flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-sm transition-colors",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-none" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-none" />
          )
        ) : (
          <span className="w-3.5 flex-none" />
        )}
        <Icon
          className={cn(
            "h-3.5 w-3.5 flex-none",
            isDir ? "text-blue-400" : "text-muted-foreground"
          )}
        />
        <span className="truncate">{node.name}</span>
      </button>

      {isDir && expanded && (
        <div>
          {/* Inline new file/folder at the top of this directory */}
          {inlineNew && inlineNew.parentPath === node.path && (
            <InlineInput
              initialValue=""
              depth={depth + 1}
              icon={inlineNew.type === "folder" ? Folder : File}
              iconColor={inlineNew.type === "folder" ? "text-blue-400" : "text-muted-foreground"}
              onSubmit={onInlineNewSubmit}
              onCancel={onInlineNewCancel}
            />
          )}
          {node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
              onDoubleClick={onDoubleClick}
              activeFilePath={activeFilePath}
              renamingPath={renamingPath}
              onRenameSubmit={onRenameSubmit}
              onRenameCancel={onRenameCancel}
              inlineNew={inlineNew}
              onInlineNewSubmit={onInlineNewSubmit}
              onInlineNewCancel={onInlineNewCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main FileTree ──────────────────────────────────────────

export function FileTree() {
  const { fileTree, activeFilePath } = useEditorStore();
  const projectId = useEditorStore((s) => s.projectId);
  const { readFile, deleteFile, fetchFileTree } = useProjectFiles(projectId);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  /** Build Authorization header from stored tokens */
  const authHeaders = useCallback((): Record<string, string> => {
    const { accessToken } = getStoredTokens();
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  }, []);

  // Create a file using PUT (the API uses PUT for create/write)
  const createFileViaApi = useCallback(
    async (path: string, content: string = "") => {
      if (!projectId) return;
      try {
        await fetch(
          `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(path)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ content }),
          }
        );
        await fetchFileTree();
      } catch (err) {
        console.error("Failed to create file:", err);
      }
    },
    [projectId, fetchFileTree, API_BASE, authHeaders]
  );

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [inlineNew, setInlineNew] = useState<{ parentPath: string; type: "file" | "folder" } | null>(null);
  const [showNewFileInput, setShowNewFileInput] = useState(false);

  // Search across all files
  const flatFiles = useMemo(() => flattenTree(fileTree), [fileTree]);
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return flatFiles.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q)
    );
  }, [flatFiles, searchQuery]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileNode) => {
      setContextMenu({ x: e.clientX, y: e.clientY, node });
    },
    []
  );

  // Double-click to rename
  const handleDoubleClick = useCallback((node: FileNode) => {
    setRenamingPath(node.path);
  }, []);

  // Rename: create new file with new name, copy content, delete old
  const handleRenameSubmit = useCallback(
    async (oldPath: string, newName: string) => {
      setRenamingPath(null);
      if (!projectId) return;

      const oldName = oldPath.split("/").pop() ?? "";
      if (newName === oldName) return;

      const parentDir = oldPath.includes("/")
        ? oldPath.slice(0, oldPath.lastIndexOf("/"))
        : "";
      const newPath = parentDir ? `${parentDir}/${newName}` : newName;

      try {
        const headers = authHeaders();

        // Read old file content
        const readRes = await fetch(
          `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(oldPath)}`,
          { headers }
        );
        const readData = await readRes.json();
        const content = readData.data?.content ?? "";

        // Create new file via PUT (API uses PUT for write/create)
        await fetch(
          `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(newPath)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ content }),
          }
        );

        // Delete old file
        await fetch(
          `${API_BASE}/projects/${projectId}/files/${encodeURIComponent(oldPath)}`,
          { method: "DELETE", headers }
        );

        await fetchFileTree();
      } catch (err) {
        console.error("Failed to rename file:", err);
      }
    },
    [projectId, fetchFileTree, API_BASE, authHeaders]
  );

  // Copy path to clipboard
  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path).catch(() => {
      // Fallback for older browsers
      console.warn("Failed to copy path to clipboard");
    });
  }, []);

  // Delete with confirmation
  const handleDeleteRequest = useCallback((path: string) => {
    setDeleteTarget(path);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteFile(deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, deleteFile]);

  // New file in directory
  const handleNewFileInDir = useCallback((parentPath: string) => {
    setInlineNew({ parentPath, type: "file" });
  }, []);

  // New folder in directory
  const handleNewFolderInDir = useCallback((parentPath: string) => {
    setInlineNew({ parentPath, type: "folder" });
  }, []);

  // Submit inline new file/folder
  const handleInlineNewSubmit = useCallback(
    async (name: string) => {
      if (!inlineNew) return;
      const fullPath = `${inlineNew.parentPath}/${name}`;
      if (inlineNew.type === "folder") {
        // Create a placeholder file inside the folder to ensure the directory exists
        await createFileViaApi(`${fullPath}/.gitkeep`, "");
      } else {
        await createFileViaApi(fullPath, "");
      }
      setInlineNew(null);
    },
    [inlineNew, createFileViaApi]
  );

  // New file at root
  const handleNewFileAtRoot = useCallback(() => {
    setShowNewFileInput(true);
  }, []);

  const handleRootNewFileSubmit = useCallback(
    async (name: string) => {
      setShowNewFileInput(false);
      const path = name.includes("/") ? name : `src/${name}`;
      await createFileViaApi(path, "");
    },
    [createFileViaApi]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Explorer
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded transition-colors",
              showSearch
                ? "text-foreground bg-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Search files"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleNewFileAtRoot}
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
            title="New file"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1">
            <Search className="h-3 w-3 text-muted-foreground flex-none" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* New file at root input */}
      {showNewFileInput && (
        <div className="px-3 py-2 border-b border-border">
          <InlineInput
            initialValue=""
            depth={0}
            icon={File}
            iconColor="text-muted-foreground"
            onSubmit={handleRootNewFileSubmit}
            onCancel={() => setShowNewFileInput(false)}
          />
        </div>
      )}

      {/* Tree / Search Results */}
      <div className="flex-1 overflow-y-auto px-1">
        {showSearch && searchQuery ? (
          // Search results
          searchResults.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground text-center">
              No files matching &ldquo;{searchQuery}&rdquo;
            </p>
          ) : (
            <div className="py-1">
              {searchResults.map((node) => (
                <button
                  key={node.path}
                  onClick={() => {
                    readFile(node.path);
                    setShowSearch(false);
                    setSearchQuery("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                    node.path === activeFilePath
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  {(() => {
                    const Icon = getFileIcon(node.name);
                    return <Icon className="h-3.5 w-3.5 flex-none text-muted-foreground" />;
                  })()}
                  <div className="flex flex-col items-start min-w-0">
                    <span className="truncate text-sm">{node.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground/60 font-mono">
                      {node.path}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : fileTree.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            No files yet. Start chatting to generate code.
          </p>
        ) : (
          <div className="py-1">
            {fileTree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                onFileClick={readFile}
                onContextMenu={handleContextMenu}
                onDoubleClick={handleDoubleClick}
                activeFilePath={activeFilePath}
                renamingPath={renamingPath}
                onRenameSubmit={handleRenameSubmit}
                onRenameCancel={() => setRenamingPath(null)}
                inlineNew={inlineNew}
                onInlineNewSubmit={handleInlineNewSubmit}
                onInlineNewCancel={() => setInlineNew(null)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={handleDeleteRequest}
          onRename={(node) => setRenamingPath(node.path)}
          onCopyPath={handleCopyPath}
          onNewFile={handleNewFileInDir}
          onNewFolder={handleNewFolderInDir}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirmation
          path={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
