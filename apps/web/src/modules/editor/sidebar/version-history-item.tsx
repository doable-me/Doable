import {
  Bookmark,
  BookmarkCheck,
  Clock,
  RotateCcw,
  GitCommit,
  FileDiff,
  ChevronDown,
  ChevronRight,
  Star,
  Sparkles,
  Pencil,
  Cloud,
  Archive,
} from "lucide-react";
import { formatTime } from "./version-history-types";
import type { VersionEntry } from "./version-history-types";

interface VersionItemProps {
  version: VersionEntry;
  isCurrent: boolean;
  isExpanded: boolean;
  isFirstVersion: boolean;
  bookmarkingIds: Set<string>;
  toggleBookmark: (version: VersionEntry) => void;
  toggleExpanded: (versionId: string) => void;
  handleRestoreClick: (version: VersionEntry) => void;
  handleViewDiff: (version: VersionEntry) => void;
}

export function VersionItem({
  version,
  isCurrent,
  isExpanded,
  isFirstVersion,
  bookmarkingIds,
  toggleBookmark,
  toggleExpanded,
  handleRestoreClick,
  handleViewDiff,
}: VersionItemProps) {
  return (
    <div className="relative flex gap-3 pb-1 group">
      {/* Timeline dot — color/icon varies by version type */}
      <div
        className={`relative z-[5] mt-2 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 transition-colors ${
          isCurrent
            ? "border-primary bg-primary shadow-sm shadow-primary/25"
            : version.bookmarked
              ? "border-amber-400 bg-amber-50"
              : version.type === "ai"
                ? "border-purple-400 bg-purple-50 dark:bg-purple-950"
                : version.type === "sync"
                  ? "border-green-400 bg-green-50 dark:bg-green-950"
                  : version.type === "restore"
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
                    : "border-border bg-background group-hover:border-muted-foreground"
        }`}
      >
        {isCurrent ? (
          <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
        ) : version.bookmarked ? (
          <Star className="h-2 w-2 text-amber-500 fill-amber-500" />
        ) : version.type === "ai" ? (
          <Sparkles className="h-2.5 w-2.5 text-purple-500" />
        ) : version.type === "user" ? (
          <Pencil className="h-2.5 w-2.5 text-blue-500" />
        ) : version.type === "sync" ? (
          <Cloud className="h-2.5 w-2.5 text-green-500" />
        ) : version.type === "restore" ? (
          <RotateCcw className="h-2.5 w-2.5 text-amber-500" />
        ) : version.type === "migration" || version.type === "legacy" ? (
          <Archive className="h-2.5 w-2.5 text-muted-foreground" />
        ) : (
          <GitCommit className="h-2.5 w-2.5 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div
        className={`flex-1 min-w-0 rounded-md py-1.5 px-2 -ml-1 transition-colors ${
          isCurrent
            ? "bg-primary/5"
            : "hover:bg-accent/50"
        }`}
      >
        {/* Top row: description + bookmark */}
        <div className="flex items-start justify-between gap-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {isCurrent && (
                <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-semibold text-primary leading-none">
                  CURRENT
                </span>
              )}
              <p
                className={`text-sm leading-tight truncate ${
                  isCurrent
                    ? "font-semibold text-foreground"
                    : "font-medium text-foreground"
                }`}
              >
                {version.description ??
                  `Version ${version.version_number}`}
              </p>
            </div>
          </div>

          {/* Bookmark button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleBookmark(version);
            }}
            className={`flex-none p-0.5 rounded transition-colors ${
              version.bookmarked
                ? "text-amber-500 hover:text-amber-600"
                : "text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
            }`}
            title={
              version.bookmarked
                ? "Remove bookmark"
                : "Bookmark this version"
            }
            disabled={bookmarkingIds.has(version.id)}
          >
            {version.bookmarked ? (
              <BookmarkCheck className="h-3.5 w-3.5" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Meta row: time, version/SHA, author, files changed */}
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatTime(version.created_at)}
          </span>
          <span className="text-muted-foreground/30">|</span>
          {version.shortSha ? (
            <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
              {version.shortSha}
            </span>
          ) : (
            <span className="font-mono">
              v{version.version_number}
            </span>
          )}
          <span className="text-muted-foreground/30">|</span>
          <span>{version.created_by}</span>
          {version.filesChanged != null && version.filesChanged > 0 && (
            <>
              <span className="text-muted-foreground/30">|</span>
              <span className="flex items-center gap-1">
                <FileDiff className="h-2.5 w-2.5" />
                {version.filesChanged} file{version.filesChanged !== 1 ? "s" : ""}
                {(version.insertions || version.deletions) && (
                  <span className="text-[10px]">
                    {version.insertions ? <span className="text-green-600">+{version.insertions}</span> : null}
                    {version.insertions && version.deletions ? " " : null}
                    {version.deletions ? <span className="text-red-600">-{version.deletions}</span> : null}
                  </span>
                )}
              </span>
            </>
          )}
        </div>

        {/* Expandable details */}
        <button
          onClick={() => toggleExpanded(version.id)}
          className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          Details
        </button>

        {isExpanded && (
          <div className="mt-1.5 rounded border border-border/50 bg-muted/20 p-2 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Created</span>
              <span>
                {new Date(
                  version.created_at
                ).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Author</span>
              <span className="font-medium text-foreground">
                {version.created_by}
              </span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Version</span>
              <span className="font-mono font-medium text-foreground">
                v{version.version_number}
              </span>
            </div>
            {version.description && (
              <div className="pt-1 border-t border-border/30">
                <p className="text-muted-foreground leading-relaxed">
                  {version.description}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isCurrent && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleRestoreClick(version);
              }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              Restore
            </button>
          )}
          {!isFirstVersion && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleViewDiff(version);
              }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <FileDiff className="h-3 w-3" />
              View diff
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
