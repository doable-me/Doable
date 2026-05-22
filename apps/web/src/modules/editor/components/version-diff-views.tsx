"use client";

import { useMemo } from "react";
import { FileText } from "lucide-react";
import type { FileChange, DiffLine } from "./version-diff-engine";
import {
  getChangeColors,
  getFileName,
  getLanguageFromPath,
  formatFileSize,
  computeLineDiff,
  getDiffStats,
} from "./version-diff-engine";

// ─── FileHeader ─────────────────────────────────────────────

export function FileHeader({ change }: { change: FileChange }) {
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
          <span>{formatFileSize(change.oldSize)} → {formatFileSize(change.newSize)}</span>
        )}
        {change.newSize !== undefined && change.oldSize === undefined && (
          <span className="text-green-600">+{formatFileSize(change.newSize)}</span>
        )}
        {change.oldSize !== undefined && change.newSize === undefined && (
          <span className="text-red-600">-{formatFileSize(change.oldSize)}</span>
        )}
      </div>
    </div>
  );
}

// ─── NewFileView ────────────────────────────────────────────

export function NewFileView({ change }: { change: FileChange }) {
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
          <code className="flex-1 px-2 py-px text-green-900 whitespace-pre">{line}</code>
        </div>
      ))}
    </div>
  );
}

// ─── DeletedFileView ────────────────────────────────────────

export function DeletedFileView({ change }: { change: FileChange }) {
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
          <code className="flex-1 px-2 py-px text-red-900 whitespace-pre">{line}</code>
        </div>
      ))}
    </div>
  );
}

// ─── DiffStatsBar ───────────────────────────────────────────

export function DiffStatsBar({
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

// ─── SideBySideView ─────────────────────────────────────────

export function SideBySideView({ change }: { change: FileChange }) {
  const lines = useMemo(
    () => computeLineDiff(change.oldContent ?? "", change.newContent ?? ""),
    [change.oldContent, change.newContent]
  );

  const stats = useMemo(() => getDiffStats(lines), [lines]);

  const oldLines = lines.filter((l) => l.type !== "added");
  const newLines = lines.filter((l) => l.type !== "removed");

  return (
    <div className="flex flex-col h-full">
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
                className={`flex ${line.type === "removed" ? "bg-red-50/70" : ""} hover:bg-accent/30`}
              >
                <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none border-r border-border/30">
                  {line.oldLine ?? ""}
                </span>
                {line.type === "removed" ? (
                  <span className="inline-flex w-5 shrink-0 items-center justify-center text-red-500 select-none">-</span>
                ) : (
                  <span className="inline-flex w-5 shrink-0" />
                )}
                <code className={`flex-1 px-2 py-px whitespace-pre ${line.type === "removed" ? "text-red-800" : ""}`}>
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
                className={`flex ${line.type === "added" ? "bg-green-50/70" : ""} hover:bg-accent/30`}
              >
                <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none border-r border-border/30">
                  {line.newLine ?? ""}
                </span>
                {line.type === "added" ? (
                  <span className="inline-flex w-5 shrink-0 items-center justify-center text-green-500 select-none">+</span>
                ) : (
                  <span className="inline-flex w-5 shrink-0" />
                )}
                <code className={`flex-1 px-2 py-px whitespace-pre ${line.type === "added" ? "text-green-800" : ""}`}>
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

// ─── UnifiedView ────────────────────────────────────────────

export function UnifiedView({ change }: { change: FileChange }) {
  const lines = useMemo(
    () => computeLineDiff(change.oldContent ?? "", change.newContent ?? ""),
    [change.oldContent, change.newContent]
  );

  const stats = useMemo(() => getDiffStats(lines), [lines]);

  return (
    <div className="flex flex-col h-full">
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
            <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none">
              {line.type !== "added" ? (line.oldLine ?? "") : ""}
            </span>
            <span className="inline-flex w-10 shrink-0 items-center justify-end pr-2 text-[10px] text-muted-foreground/50 select-none border-r border-border/30">
              {line.type !== "removed" ? (line.newLine ?? "") : ""}
            </span>
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
