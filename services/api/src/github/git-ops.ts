// ─── Git Remote Operations ──────────────────────────────────
// Authenticated push / pull / fetch / clone via the git CLI.
// Auth strategy: temporarily set the remote URL to include an
// x-access-token, do the operation, then reset to the clean URL.

import { execGit, GitError, type ExecOpts } from "../git/exec.js";

// ─── Types ──────────────────────────────────────────────────

export interface PullResult {
  success: boolean;
  hasConflicts: boolean;
  conflictedFiles: string[];
  mergeCommitSha?: string;
  filesChanged: number;
}

// ─── Remote helpers ─────────────────────────────────────────

export async function configureRemote(
  projectPath: string,
  name: string,
  url: string
): Promise<void> {
  const existing = await getRemoteUrl(projectPath, name);
  if (existing) {
    await execGit(projectPath, ["remote", "set-url", name, url]);
  } else {
    await execGit(projectPath, ["remote", "add", name, url]);
  }
}

export async function removeRemote(
  projectPath: string,
  name: string
): Promise<void> {
  try {
    await execGit(projectPath, ["remote", "remove", name]);
  } catch (err) {
    if (err instanceof GitError && err.stderr.includes("No such remote")) return;
    throw err;
  }
}

export async function getRemoteUrl(
  projectPath: string,
  name: string
): Promise<string | null> {
  try {
    const { stdout } = await execGit(projectPath, [
      "remote",
      "get-url",
      name,
    ]);
    return stdout || null;
  } catch {
    return null;
  }
}

// ─── Authenticated operations ───────────────────────────────
// Pattern: set remote URL with token → operate → reset to clean URL.

function cleanUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

function authedUrl(owner: string, repo: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
}

function ownerRepoFromUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}

async function withAuth<T>(
  projectPath: string,
  remote: string,
  token: string,
  fn: () => Promise<T>
): Promise<T> {
  const url = await getRemoteUrl(projectPath, remote);
  if (!url) throw new Error(`Remote '${remote}' not configured`);

  const parsed = ownerRepoFromUrl(url);
  if (!parsed) throw new Error(`Cannot parse GitHub owner/repo from URL: ${url}`);

  const { owner, repo } = parsed;

  // Inject token into remote URL
  await execGit(projectPath, [
    "remote",
    "set-url",
    remote,
    authedUrl(owner, repo, token),
  ]);

  try {
    return await fn();
  } finally {
    // Always reset to the clean URL (no token)
    await execGit(projectPath, [
      "remote",
      "set-url",
      remote,
      cleanUrl(owner, repo),
    ]).catch(() => {
      // Best-effort cleanup; don't mask the original error
    });
  }
}

// ─── Push ───────────────────────────────────────────────────

export async function gitPush(
  projectPath: string,
  remote: string,
  branch: string,
  token: string,
  force?: boolean
): Promise<void> {
  await withAuth(projectPath, remote, token, async () => {
    const args = ["push", "-u", remote, branch];
    if (force) args.splice(1, 0, "--force");
    await execGit(projectPath, args, { timeout: 60_000 });
  });
}

// ─── Pull ───────────────────────────────────────────────────

export async function gitPull(
  projectPath: string,
  remote: string,
  branch: string,
  token: string
): Promise<PullResult> {
  return withAuth(projectPath, remote, token, async () => {
    try {
      const { stdout } = await execGit(
        projectPath,
        ["pull", remote, branch, "--no-rebase"],
        { timeout: 60_000 }
      );

      // Parse files-changed count from merge summary
      const changedMatch = stdout.match(/(\d+) files? changed/);
      const filesChanged = changedMatch ? parseInt(changedMatch[1]!, 10) : 0;

      // Get HEAD sha after merge
      const { stdout: sha } = await execGit(projectPath, [
        "rev-parse",
        "HEAD",
      ]);

      return {
        success: true,
        hasConflicts: false,
        conflictedFiles: [],
        mergeCommitSha: sha,
        filesChanged,
      };
    } catch (err) {
      if (err instanceof GitError && err.stderr.includes("CONFLICT")) {
        const conflicted = await getConflictedFiles(projectPath);
        return {
          success: false,
          hasConflicts: true,
          conflictedFiles: conflicted,
          filesChanged: 0,
        };
      }
      throw err;
    }
  });
}

// ─── Fetch ──────────────────────────────────────────────────

export async function gitFetch(
  projectPath: string,
  remote: string,
  token: string
): Promise<void> {
  await withAuth(projectPath, remote, token, async () => {
    await execGit(projectPath, ["fetch", remote], { timeout: 60_000 });
  });
}

// ─── Clone ──────────────────────────────────────────────────

export async function gitClone(
  repoUrl: string,
  projectPath: string,
  token: string,
  branch?: string
): Promise<void> {
  const parsed = ownerRepoFromUrl(repoUrl);
  if (!parsed) throw new Error(`Cannot parse GitHub owner/repo from URL: ${repoUrl}`);

  const { owner, repo } = parsed;
  const url = authedUrl(owner, repo, token);

  // Clone into parent dir — git clone creates the target directory
  const { dirname, basename } = await import("node:path");
  const parent = dirname(projectPath);
  const folder = basename(projectPath);

  const args = ["clone", url, folder];
  if (branch) args.push("--branch", branch);

  try {
    await execGit(parent, args, { timeout: 120_000 });
  } finally {
    // Reset remote URL to strip the token
    try {
      await execGit(projectPath, [
        "remote",
        "set-url",
        "origin",
        cleanUrl(owner, repo),
      ]);
    } catch {
      // Best-effort: directory may not exist if clone failed
    }
  }

  // Set local git identity
  await execGit(projectPath, ["config", "user.name", "Doable"]);
  await execGit(projectPath, ["config", "user.email", "noreply@doable.me"]);
}

// ─── Ahead / Behind ─────────────────────────────────────────

export async function getAheadBehind(
  projectPath: string,
  remote: string,
  branch: string
): Promise<{ ahead: number; behind: number }> {
  try {
    const { stdout } = await execGit(projectPath, [
      "rev-list",
      "--left-right",
      "--count",
      `HEAD...${remote}/${branch}`,
    ]);

    const [ahead, behind] = stdout.split(/\s+/).map(Number);
    return { ahead: ahead ?? 0, behind: behind ?? 0 };
  } catch {
    // If remote tracking branch doesn't exist yet, treat as fully ahead
    return { ahead: 1, behind: 0 };
  }
}

// ─── Conflict Management ────────────────────────────────────

export async function hasMergeConflicts(
  projectPath: string
): Promise<boolean> {
  const files = await getConflictedFiles(projectPath);
  return files.length > 0;
}

export async function getConflictedFiles(
  projectPath: string
): Promise<string[]> {
  try {
    const { stdout } = await execGit(projectPath, [
      "diff",
      "--name-only",
      "--diff-filter=U",
    ]);
    return stdout ? stdout.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function abortMerge(projectPath: string): Promise<void> {
  await execGit(projectPath, ["merge", "--abort"]);
}

export async function resolveConflict(
  projectPath: string,
  filePath: string,
  strategy: "ours" | "theirs"
): Promise<void> {
  await execGit(projectPath, ["checkout", `--${strategy}`, "--", filePath]);
  await execGit(projectPath, ["add", filePath]);
}

export async function resolveAllConflicts(
  projectPath: string,
  strategy: "ours" | "theirs"
): Promise<void> {
  const files = await getConflictedFiles(projectPath);
  for (const file of files) {
    await resolveConflict(projectPath, file, strategy);
  }
}
