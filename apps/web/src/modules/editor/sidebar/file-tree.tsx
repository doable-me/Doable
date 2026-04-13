"use client";

import { useCallback, useMemo, useState } from "react";
import { useEditorStore, type FileNode } from "../hooks/use-editor-store";
import { useProjectFiles } from "../hooks/use-project-files";
import { File, Folder, Search, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getStoredTokens } from "@/lib/api";
import {
  getFileIcon,
  DeleteConfirmation,
  InlineInput,
  ContextMenu,
  TreeNode,
  type ContextMenuState,
} from "./file-tree-nodes";

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
