"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Clock,
  RotateCcw,
  GitCommit,
  FileDiff,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Star,
  Check,
} from "lucide-react";
import { useEditorStore } from "../hooks/use-editor-store";
import { apiFetch } from "@/lib/api";
import { RestoreDialog } from "../components/restore-dialog";
import { VersionDiffDialog } from "../components/version-diff-dialog";

// ─── Types ──────────────────────────────────────────────────

interface VersionEntry {
  id: string;
  project_id: string;
  version_number: number;
  description: string | null;
  bookmarked: boolean;
  created_by: string;
  created_at: string;
  snapshot_data?: Record<string, unknown> | null;
}

interface VersionsResponse {
  data: VersionEntry[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

interface DiffChange {
  path: string;
  type: "added" | "modified" | "deleted";
  oldContent?: string;
  newContent?: string;
  oldSize?: number;
  newSize?: number;
}

interface DiffResult {
  changes: DiffChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    totalChanges: number;
  };
}

// ─── Date grouping helpers ──────────────────────────────────

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (dateDay.getTime() === today.getTime()) return "Today";
  if (dateDay.getTime() === yesterday.getTime()) return "Yesterday";

  // Same year: show "March 14"
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  // Different year: show "March 14, 2025"
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function groupVersionsByDate(
  versions: VersionEntry[]
): Map<string, VersionEntry[]> {
  const groups = new Map<string, VersionEntry[]>();
  for (const version of versions) {
    const group = getDateGroup(version.created_at);
    const existing = groups.get(group);
    if (existing) {
      existing.push(version);
    } else {
      groups.set(group, [version]);
    }
  }
  return groups;
}

// ─── Main Component ─────────────────────────────────────────

export function VersionHistory() {
  const { projectId } = useEditorStore();

  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "bookmarked">("all");
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(
    new Set()
  );

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // Restore dialog
  const [restoreTarget, setRestoreTarget] = useState<VersionEntry | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);

  // Diff dialog
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffData, setDiffData] = useState<DiffResult | null>(null);
  const [diffFromVersion, setDiffFromVersion] = useState(0);
  const [diffToVersion, setDiffToVersion] = useState(0);

  // Bookmark optimistic updates
  const [bookmarkingIds, setBookmarkingIds] = useState<Set<string>>(new Set());

  // Restore success toast
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ─── Fetch versions ───────────────────────────────────────

  const fetchVersions = useCallback(
    async (pageNum: number, append = false) => {
      if (!projectId) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await apiFetch<VersionsResponse>(
          `/projects/${projectId}/versions?page=${pageNum}&pageSize=20`
        );
        if (append) {
          setVersions((prev) => [...prev, ...result.data]);
        } else {
          setVersions(result.data);
        }
        setPage(result.pagination.page);
        setTotalPages(result.pagination.totalPages);
        setTotal(result.pagination.total);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load versions";
        setError(message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    fetchVersions(1);
  }, [fetchVersions]);

  // ─── Load more ────────────────────────────────────────────

  const loadMore = useCallback(() => {
    if (page < totalPages && !loadingMore) {
      fetchVersions(page + 1, true);
    }
  }, [page, totalPages, loadingMore, fetchVersions]);

  // ─── Toggle bookmark ─────────────────────────────────────

  const toggleBookmark = useCallback(
    async (version: VersionEntry) => {
      if (!projectId || bookmarkingIds.has(version.id)) return;

      const newBookmarked = !version.bookmarked;

      // Optimistic update
      setVersions((prev) =>
        prev.map((v) =>
          v.id === version.id ? { ...v, bookmarked: newBookmarked } : v
        )
      );
      setBookmarkingIds((prev) => new Set(prev).add(version.id));

      try {
        await apiFetch(
          `/projects/${projectId}/versions/${version.id}/bookmark`,
          {
            method: "PATCH",
            body: JSON.stringify({ bookmarked: newBookmarked }),
          }
        );
      } catch {
        // Revert on failure
        setVersions((prev) =>
          prev.map((v) =>
            v.id === version.id ? { ...v, bookmarked: !newBookmarked } : v
          )
        );
      } finally {
        setBookmarkingIds((prev) => {
          const next = new Set(prev);
          next.delete(version.id);
          return next;
        });
      }
    },
    [projectId, bookmarkingIds]
  );

  // ─── Restore flow ────────────────────────────────────────

  const handleRestoreClick = useCallback((version: VersionEntry) => {
    setRestoreTarget(version);
    setRestoreOpen(true);
  }, []);

  const handleRestoreConfirm = useCallback(async () => {
    if (!projectId || !restoreTarget) throw new Error("No version selected");

    await apiFetch(
      `/projects/${projectId}/versions/${restoreTarget.id}/restore`,
      {
        method: "POST",
        body: JSON.stringify({
          restoredBy: "user",
          projectPath: "", // Backend resolves from projectId
        }),
      }
    );

    // Show success toast
    setRestoreSuccess(
      `Restored to v${restoreTarget.version_number}`
    );
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setRestoreSuccess(null), 3000);

    // Refresh version list
    fetchVersions(1);
  }, [projectId, restoreTarget, fetchVersions]);

  // ─── Diff view ────────────────────────────────────────────

  const handleViewDiff = useCallback(
    async (version: VersionEntry) => {
      if (!projectId) return;

      // Find the previous version to diff against
      const versionIndex = versions.findIndex((v) => v.id === version.id);
      const previousVersion = versions[versionIndex + 1];

      if (!previousVersion) {
        // First version, nothing to diff against
        return;
      }

      setDiffFromVersion(previousVersion.version_number);
      setDiffToVersion(version.version_number);
      setDiffOpen(true);
      setDiffLoading(true);
      setDiffData(null);

      try {
        const result = await apiFetch<{ data: DiffResult }>(
          `/projects/${projectId}/versions/${previousVersion.id}/diff/${version.id}`
        );
        setDiffData(result.data);
      } catch {
        setDiffData(null);
      } finally {
        setDiffLoading(false);
      }
    },
    [projectId, versions]
  );

  // ─── Expand / collapse version details ────────────────────

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

                    {groupVersions.map((version) => {
                      const isCurrent = version.id === currentVersionId;
                      const isExpanded = expandedVersions.has(version.id);
                      const isFirstVersion =
                        version.version_number === 1;

                      return (
                        <div
                          key={version.id}
                          className="relative flex gap-3 pb-1 group"
                        >
                          {/* Timeline dot */}
                          <div
                            className={`relative z-[5] mt-2 flex h-5 w-5 flex-none items-center justify-center rounded-full border-2 transition-colors ${
                              isCurrent
                                ? "border-primary bg-primary shadow-sm shadow-primary/25"
                                : version.bookmarked
                                  ? "border-amber-400 bg-amber-50"
                                  : "border-border bg-background group-hover:border-muted-foreground"
                            }`}
                          >
                            {isCurrent ? (
                              <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                            ) : version.bookmarked ? (
                              <Star className="h-2 w-2 text-amber-500 fill-amber-500" />
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

                            {/* Meta row: time, version, author */}
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {formatTime(version.created_at)}
                              </span>
                              <span className="text-muted-foreground/30">
                                |
                              </span>
                              <span className="font-mono">
                                v{version.version_number}
                              </span>
                              <span className="text-muted-foreground/30">
                                |
                              </span>
                              <span>{version.created_by}</span>
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
                    })}
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
