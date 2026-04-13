// ─── Types ──────────────────────────────────────────────────

export type FileChangeType = "added" | "modified" | "deleted";

export interface FileChange {
  path: string;
  type: FileChangeType;
  oldContent?: string;
  newContent?: string;
  oldSize?: number;
  newSize?: number;
}

export interface DiffResult {
  changes: FileChange[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
    totalChanges: number;
  };
}

export interface DiffLine {
  type: "unchanged" | "added" | "removed";
  oldLine?: number;
  newLine?: number;
  content: string;
}

// ─── Helpers ────────────────────────────────────────────────

export function getChangeIcon(type: FileChangeType): "added" | "deleted" | "modified" {
  return type;
}

export function getChangeColors(type: FileChangeType) {
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

export function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

export function getFileDir(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/") + "/";
}

export function getLanguageFromPath(path: string): string {
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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ─── Line Diff Engine (LCS-based) ──────────────────────────

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const m = oldLines.length;
  const n = newLines.length;

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

export function getDiffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.type === "added") added++;
    if (line.type === "removed") removed++;
  }
  return { added, removed };
}
