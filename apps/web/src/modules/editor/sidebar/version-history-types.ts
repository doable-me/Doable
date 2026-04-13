// ─── Types ──────────────────────────────────────────────────

export interface VersionEntry {
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

export interface VersionsResponse {
  data: VersionEntry[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface DiffChange {
  path: string;
  type: "added" | "modified" | "deleted";
  oldContent?: string;
  newContent?: string;
  oldSize?: number;
  newSize?: number;
}

export interface DiffResult {
  changes: DiffChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    totalChanges: number;
  };
}

// ─── Date grouping helpers ──────────────────────────────────

export function getDateGroup(dateStr: string): string {
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

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function groupVersionsByDate(
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
