"use client";

import { useState, useCallback } from "react";
// ─── Types ──────────────────────────────────────────────────
type FileChangeType = "added" | "modified" | "deleted";
interface FileChange { path: string; type: FileChangeType; oldContent?: string; newContent?: string; }
interface DiffResult { changes: FileChange[]; summary: { added: number; modified: number; deleted: number; totalChanges: number; }; }
interface VersionDiffDialogProps { open: boolean; onClose: () => void; diff: DiffResult | null; fromVersion: number; toVersion: number; loading?: boolean; }

function getChangeColor(type: FileChangeType): string {
  return type === "added" ? "text-green-600 bg-green-50" : type === "deleted" ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50";
}
function getChangeIcon(type: FileChangeType): string {
  return type === "added" ? "+" : type === "deleted" ? "-" : "~";
}

function computeLineDiff(oldText: string, newText: string) {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: Array<{
    type: "unchanged" | "added" | "removed";
    oldLine?: number;
    newLine?: number;
    content: string;
  }> = [];

  let oi = 0;
  let ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "unchanged", oldLine: oi + 1, newLine: ni + 1, content: oldLines[oi]! });
      oi++;
      ni++;
    } else if (ni < newLines.length && (oi >= oldLines.length || oldLines[oi] !== newLines[ni])) {
      result.push({ type: "added", newLine: ni + 1, content: newLines[ni]! });
      ni++;
    } else {
      result.push({ type: "removed", oldLine: oi + 1, content: oldLines[oi]! });
      oi++;
    }
  }
  return result;
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
  const [viewMode, setViewMode] = useState<"side-by-side" | "unified">("side-by-side");

  const selectedChange = diff?.changes.find((c) => c.path === selectedFile);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="flex h-[85vh] w-[90vw] max-w-7xl flex-col rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              Version Diff: v{fromVersion} → v{toVersion}
            </h2>
            {diff && (
              <p className="mt-1 text-sm text-muted-foreground">
                {diff.summary.added} added, {diff.summary.modified} modified,{" "}
                {diff.summary.deleted} deleted
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-md border">
              <button
                className={`px-3 py-1.5 text-xs font-medium ${
                  viewMode === "side-by-side" ? "bg-primary text-primary-foreground" : ""
                }`}
                onClick={() => setViewMode("side-by-side")}
              >
                Side by Side
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium ${
                  viewMode === "unified" ? "bg-primary text-primary-foreground" : ""
                }`}
                onClick={() => setViewMode("unified")}
              >
                Unified
              </button>
            </div>
            <button
              className="rounded-md p-2 hover:bg-accent"
              onClick={onClose}
              aria-label="Close"
            >
              X
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {loading ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground">Loading diff...</p>
            </div>
          ) : !diff ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-muted-foreground">No diff data available</p>
            </div>
          ) : (
            <>
              {/* File list sidebar */}
              <div className="w-64 shrink-0 overflow-y-auto border-r bg-muted/30">
                <div className="p-2">
                  <p className="mb-2 px-2 text-xs font-medium uppercase text-muted-foreground">
                    Changed Files ({diff.summary.totalChanges})
                  </p>
                  {diff.changes.map((change) => (
                    <button
                      key={change.path}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        selectedFile === change.path
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50"
                      }`}
                      onClick={() => setSelectedFile(change.path)}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded text-xs font-bold ${getChangeColor(
                          change.type
                        )}`}
                      >
                        {getChangeIcon(change.type)}
                      </span>
                      <span className="truncate">{change.path}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Diff content */}
              <div className="flex-1 overflow-auto">
                {!selectedChange ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    Select a file to view changes
                  </div>
                ) : selectedChange.type === "added" ? (
                  <div className="p-4">
                    <p className="mb-2 text-sm font-medium text-green-600">
                      New file: {selectedChange.path}
                    </p>
                    <pre className="overflow-auto rounded-md bg-green-50 p-4 text-xs leading-relaxed">
                      <code>{selectedChange.newContent}</code>
                    </pre>
                  </div>
                ) : selectedChange.type === "deleted" ? (
                  <div className="p-4">
                    <p className="mb-2 text-sm font-medium text-red-600">
                      Deleted file: {selectedChange.path}
                    </p>
                    <pre className="overflow-auto rounded-md bg-red-50 p-4 text-xs leading-relaxed">
                      <code>{selectedChange.oldContent}</code>
                    </pre>
                  </div>
                ) : viewMode === "side-by-side" ? (
                  <SideBySideView change={selectedChange} />
                ) : (
                  <UnifiedView change={selectedChange} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Side-by-Side View ──────────────────────────────────────

function SideBySideView({ change }: { change: FileChange }) {
  const lines = computeLineDiff(change.oldContent ?? "", change.newContent ?? "");

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto border-r">
        <div className="p-2">
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Old</p>
          <pre className="text-xs leading-relaxed">
            {lines
              .filter((l) => l.type !== "added")
              .map((line, i) => (
                <div
                  key={i}
                  className={`flex ${
                    line.type === "removed" ? "bg-red-50 text-red-800" : ""
                  }`}
                >
                  <span className="inline-block w-10 shrink-0 pr-2 text-right text-muted-foreground">
                    {line.oldLine ?? ""}
                  </span>
                  <code>{line.content}</code>
                </div>
              ))}
          </pre>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="p-2">
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">New</p>
          <pre className="text-xs leading-relaxed">
            {lines
              .filter((l) => l.type !== "removed")
              .map((line, i) => (
                <div
                  key={i}
                  className={`flex ${
                    line.type === "added" ? "bg-green-50 text-green-800" : ""
                  }`}
                >
                  <span className="inline-block w-10 shrink-0 pr-2 text-right text-muted-foreground">
                    {line.newLine ?? ""}
                  </span>
                  <code>{line.content}</code>
                </div>
              ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Unified View ───────────────────────────────────────────

function UnifiedView({ change }: { change: FileChange }) {
  const lines = computeLineDiff(change.oldContent ?? "", change.newContent ?? "");

  return (
    <div className="p-4">
      <pre className="text-xs leading-relaxed">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`flex ${
              line.type === "added"
                ? "bg-green-50 text-green-800"
                : line.type === "removed"
                  ? "bg-red-50 text-red-800"
                  : ""
            }`}
          >
            <span className="inline-block w-10 shrink-0 pr-2 text-right text-muted-foreground">
              {line.oldLine ?? ""}
            </span>
            <span className="inline-block w-10 shrink-0 pr-2 text-right text-muted-foreground">
              {line.newLine ?? ""}
            </span>
            <span className="inline-block w-4 shrink-0 text-center font-bold">
              {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
            </span>
            <code>{line.content}</code>
          </div>
        ))}
      </pre>
    </div>
  );
}
