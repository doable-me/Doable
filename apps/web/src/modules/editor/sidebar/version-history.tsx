"use client";

import { useState, useCallback } from "react";
import {
  Bookmark,
  Clock,
  Loader2,
  AlertCircle,
  RefreshCw,
  Star,
  Check,
} from "lucide-react";
import { useEditorStore } from "../hooks/use-editor-store";
import { RestoreDialog } from "../components/restore-dialog";
import { VersionDiffDialog } from "../components/version-diff-dialog";
import { useVersionHistory } from "./use-version-history";
import { groupVersionsByDate } from "./version-history-types";
import type { VersionEntry } from "./version-history-types";
import { VersionItem } from "./version-history-item";

// ─── Main Component ─────────────────────────────────────────
export function VersionHistory() {
  const { projectId } = useEditorStore();

  const {
    versions,
    loading,
    error,
    total,
    loadingMore,
    restoreTarget,
    restoreOpen,
    setRestoreOpen,
    setRestoreTarget,
    diffOpen,
    setDiffOpen,
    diffLoading,
    diffData,
    setDiffData,
    diffFromVersion,
    diffToVersion,
    bookmarkingIds,
    restoreSuccess,
    fetchVersions,
    loadMore,
    toggleBookmark,
    handleRestoreClick,
    handleRestoreConfirm,
    handleViewDiff,
    page,
    totalPages,
  } = useVersionHistory(projectId);

  const [filter, setFilter] = useState<"all" | "bookmarked">("all");
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set()
  );

  const toggleExpanded = useCallback((versionId: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  }, []);

  // ─── Filter ───────────────────────────────────────────────

  const filtered =
    filter === "bookmarked"
      ? versions.filter((v) => v.bookmarked)
      : versions;

  const grouped = groupVersionsByDate(filtered);

  // ─── Current version indicator ────────────────────────────

  const currentVersionId = versions.length > 0 ? versions[0]!.id : null;

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Version History
          </h3>
          {total > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {total}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => fetchVersions(1)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw
              className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
            />
          </button>
          <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/30 p-0.5">
            <button
              onClick={() => setFilter("all")}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("bookmarked")}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                filter === "bookmarked"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Star className="h-3 w-3 inline-block mr-0.5 -mt-px" />
              Saved
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading state */}
        {loading && versions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mb-2" />
            <p className="text-xs">Loading versions...</p>
          </div>
        )}

        {/* Error state */}
        {error && versions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <AlertCircle className="h-5 w-5 text-red-500 mb-2" />
            <p className="text-xs text-red-600 mb-2">{error}</p>
            <button
              onClick={() => fetchVersions(1)}
              className="text-xs text-primary hover:text-primary/80 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && versions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Clock className="h-6 w-6 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              No versions yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Versions are created automatically as the AI makes changes.
            </p>
          </div>
        )}

        {/* Empty bookmarked filter */}
        {!loading &&
          !error &&
          versions.length > 0 &&
          filter === "bookmarked" &&
          filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Bookmark className="h-6 w-6 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium text-muted-foreground">
                No bookmarked versions
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Click the bookmark icon on any version to save it.
              </p>
            </div>
          )}

        {/* Timeline */}
        {filtered.length > 0 && (
          <div className="relative">
            {Array.from(grouped.entries()).map(
              ([dateGroup, groupVersions]) => (
                <div key={dateGroup}>
                  {/* Date group header */}
                  <div className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm border-b border-border/50 px-3 py-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {dateGroup}
                    </span>
                  </div>

                  {/* Versions in this date group */}
                  <div className="relative px-3 py-1.5">
                    {/* Timeline line */}
                    <div className="absolute left-[23px] top-0 bottom-0 w-px bg-border" />

                    {groupVersions.map((version) => (
                      <VersionItem
                        key={version.id}
                        version={version}
                        isCurrent={version.id === currentVersionId}
                        isExpanded={expandedVersions.has(version.id)}
                        isFirstVersion={version.version_number === 1}
                        bookmarkingIds={bookmarkingIds}
                        toggleBookmark={toggleBookmark}
                        toggleExpanded={toggleExpanded}
                        handleRestoreClick={handleRestoreClick}
                        handleViewDiff={handleViewDiff}
                      />
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Load more */}
            {page < totalPages && (
              <div className="px-3 py-3">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Load older versions
                      <span className="text-muted-foreground/50">
                        ({total - versions.length} remaining)
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Restore success toast */}
      {restoreSuccess && (
        <div className="absolute bottom-4 left-3 right-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 shadow-lg">
            <Check className="h-3.5 w-3.5 text-green-600 flex-none" />
            <p className="text-xs font-medium text-green-800">
              {restoreSuccess}
            </p>
          </div>
        </div>
      )}

      {/* Restore Dialog */}
      <RestoreDialog
        open={restoreOpen}
        onClose={() => {
          setRestoreOpen(false);
          setRestoreTarget(null);
        }}
        onConfirm={handleRestoreConfirm}
        version={
          restoreTarget
            ? {
                id: restoreTarget.id,
                versionNumber: restoreTarget.version_number,
                description: restoreTarget.description,
                createdAt: restoreTarget.created_at,
                createdBy: restoreTarget.created_by,
                bookmarked: restoreTarget.bookmarked,
              }
            : null
        }
      />

      {/* Diff Dialog */}
      <VersionDiffDialog
        open={diffOpen}
        onClose={() => {
          setDiffOpen(false);
          setDiffData(null);
        }}
        diff={diffData}
        fromVersion={diffFromVersion}
        toVersion={diffToVersion}
        loading={diffLoading}
      />
    </div>
  );
}
