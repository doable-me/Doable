"use client";

import { useState, useCallback, useEffect } from "react";
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
import type { DiffResult, FileChange, FileChangeType } from "./version-diff-engine";
import { getChangeColors, getFileName, getFileDir } from "./version-diff-engine";
import { FileHeader, NewFileView, DeletedFileView, SideBySideView, UnifiedView } from "./version-diff-views";

// ─── Types ──────────────────────────────────────────────────

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 backdrop-blur-sm"
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

