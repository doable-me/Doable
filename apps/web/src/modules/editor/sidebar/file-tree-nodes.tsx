"use client";

import { useState, useEffect, useRef } from "react";
import { type FileNode } from "../hooks/use-editor-store";
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
  FilePlus,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── File icon mapping ──────────────────────────────────────

export function getFileIcon(name: string) {
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

// ─── Delete Confirmation Dialog ─────────────────────────────

export function DeleteConfirmation({
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

export function InlineInput({
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

export type { ContextMenuState };

export function ContextMenu({
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

export function TreeNode({
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
