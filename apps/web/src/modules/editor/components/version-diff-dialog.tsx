"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  X,
  Loader2,
  FileText,
  FilePlus2,
  FileX2,
  FileEdit,
  ChevronLeft,
  ChevronRight,
  Columns2,
  AlignJustify,
  ArrowRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

type FileChangeType = "added" | "modified" | "deleted";

interface FileChange {
  path: string;
  type: FileChangeType;
  oldContent?: string;
  newContent?: string;
  oldSize?: number;
  newSize?: number;
}

interface DiffResult {
  changes: FileChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    totalChanges: number;
  };
}

interface VersionDiffDialogProps {
  open: boolean;
  onClose: () => void;
  diff: DiffResult | null;
  fromVersion: number;
  toVersion: number;
  loading?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────

function getChangeIcon(type: FileChangeType) {
  switch (type) {
    case "added":
      return FilePlus2;
    case "deleted":
      return FileX2;
    case "modified":
      return FileEdit;
  }
}

function getChangeColors(type: FileChangeType) {
  switch (type) {
    case "added":
      return {
        icon: "text-green-600",
        bg: "bg-green-50",
        badge: "bg-green-100 text-green-700",
        label: "Added",
      };
    case "deleted":
      return {
        icon: "text-red-600",
        bg: "bg-red-50",
        badge: "bg-red-100 text-red-700",
        label: "Deleted",
      };
    case "modified":
      return {
        icon: "text-amber-600",
        bg: "bg-amber-50",
        badge: "bg-amber-100 text-amber-700",
        label: "Modified",
      };
  }
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

function getFileDir(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") + "/";
}

function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    css: "css",
    html: "html",
    json: "json",
    md: "markdown",
    svg: "svg",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? ext;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ─── Line Diff Engine (LCS-based) ──────────────────────────

interface DiffLine {
  type: "unchanged" | "added" | "removed";
  oldLine?: number;
  newLine?: number;
  content: string;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;

  // For very large files, fall back to simple line-by-line comparison
  if (m * n > 500_000) {
    return computeSimpleDiff(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack
  let i = m;
  let j = n;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: "unchanged",
        oldLine: i,
        newLine: j,
        content: oldLines[i - 1]!,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      stack.push({ type: "added", newLine: j, content: newLines[j - 1]! });
      j--;
    } else {
      stack.push({ type: "removed", oldLine: i, content: oldLines[i - 1]! });
      i--;
    }
  }

  stack.reverse();
  return stack;
}

function computeSimpleDiff(
  oldLines: string[],
  newLines: string[]
): DiffLine[] {
  const result: DiffLine[] = [];
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (
      oi < oldLines.length &&
      ni < newLines.length &&
      oldLines[oi] === newLines[ni]
    ) {
      result.push({
        type: "unchanged",
        oldLine: oi + 1,
        newLine: ni + 1,
        content: oldLines[oi]!,
      });
      oi++;
      ni++;
    } else if (
      ni < newLines.length &&
      (oi >= oldLines.length || oldLines[oi] !== newLines[ni])
    ) {
      result.push({ type: "added", newLine: ni + 1, content: newLines[ni]! });
      ni++;
    } else {
      result.push({
        type: "removed",
        oldLine: oi + 1,
        content: oldLines[oi]!,
      });
      oi++;
    }
  }
  return result;
}

// ─── Diff Stats for a single file ──────────────────────────

function getDiffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "added") added++;
    if (line.type === "removed") removed++;
  }
  return { added, removed };
}

// ─── Component ──────────────────────────────────────────────

export function VersionDiffDialog({
  open,
  onClose,
  diff,
  fromVersion,
  toVersion,
  loading,
}: VersionDiffDialogProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"side-by-side" | "unified">(
    "unified"
  );

  // Auto-select first file when diff loads
  useEffect(() => {
    if (diff && diff.changes.length > 0 && !selectedFile) {
      setSelectedFile(diff.changes[0]!.path);
    }
  }, [diff, selectedFile]);

  // Reset when closing
  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
    }
  }, [open]);

  const selectedChange = diff?.changes.find((c) => c.path === selectedFile);

  // Compute file index for navigation
  const fileIndex = diff?.changes.findIndex((c) => c.path === selectedFile) ?? -1;
  const canGoPrev = fileIndex > 0;
  const canGoNext = diff ? fileIndex < diff.changes.length - 1 : false;

  const goToPrevFile = useCallback(() => {
    if (diff && canGoPrev) {
      setSelectedFile(diff.changes[fileIndex - 1]!.path);
    }
  }, [diff, canGoPrev, fileIndex]);

  const goToNextFile = useCallback(() => {
    if (diff && canGoNext) {
      setSelectedFile(diff.changes[fileIndex + 1]!.path);
    }
  }, [diff, canGoNext, fileIndex]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "[" && e.metaKey) goToPrevFile();
      if (e.key === "]" && e.metaKey) goToNextFile();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, goToPrevFile, goToNextFile]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="flex h-[85vh] w-[92vw] max-w-7xl flex-col rounded-xl border bg-background shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono font-semibold text-xs">
                v{fromVersion}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 font-mono font-semibold text-xs text-primary">
                v{toVersion}
              </span>
            </div>
            {diff && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="text-muted-foreground/30">|</span>
                {diff.summary.added > 0 && (
                  <span className="text-green-600">
                    +{diff.summary.added} added
                  </span>
                )}
                {diff.summary.modified > 0 && (
                  <span className="text-amber-600">
                    ~{diff.summary.modified} modified
                  </span>
                )}
                {diff.summary.deleted > 0 && (
                  <span className="text-red-600">
                    -{diff.summary.deleted} deleted
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* File navigation */}
            {diff && diff.changes.length > 1 && (
              <div className="flex items-center gap-1 mr-1">
                <button
                  onClick={goToPrevFile}
                  disabled={!canGoPrev}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous file"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground font-mono min-w-[3ch] text-center">
                  {fileIndex + 1}/{diff.changes.length}
                </span>
                <button
                  onClick={goToNextFile}
                  disabled={!canGoNext}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next file"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* View mode toggle */}
            <div className="flex rounded-lg border overflow-hidden">
              <button
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "unified"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                onClick={() => setViewMode("unified")}
                title="Unified view"
              >
                <AlignJustify className="h-3 w-3" />
                Unified
              </button>
              <button
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "side-by-side"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                onClick={() => setViewMode("side-by-side")}
                title="Side by side view"
              >
                <Columns2 className="h-3 w-3" />
                Split
              </button>
            </div>

            {/* Close */}
            <button
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {loading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading diff...</p>
            </div>
          ) : !diff ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="h-6 w-6 opacity-50" />
              <p className="text-sm">No diff data available</p>
            </div>
          ) : diff.changes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <FileText className="h-6 w-6 opacity-50" />
              <p className="text-sm">No changes between these versions</p>
            </div>
          ) : (
            <>
              {/* File list sidebar */}
              <div className="w-60 shrink-0 overflow-y-auto border-r bg-muted/20">
                <div className="p-2">
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Changed Files ({diff.summary.totalChanges})
                  </p>
                  <div className="space-y-0.5">
                    {diff.changes.map((change) => {
                      const colors = getChangeColors(change.type);
                      const Icon = getChangeIcon(change.type);
                      const isSelected = selectedFile === change.path;

                      return (
                        <button
                          key={change.path}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                            isSelected
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/50 text-foreground"
                          }`}
                          onClick={() => setSelectedFile(change.path)}
                        >
                          <Icon
                            className={`h-3.5 w-3.5 flex-none ${colors.icon}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">
                              {getFileName(change.path)}
                            </p>
                            {getFileDir(change.path) && (
                              <p className="text-[10px] text-muted-foreground truncate">
                                {getFileDir(change.path)}
                              </p>
                            )}
                          </div>
                          <span
                            className={`flex-none rounded px-1 py-0.5 text-[9px] font-semibold uppercase ${colors.badge}`}
                          >
                            {change.type[0]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Diff content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {!selectedChange ? (
                  <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-2">
                    <FileText className="h-6 w-6 opacity-50" />
                    <p className="text-sm">Select a file to view changes</p>
                  </div>
                ) : (
                  <>
                    {/* File header bar */}
                    <FileHeader change={selectedChange} />

                    {/* Diff content area */}
                    <div className="flex-1 overflow-auto">
                      {selectedChange.type === "added" ? (
                        <NewFileView change={selectedChange} />
                      ) : selectedChange.type === "deleted" ? (
                        <DeletedFileView change={selectedChange} />
                      ) : viewMode === "side-by-side" ? (
                        <SideBySideView change={selectedChange} />
                      ) : (
                        <UnifiedView change={selectedChange} />
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── File Header ────────────────────────────────────────────

function FileHeader({ change }: { change: FileChange }) {
  const colors = getChangeColors(change.type);
  const lang = getLanguageFromPath(change.path);

  return (
    <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-3.5 w-3.5 text-muted-foreground flex-none" />
        <span className="text-sm font-medium truncate">{change.path}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${colors.badge}`}>
          {colors.label}
        </span>
        {lang && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {lang}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-none">
        {change.oldSize !== undefined && change.newSize !== undefined && (
          <span>
            {formatFileSize(change.oldSize)} → {formatFileSize(change.newSize)}
          </span>
        )}
        {change.newSize !== undefined && change.oldSize === undefined && (
          <span className="text-green-600">
            +{formatFileSize(change.newSize)}
          </span>
        )}
        {change.oldSize !== undefined && change.newSize === undefined && (
          <span className="text-red-600">
            -{formatFileSize(change.oldSize)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── New File View ──────────────────────────────────────────

function NewFileView({ change }: { change: FileChange }) {
  const lines = (change.newContent ?? "").split("\n");

  return (
    <div className="font-mono text-xs leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="flex bg-green-50/50 hover:bg-green-50">
          <span className="inline-flex w-12 shrink-0 items-center justify-end pr-3 text-[10px] text-green-400 select-none border-r border-green-100">
            {i + 1}
          </span>
          <span className="inline-flex w-6 shrink-0 items-center justify-center text-green-500 select-none">
            +
          </span>
          <code className="flex-1 px-2 py-px text-green-900 whitespace-pre">
            {line}
          </code>
        </div>
      ))}
    </div>
  );
}

// ─── Deleted File View ──────────────────────────────────────

function DeletedFileView({ change }: { change: FileChange }) {
  const lines = (change.oldContent ?? "").split("\n");

  return (
    <div className="font-mono text-xs leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className="flex bg-red-50/50 hover:bg-red-50">
          <span className="inline-flex w-12 shrink-0 items-center justify-end pr-3 text-[10px] text-red-400 select-none border-r border-red-100">
            {i + 1}
          </span>
          <span className="inline-flex w-6 shrink-0 items-center justify-center text-red-500 select-none">
            -
          </span>
          <code className="flex-1 px-2 py-px text-red-900 whitespace-pre">
            {line}
          </code>
        </div>
      ))}
    </div>
  );
}

// ─── Side-by-Side View ──────────────────────────────────────

function SideBySideView({ change }: { change: FileChange }) {
  const lines = useMemo(
    () => computeLineDiff(change.oldContent ?? "", change.newContent ?? ""),
    [change.oldContent, change.newContent]
  );

  const stats = useMemo(() => getDiffStats(lines), [lines]);

  const oldLines = lines.filter((l) => l.type !== "added");
  const newLines = lines.filter((l) => l.type !== "removed");

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <DiffStatsBar stats={stats} />

      <div className="flex flex-1 overflow-auto">
        {/* Old side */}
        <div className="flex-1 border-r overflow-auto">
          <div className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm border-b px-3 py-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Before ({getFileName(change.path)})
            </span>
          </div>
          <div className="font-mono text-xs leading-relaxed">
            {oldLines.map((line, i) => (
              <div
                key={i}
                className={`flex ${
                  line.type === "removed"
                    ? "bg-red-50/70"
                    : ""
                } hover:bg-accent/30`}
              >
                <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none border-r border-border/30">
                  {line.oldLine ?? ""}
                </span>
                {line.type === "removed" && (
                  <span className="inline-flex w-5 shrink-0 items-center justify-center text-red-500 select-none">
                    -
                  </span>
                )}
                {line.type !== "removed" && (
                  <span className="inline-flex w-5 shrink-0" />
                )}
                <code
                  className={`flex-1 px-2 py-px whitespace-pre ${
                    line.type === "removed" ? "text-red-800" : ""
                  }`}
                >
                  {line.content}
                </code>
              </div>
            ))}
          </div>
        </div>

        {/* New side */}
        <div className="flex-1 overflow-auto">
          <div className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm border-b px-3 py-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              After ({getFileName(change.path)})
            </span>
          </div>
          <div className="font-mono text-xs leading-relaxed">
            {newLines.map((line, i) => (
              <div
                key={i}
                className={`flex ${
                  line.type === "added"
                    ? "bg-green-50/70"
                    : ""
                } hover:bg-accent/30`}
              >
                <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none border-r border-border/30">
                  {line.newLine ?? ""}
                </span>
                {line.type === "added" && (
                  <span className="inline-flex w-5 shrink-0 items-center justify-center text-green-500 select-none">
                    +
                  </span>
                )}
                {line.type !== "added" && (
                  <span className="inline-flex w-5 shrink-0" />
                )}
                <code
                  className={`flex-1 px-2 py-px whitespace-pre ${
                    line.type === "added" ? "text-green-800" : ""
                  }`}
                >
                  {line.content}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Unified View ───────────────────────────────────────────

function UnifiedView({ change }: { change: FileChange }) {
  const lines = useMemo(
    () => computeLineDiff(change.oldContent ?? "", change.newContent ?? ""),
    [change.oldContent, change.newContent]
  );

  const stats = useMemo(() => getDiffStats(lines), [lines]);

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <DiffStatsBar stats={stats} />

      <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`flex ${
              line.type === "added"
                ? "bg-green-50/70"
                : line.type === "removed"
                  ? "bg-red-50/70"
                  : ""
            } hover:bg-accent/30`}
          >
            {/* Old line number */}
            <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none">
              {line.type !== "added" ? (line.oldLine ?? "") : ""}
            </span>
            {/* New line number */}
            <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none border-r border-border/30">
              {line.type !== "removed" ? (line.newLine ?? "") : ""}
            </span>
            {/* Change indicator */}
            <span
              className={`inline-flex w-5 shrink-0 items-center justify-center select-none font-bold ${
                line.type === "added"
                  ? "text-green-500"
                  : line.type === "removed"
                    ? "text-red-500"
                    : "text-transparent"
              }`}
            >
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            {/* Content */}
            <code
              className={`flex-1 px-2 py-px whitespace-pre ${
                line.type === "added"
                  ? "text-green-800"
                  : line.type === "removed"
                    ? "text-red-800"
                    : ""
              }`}
            >
              {line.content}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Diff Stats Bar ─────────────────────────────────────────

function DiffStatsBar({
  stats,
}: {
  stats: { added: number; removed: number };
}) {
  const total = stats.added + stats.removed;
  if (total === 0) return null;

  const maxBlocks = 20;
  const addedBlocks = total > 0 ? Math.max(1, Math.round((stats.added / total) * maxBlocks)) : 0;
  const removedBlocks = total > 0 ? maxBlocks - addedBlocks : 0;

  return (
    <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-1.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="text-green-600 font-medium">+{stats.added}</span>
        <span className="text-muted-foreground/30">/</span>
        <span className="text-red-600 font-medium">-{stats.removed}</span>
      </div>
      <div className="flex gap-px">
        {Array.from({ length: addedBlocks }).map((_, i) => (
          <div key={`a-${i}`} className="h-2 w-1.5 rounded-sm bg-green-500" />
        ))}
        {Array.from({ length: removedBlocks }).map((_, i) => (
          <div key={`r-${i}`} className="h-2 w-1.5 rounded-sm bg-red-500" />
        ))}
      </div>
    </div>
  );
}
