"use client";

import { useCallback, useState } from "react";
import { useEditorStore, type FileNode } from "../hooks/use-editor-store";
import { useProjectFiles } from "../hooks/use-project-files";
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
  Trash2,
  Pencil,
  Copy,
  Plus,
} from "lucide-react";

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

// ─── Context Menu ───────────────────────────────────────────
interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode;
}

function ContextMenu({
  state,
  onClose,
  onDelete,
}: {
  state: ContextMenuState;
  onClose: () => void;
  onDelete: (path: string) => void;
}) {
  const items = [
    { label: "Rename", icon: Pencil, action: () => onClose() },
    { label: "Duplicate", icon: Copy, action: () => onClose() },
    {
      label: "Delete",
      icon: Trash2,
      action: () => {
        onDelete(state.node.path);
        onClose();
      },
      destructive: true,
    },
  ];

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[160px] rounded-md border border-border bg-popover py-1 shadow-lg"
        style={{ left: state.x, top: state.y }}
      >
        {items.map(({ label, icon: Icon, action, destructive }) => (
          <button
            key={label}
            onClick={action}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
              destructive
                ? "text-destructive hover:bg-destructive/10"
                : "text-foreground hover:bg-accent"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
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
  activeFilePath,
}: {
  node: FileNode;
  depth: number;
  onFileClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  activeFilePath: string | null;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isActive = node.path === activeFilePath;
  const Icon = isDir
    ? expanded
      ? FolderOpen
      : Folder
    : getFileIcon(node.name);

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
        className={`group flex w-full items-center gap-1 rounded-sm py-1 pr-2 text-sm transition-colors ${
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        }`}
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
          className={`h-3.5 w-3.5 flex-none ${
            isDir ? "text-blue-400" : "text-muted-foreground"
          }`}
        />
        <span className="truncate">{node.name}</span>
      </button>

      {isDir && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              onContextMenu={onContextMenu}
              activeFilePath={activeFilePath}
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
  const { readFile, deleteFile } = useProjectFiles(
    useEditorStore.getState().projectId
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: FileNode) => {
      setContextMenu({ x: e.clientX, y: e.clientY, node });
    },
    []
  );

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Explorer
        </h3>
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          title="New file"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tree */}
      <div className="px-1">
        {fileTree.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            No files yet. Start chatting to generate code.
          </p>
        ) : (
          fileTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onFileClick={readFile}
              onContextMenu={handleContextMenu}
              activeFilePath={activeFilePath}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onDelete={deleteFile}
        />
      )}
    </div>
  );
}
