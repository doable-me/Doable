import type { Snapshot } from "./snapshot.js";

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

// ─── Diff Engine ────────────────────────────────────────────

export function diffSnapshots(
  oldSnapshot: Snapshot,
  newSnapshot: Snapshot
): DiffResult {
  const oldFiles = new Map<string, { content: string; size: number }>();
  const newFiles = new Map<string, { content: string; size: number }>();

  for (const f of oldSnapshot.files) {
    oldFiles.set(f.path, { content: f.content, size: f.size });
  }
  for (const f of newSnapshot.files) {
    newFiles.set(f.path, { content: f.content, size: f.size });
  }

  const changes: FileChange[] = [];

  // Find added and modified files
  for (const [path, newFile] of newFiles) {
    const oldFile = oldFiles.get(path);

    if (!oldFile) {
      changes.push({
        path,
        type: "added",
        newContent: newFile.content,
        newSize: newFile.size,
      });
    } else if (oldFile.content !== newFile.content) {
      changes.push({
        path,
        type: "modified",
        oldContent: oldFile.content,
        newContent: newFile.content,
        oldSize: oldFile.size,
        newSize: newFile.size,
      });
    }
  }

  // Find deleted files
  for (const [path, oldFile] of oldFiles) {
    if (!newFiles.has(path)) {
      changes.push({
        path,
        type: "deleted",
        oldContent: oldFile.content,
        oldSize: oldFile.size,
      });
    }
  }

  // Sort: deleted first, then modified, then added
  const typeOrder: Record<FileChangeType, number> = {
    deleted: 0,
    modified: 1,
    added: 2,
  };
  changes.sort((a, b) => {
    const orderDiff = typeOrder[a.type] - typeOrder[b.type];
    if (orderDiff !== 0) return orderDiff;
    return a.path.localeCompare(b.path);
  });

  const summary = {
    added: changes.filter((c) => c.type === "added").length,
    modified: changes.filter((c) => c.type === "modified").length,
    deleted: changes.filter((c) => c.type === "deleted").length,
    totalChanges: changes.length,
  };

  return { changes, summary };
}

// ─── Line Diff ──────────────────────────────────────────────

export interface LineDiff {
  type: "unchanged" | "added" | "removed";
  lineNumber: number;
  content: string;
}

/**
 * Simple line-by-line diff for display. Uses a basic LCS approach
 * suitable for small-to-medium files.
 */
export function diffLines(oldText: string, newText: string): LineDiff[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: LineDiff[] = [];

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
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

  // Backtrack to produce diff
  let i = m;
  let j = n;
  const stack: LineDiff[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: "unchanged",
        lineNumber: j,
        content: newLines[j - 1]!,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
      stack.push({
        type: "added",
        lineNumber: j,
        content: newLines[j - 1]!,
      });
      j--;
    } else {
      stack.push({
        type: "removed",
        lineNumber: i,
        content: oldLines[i - 1]!,
      });
      i--;
    }
  }

  // Reverse to get correct order
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k]!);
  }

  return result;
}
