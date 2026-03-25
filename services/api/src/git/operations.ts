// ─── Revert, Diff, Status ────────────────────────────────────
import { execGit } from "./exec.js";
import { autoCommit, getCommit, type GitCommitInfo } from "./commits.js";

export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  oldPath?: string;
}

export interface DiffResult {
  files: FileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  summary: string;
}

export interface GitStatusEntry {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  staged: boolean;
}

export interface GitStatusResult {
  entries: GitStatusEntry[];
  clean: boolean;
  hasUntracked: boolean;
}

function parseStatusCode(
  code: string
): "added" | "modified" | "deleted" | "renamed" | "untracked" {
  switch (code) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "?":
      return "untracked";
    default:
      return "modified";
  }
}

function parseDiffStatusCode(
  code: string
): "added" | "modified" | "deleted" | "renamed" {
  switch (code) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    default:
      return "modified";
  }
}

function parseNameStatus(
  lines: string[]
): Array<{ status: "added" | "modified" | "deleted" | "renamed"; path: string; oldPath?: string }> {
  const results: Array<{ status: "added" | "modified" | "deleted" | "renamed"; path: string; oldPath?: string }> = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    const statusRaw = parts[0] ?? "";
    const filePath = parts[1] ?? "";
    if (!statusRaw || !filePath) continue;
    // Renames look like R100\told\tnew
    if (statusRaw.startsWith("R")) {
      results.push({ status: "renamed", oldPath: filePath, path: parts[2] ?? filePath });
    } else {
      results.push({ status: parseDiffStatusCode(statusRaw), path: filePath });
    }
  }
  return results;
}

function parseNumstat(
  lines: string[]
): Map<string, { additions: number; deletions: number }> {
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const additions = parts[0] === "-" ? 0 : parseInt(parts[0] ?? "0", 10);
    const deletions = parts[1] === "-" ? 0 : parseInt(parts[1] ?? "0", 10);
    // For renames, numstat uses the new path (or {old => new} syntax)
    const path = parts[parts.length - 1] ?? "";
    map.set(path, { additions, deletions });
  }
  return map;
}

function buildDiffResult(
  nameStatusLines: string[],
  numstatLines: string[]
): DiffResult {
  const statuses = parseNameStatus(nameStatusLines);
  const stats = parseNumstat(numstatLines);

  let totalAdditions = 0;
  let totalDeletions = 0;
  const files: FileDiff[] = [];

  for (const entry of statuses) {
    const s = stats.get(entry.path) ?? { additions: 0, deletions: 0 };
    totalAdditions += s.additions;
    totalDeletions += s.deletions;
    files.push({
      path: entry.path,
      status: entry.status,
      additions: s.additions,
      deletions: s.deletions,
      oldPath: entry.oldPath,
    });
  }

  const summaryParts: string[] = [];
  if (files.length > 0) summaryParts.push(`${files.length} file${files.length === 1 ? "" : "s"} changed`);
  if (totalAdditions > 0) summaryParts.push(`${totalAdditions} insertion${totalAdditions === 1 ? "" : "s"}(+)`);
  if (totalDeletions > 0) summaryParts.push(`${totalDeletions} deletion${totalDeletions === 1 ? "" : "s"}(-)`);
  const summary = summaryParts.join(", ") || "No changes";

  return { files, totalAdditions, totalDeletions, summary };
}

export async function revertToCommit(
  projectPath: string,
  sha: string
): Promise<GitCommitInfo> {
  const original = await getCommit(projectPath, sha);
  const shortSha = original?.shortSha ?? sha.slice(0, 7);
  const originalMessage = original?.message ?? "unknown";

  await execGit(projectPath, ["checkout", sha, "--", "."]);
  await execGit(projectPath, ["add", "-A"]);

  const message = `Restored from ${shortSha}: ${originalMessage}`;
  const result = await autoCommit(projectPath, message, { type: "restore" });

  // If autoCommit returned null, it means the checkout produced no diff
  // (we're already at that state). Return the original commit info.
  if (!result) {
    return {
      sha: original?.sha ?? sha,
      shortSha,
      message,
      author: original?.author ?? { name: "Doable", email: "noreply@doable.me" },
      timestamp: original?.timestamp ?? new Date().toISOString(),
    };
  }

  return result;
}

export async function diffCommits(
  projectPath: string,
  sha1: string,
  sha2: string
): Promise<DiffResult> {
  const [nameStatus, numstat] = await Promise.all([
    execGit(projectPath, ["diff", "--name-status", `${sha1}..${sha2}`]),
    execGit(projectPath, ["diff", "--numstat", `${sha1}..${sha2}`]),
  ]);

  return buildDiffResult(
    nameStatus.stdout.split("\n"),
    numstat.stdout.split("\n")
  );
}

export async function diffWorking(projectPath: string): Promise<DiffResult> {
  const [nameStatus, numstat, status] = await Promise.all([
    execGit(projectPath, ["diff", "HEAD", "--name-status"]),
    execGit(projectPath, ["diff", "HEAD", "--numstat"]),
    execGit(projectPath, ["status", "--porcelain=v1"]),
  ]);

  // Include untracked files from status
  const untrackedLines: string[] = [];
  for (const line of status.stdout.split("\n")) {
    if (line.startsWith("??")) {
      const path = line.slice(3).trim();
      untrackedLines.push(`A\t${path}`);
    }
  }

  const allNameStatus = [
    ...nameStatus.stdout.split("\n"),
    ...untrackedLines,
  ];

  return buildDiffResult(allNameStatus, numstat.stdout.split("\n"));
}

export async function getStatus(
  projectPath: string
): Promise<GitStatusResult> {
  const { stdout } = await execGit(projectPath, [
    "status",
    "--porcelain=v1",
  ]);

  if (!stdout.trim()) {
    return { entries: [], clean: true, hasUntracked: false };
  }

  const entries: GitStatusEntry[] = [];
  let hasUntracked = false;

  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;

    const index = line[0] ?? " ";
    const worktree = line[1] ?? " ";
    const path = line.slice(3).trim();

    if (index === "?" && worktree === "?") {
      entries.push({ path, status: "untracked", staged: false });
      hasUntracked = true;
      continue;
    }

    // Staged status
    if (index !== " " && index !== "?") {
      entries.push({
        path,
        status: parseStatusCode(index),
        staged: true,
      });
    }

    // Unstaged status
    if (worktree !== " " && worktree !== "?") {
      entries.push({
        path,
        status: parseStatusCode(worktree),
        staged: false,
      });
    }
  }

  return {
    entries,
    clean: entries.length === 0,
    hasUntracked,
  };
}
