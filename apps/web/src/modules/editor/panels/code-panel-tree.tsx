"use client";

import { useMemo } from "react";
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
} from "lucide-react";
import type { FileTreeNode } from "./code-panel-utils";

// ─── File Icon Mapping ───────────────────────────────────────

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const iconMap: Record<string, typeof File> = {
    ts: FileCode2, tsx: FileCode2, js: FileCode2, jsx: FileCode2,
    json: FileJson, md: FileText, txt: FileText,
    png: Image, jpg: Image, jpeg: Image, svg: Image, gif: Image,
  };
  return iconMap[ext] ?? File;
}

function getFileIconColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const colorMap: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400",
    js: "text-yellow-400", jsx: "text-yellow-400",
    json: "text-yellow-300", css: "text-brand-400", scss: "text-pink-400",
    html: "text-orange-400", md: "text-muted-foreground",
    svg: "text-green-400", png: "text-green-400", jpg: "text-green-400",
  };
  return colorMap[ext] ?? "text-muted-foreground";
}

// ─── TreeNode Component ──────────────────────────────────────

export function TreeNode({
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
    ? isExpanded ? FolderOpen : Folder
    : getFileIcon(node.name);

  const matchesSearch =
    !searchQuery ||
    node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    node.path.toLowerCase().includes(searchQuery.toLowerCase());

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
          if (isDir) onToggleFolder(node.path);
          else onFileClick(node.path);
        }}
        className={`group flex w-full items-center gap-1 py-[3px] pr-2 text-[13px] transition-colors ${
          isSelected
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 flex-none text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 flex-none text-muted-foreground" />
          )
        ) : (
          <span className="w-3 flex-none" />
        )}
        <Icon
          className={`h-3.5 w-3.5 flex-none ${
            isDir ? "text-muted-foreground" : getFileIconColor(node.name)
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
