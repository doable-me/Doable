"use client";

import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Plus,
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
import type { FileTreeNode, FilesPanelProps } from "./files-helpers";
import { getFileIcon, getFileIconColor } from "./files-helpers";
import { useFilesPanel } from "./use-files-panel";

// ─── Main Component ─────────────────────────────────────────

export function FilesPanel({ projectId, onClose }: FilesPanelProps) {
  const fp = useFilesPanel(projectId);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ─── Render tree node ───────────────────────────────────
  const renderTreeNode = (node: FileTreeNode, depth: number) => {
    const isFolder = node.type === "folder";
    const isExpanded = fp.displayExpandedFolders.has(node.path);
    const isSelected = fp.selectedFile === node.path;
    const isRenaming = fp.renamingPath === node.path;
    const isDragOver = fp.dropTarget === node.path;
    const Icon = isFolder ? (isExpanded ? FolderOpen : Folder) : getFileIcon(node.name);
    const iconColor = isFolder ? "text-blue-400" : getFileIconColor(node.name);

    return (
      <div key={node.path}>
        {isRenaming ? (
          <div className="flex items-center gap-1.5 py-0.5" style={{ paddingLeft: `${depth * 14 + 8}px` }}>
            {isFolder ? <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" /> : <span className="w-3 flex-shrink-0" />}
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${iconColor}`} />
            <input
              ref={fp.renameInputRef}
              value={fp.renameValue}
              onChange={(e) => fp.setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") fp.handleRename(); if (e.key === "Escape") fp.setRenamingPath(null); }}
              onBlur={fp.handleRename}
              className="flex-1 min-w-0 bg-background border border-brand-500/60 rounded px-1.5 py-0.5 text-[12px] text-foreground outline-none"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => fp.handleSelectFile(node)}
            onContextMenu={(e) => fp.handleContextMenu(e, node)}
            draggable={node.type === "file"}
            onDragStart={(e) => fp.handleDragStart(e, node)}
            onDragOver={isFolder ? (e) => fp.handleDragOver(e, node.path) : undefined}
            onDragLeave={isFolder ? fp.handleDragLeave : undefined}
            onDrop={isFolder ? (e) => fp.handleDrop(e, node.path) : undefined}
            className={`group flex w-full items-center gap-1.5 py-1 pr-2 text-[12px] transition-colors rounded-sm ${
              isSelected && !isFolder
                ? "bg-brand-500/15 text-brand-300"
                : isDragOver && isFolder
                  ? "bg-blue-500/15 text-blue-300"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isFolder ? (isExpanded ? <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />) : <span className="w-3 flex-shrink-0" />}
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${iconColor}`} />
            <span className="truncate">{node.name}</span>
          </button>
        )}
        {isFolder && isExpanded && node.children && (
          <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Files</h2>
        <div className="flex items-center gap-1">
          <button onClick={() => fp.setShowNewFileDialog(true)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="New File"><Plus className="h-3.5 w-3.5" /></button>
          <button onClick={() => fp.setShowNewFolderDialog(true)} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="New Folder"><FolderPlus className="h-3.5 w-3.5" /></button>
          <button onClick={fp.fetchTree} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Refresh"><RefreshCw className="h-3 w-3" /></button>
          {onClose && <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors" title="Close"><X className="h-3.5 w-3.5" /></button>}
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1">
          <Search className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          <input type="text" placeholder="Search files..." value={fp.searchQuery} onChange={(e) => fp.setSearchQuery(e.target.value)} className="flex-1 bg-transparent text-[12px] text-foreground placeholder-muted-foreground outline-none" />
          {fp.searchQuery && <button onClick={() => fp.setSearchQuery("")} className="text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>}
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {fp.loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mb-2" /><span className="text-[11px]">Loading files...</span></div>
        ) : fp.error ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-4 text-center">
            <AlertCircle className="h-5 w-5 text-red-400/60 mb-2" />
            <span className="text-[11px] text-red-400/80 mb-2">{fp.error}</span>
            <button onClick={() => { fp.setError(null); fp.fetchTree(); }} className="text-[11px] text-brand-400 hover:text-brand-300 underline">Retry</button>
          </div>
        ) : fp.filteredTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground px-4 text-center">
            <File className="h-6 w-6 mb-2 opacity-40" />
            <span className="text-[11px]">{fp.searchQuery ? "No files match your search" : "No files yet. Start chatting to generate code."}</span>
          </div>
        ) : (
          fp.filteredTree.map((node) => renderTreeNode(node, 0))
        )}
      </div>

      {/* File Info Bar */}
      {fp.selectedFileInfo && (
        <div className="border-t border-border px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <Info className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground truncate">{fp.selectedFileInfo.name}</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span>{fp.selectedFileInfo.type}</span>
            {fp.selectedFileInfo.size !== null && <span>{formatSize(fp.selectedFileInfo.size)}</span>}
            <span className="truncate flex-1 text-right opacity-60">{fp.selectedFileInfo.path}</span>
          </div>
        </div>
      )}

      {/* Operation Loading */}
      {fp.operationLoading && (
        <div className="absolute inset-0 bg-foreground/20 flex items-center justify-center z-30"><Loader2 className="h-5 w-5 animate-spin text-brand-400" /></div>
      )}

      {/* Context Menu */}
      {fp.contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={fp.closeContextMenu} />
          <div className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover py-1 shadow-xl" style={{ left: fp.contextMenu.x, top: fp.contextMenu.y }}>
            <button onClick={() => { fp.closeContextMenu(); fp.setNewFilePath(fp.contextMenu!.node.type === "folder" ? `${fp.contextMenu!.node.path}/` : fp.contextMenu!.node.path.split("/").slice(0, -1).join("/") + "/"); fp.setShowNewFileDialog(true); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent transition-colors"><Plus className="h-3.5 w-3.5 text-muted-foreground" />New File</button>
            <button onClick={() => { fp.closeContextMenu(); fp.setNewFolderPath(fp.contextMenu!.node.type === "folder" ? `${fp.contextMenu!.node.path}/` : fp.contextMenu!.node.path.split("/").slice(0, -1).join("/") + "/"); fp.setShowNewFolderDialog(true); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent transition-colors"><FolderPlus className="h-3.5 w-3.5 text-muted-foreground" />New Folder</button>
            <div className="my-1 border-t border-border" />
            {fp.contextMenu.node.type === "file" && (
              <button onClick={() => { fp.startRename(fp.contextMenu!.node); fp.closeContextMenu(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent transition-colors"><Pencil className="h-3.5 w-3.5 text-muted-foreground" />Rename</button>
            )}
            <button onClick={() => { fp.handleCopyPath(fp.contextMenu!.node.path); fp.closeContextMenu(); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-foreground hover:bg-accent transition-colors"><Copy className="h-3.5 w-3.5 text-muted-foreground" />Copy Path</button>
            <div className="my-1 border-t border-border" />
            {fp.contextMenu.node.type === "file" && (
              <button onClick={() => { fp.closeContextMenu(); fp.setShowDeleteConfirm(fp.contextMenu!.node.path); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10 transition-colors"><Trash2 className="h-3.5 w-3.5" />Delete</button>
            )}
          </div>
        </>
      )}

      {/* New File Dialog */}
      {fp.showNewFileDialog && (
        <>
          <div className="fixed inset-0 z-50 bg-foreground/45" onClick={() => fp.setShowNewFileDialog(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-foreground mb-3">Create New File</h3>
            <label className="block text-[11px] text-muted-foreground mb-1">File path (e.g. src/components/Button.tsx)</label>
            <input autoFocus value={fp.newFilePath} onChange={(e) => fp.setNewFilePath(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") fp.handleCreateFile(); if (e.key === "Escape") fp.setShowNewFileDialog(false); }} placeholder="src/components/MyComponent.tsx" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-brand-500/60" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => fp.setShowNewFileDialog(false)} className="rounded-md px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button onClick={fp.handleCreateFile} disabled={!fp.newFilePath.trim() || fp.operationLoading} className="rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{fp.operationLoading ? "Creating..." : "Create"}</button>
            </div>
          </div>
        </>
      )}

      {/* New Folder Dialog */}
      {fp.showNewFolderDialog && (
        <>
          <div className="fixed inset-0 z-50 bg-foreground/45" onClick={() => fp.setShowNewFolderDialog(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-foreground mb-3">Create New Folder</h3>
            <label className="block text-[11px] text-muted-foreground mb-1">Folder path (e.g. src/components)</label>
            <input autoFocus value={fp.newFolderPath} onChange={(e) => fp.setNewFolderPath(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") fp.handleCreateFolder(); if (e.key === "Escape") fp.setShowNewFolderDialog(false); }} placeholder="src/components" className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-[13px] text-foreground placeholder-muted-foreground outline-none focus:border-brand-500/60" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => fp.setShowNewFolderDialog(false)} className="rounded-md px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button onClick={fp.handleCreateFolder} disabled={!fp.newFolderPath.trim() || fp.operationLoading} className="rounded-md bg-brand-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{fp.operationLoading ? "Creating..." : "Create"}</button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirm Dialog */}
      {fp.showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-50 bg-foreground/45" onClick={() => fp.setShowDeleteConfirm(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 shadow-2xl">
            <h3 className="text-sm font-medium text-foreground mb-2">Delete File</h3>
            <p className="text-[12px] text-muted-foreground mb-1">Are you sure you want to delete:</p>
            <p className="text-[12px] font-mono text-red-400 mb-4 break-all">{fp.showDeleteConfirm}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => fp.setShowDeleteConfirm(null)} className="rounded-md px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">Cancel</button>
              <button onClick={() => fp.handleDelete(fp.showDeleteConfirm!)} disabled={fp.operationLoading} className="rounded-md bg-red-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-500 disabled:opacity-40 transition-colors">{fp.operationLoading ? "Deleting..." : "Delete"}</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
