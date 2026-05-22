import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";

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
  sha?: string;
  shortSha?: string;
  type?: "ai" | "user" | "sync" | "restore" | "migration" | "init" | "legacy";
  filesChanged?: number;
  insertions?: number;
  deletions?: number;
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

// ─── Hook ───────────────────────────────────────────────────

export function useVersionHistory(projectId: string | null) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          projectPath: "",
        }),
      }
    );

    setRestoreSuccess(`Restored to v${restoreTarget.version_number}`);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setRestoreSuccess(null), 3000);

    fetchVersions(1);
  }, [projectId, restoreTarget, fetchVersions]);

  // ─── Diff view ────────────────────────────────────────────

  const handleViewDiff = useCallback(
    async (version: VersionEntry) => {
      if (!projectId) return;

      const versionIndex = versions.findIndex((v) => v.id === version.id);
      const previousVersion = versions[versionIndex + 1];

      if (!previousVersion) return;

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

  return {
    versions,
    loading,
    error,
    page,
    totalPages,
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
  };
}
