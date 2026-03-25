// ─── Commit Operations ───────────────────────────────────────
import { execGit, GitError } from "./exec.js";

export interface GitAuthor {
  name: string;
  email: string;
}

export interface CommitOpts {
  author?: GitAuthor;
  type?: "ai" | "user" | "sync" | "restore" | "migration" | "init";
  sessionMessageId?: string;
}

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: GitAuthor;
  timestamp: string;
}

export interface GitLogEntry extends GitCommitInfo {
  filesChanged: number;
  insertions: number;
  deletions: number;
  type: string;
  sessionMessageId?: string;
}

const COMMIT_BOUNDARY = "---COMMIT_BOUNDARY---";

const DEFAULT_AUTHOR: GitAuthor = {
  name: "Doable",
  email: "noreply@doable.me",
};

function parseTrailer(body: string, key: string): string | undefined {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const match = body.match(pattern);
  return match?.[1]?.trim();
}

function parseShortstat(line: string): {
  filesChanged: number;
  insertions: number;
  deletions: number;
} {
  const files = line.match(/(\d+)\s+file/);
  const ins = line.match(/(\d+)\s+insertion/);
  const del = line.match(/(\d+)\s+deletion/);
  return {
    filesChanged: files ? parseInt(files[1]!, 10) : 0,
    insertions: ins ? parseInt(ins[1]!, 10) : 0,
    deletions: del ? parseInt(del[1]!, 10) : 0,
  };
}

export async function autoCommit(
  projectPath: string,
  message: string,
  opts?: CommitOpts
): Promise<GitCommitInfo | null> {
  await execGit(projectPath, ["add", "-A"]);

  // Check if there are staged changes
  try {
    await execGit(projectPath, ["diff", "--cached", "--quiet"]);
    // If diff --cached --quiet succeeds (exit 0), working tree is clean
    return null;
  } catch {
    // Non-zero exit means there are staged changes — continue
  }

  const author = opts?.author ?? DEFAULT_AUTHOR;
  const trailers: string[] = [];
  if (opts?.type) trailers.push(`Doable-Type: ${opts.type}`);
  if (opts?.sessionMessageId)
    trailers.push(`Doable-Session: ${opts.sessionMessageId}`);

  const fullMessage =
    trailers.length > 0
      ? `${message}\n\n${trailers.join("\n")}`
      : message;

  await execGit(projectPath, [
    "commit",
    "-m",
    fullMessage,
    `--author=${author.name} <${author.email}>`,
  ]);

  const { stdout } = await execGit(projectPath, [
    "log",
    "-1",
    "--format=%H%n%h%n%an%n%ae%n%aI%n%s",
  ]);
  const parts = stdout.split("\n");

  return {
    sha: parts[0] ?? "",
    shortSha: parts[1] ?? "",
    message: parts[5] ?? "",
    author: { name: parts[2] ?? "", email: parts[3] ?? "" },
    timestamp: parts[4] ?? "",
  };
}

function parseLogEntry(lines: string[]): GitLogEntry | null {
  if (lines.length < 5) return null;

  const sha = lines[0] ?? "";
  const shortSha = lines[1] ?? "";
  const authorName = lines[2] ?? "";
  const authorEmail = lines[3] ?? "";
  const timestamp = lines[4] ?? "";

  // Remaining lines contain the full message body + optional shortstat
  const bodyLines = lines.slice(5);
  let statsLine = "";
  const messageLines: string[] = [];

  for (const line of bodyLines) {
    if (/\d+\s+file/.test(line)) {
      statsLine = line;
    } else {
      messageLines.push(line);
    }
  }

  const body = messageLines.join("\n").trim();
  const message = body.split("\n")[0] ?? "";
  const type = parseTrailer(body, "Doable-Type") ?? "";
  const sessionMessageId = parseTrailer(body, "Doable-Session");
  const stats = parseShortstat(statsLine);

  return {
    sha,
    shortSha,
    message,
    author: { name: authorName, email: authorEmail },
    timestamp,
    type,
    sessionMessageId,
    ...stats,
  };
}

export async function getLog(
  projectPath: string,
  opts?: { limit?: number; offset?: number }
): Promise<GitLogEntry[]> {
  const limit = opts?.limit ?? 50;
  const args = [
    "log",
    `--format=${COMMIT_BOUNDARY}%n%H%n%h%n%an%n%ae%n%aI%n%B`,
    "--shortstat",
    `-${limit}`,
  ];
  if (opts?.offset) args.push(`--skip=${opts.offset}`);

  let stdout: string;
  try {
    ({ stdout } = await execGit(projectPath, args));
  } catch (err) {
    // Empty repo with no commits
    if (err instanceof GitError && err.stderr.includes("does not have any commits")) {
      return [];
    }
    throw err;
  }

  if (!stdout.trim()) return [];

  const entries: GitLogEntry[] = [];
  const chunks = stdout.split(COMMIT_BOUNDARY).filter((c) => c.trim());

  for (const chunk of chunks) {
    const entry = parseLogEntry(chunk.trim().split("\n"));
    if (entry) entries.push(entry);
  }

  return entries;
}

export async function getLogCount(projectPath: string): Promise<number> {
  try {
    const { stdout } = await execGit(projectPath, [
      "rev-list",
      "--count",
      "HEAD",
    ]);
    return parseInt(stdout, 10);
  } catch {
    return 0;
  }
}

export async function getCommit(
  projectPath: string,
  sha: string
): Promise<GitLogEntry | null> {
  try {
    const { stdout } = await execGit(projectPath, [
      "log",
      "-1",
      "--format=%H%n%h%n%an%n%ae%n%aI%n%B",
      "--shortstat",
      sha,
    ]);

    if (!stdout.trim()) return null;
    return parseLogEntry(stdout.trim().split("\n"));
  } catch {
    return null;
  }
}

export async function getFileAtCommit(
  projectPath: string,
  sha: string,
  filePath: string
): Promise<string> {
  const { stdout } = await execGit(projectPath, [
    "show",
    `${sha}:${filePath}`,
  ]);
  return stdout;
}

export async function findCommitBySessionId(
  projectPath: string,
  sessionMessageId: string
): Promise<GitLogEntry | null> {
  try {
    const { stdout } = await execGit(projectPath, [
      "log",
      "--all",
      `--grep=Doable-Session: ${sessionMessageId}`,
      "--format=%H",
      "-1",
    ]);

    const sha = stdout.trim();
    if (!sha) return null;

    return getCommit(projectPath, sha);
  } catch {
    return null;
  }
}
