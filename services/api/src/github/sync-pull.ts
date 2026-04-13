/**
 * GitHub pull, import, status, conflict resolution, and history operations.
 */

import { sql } from "../db/index.js";
import {
  removeRemote,
  gitPull,
  gitFetch,
  gitClone,
  getAheadBehind,
  resolveAllConflicts as gitResolveAll,
  abortMerge as gitAbortMerge,
  type PullResult,
} from "./git-ops.js";
import { ensureRepo, isGitRepo } from "../git/init.js";
import { autoCommit } from "../git/commits.js";
import { withProjectLock } from "../git/lock.js";
import { execGit } from "../git/exec.js";
import {
  db,
  type SyncResult,
  type SyncStatus,
  type SyncStatusType,
} from "./sync-types.js";

// ─── Pull from GitHub ───────────────────────────────────────

export async function pullFromGitHub(
  projectId: string,
  projectPath: string,
  userId: string
): Promise<SyncResult> {
  const conn = await db.findConnectionByProject(projectId);
  if (!conn) {
    throw new Error(`No GitHub connection for project ${projectId}`);
  }

  return withProjectLock(projectId, async () => {
    await ensureRepo(projectPath);

    // Commit any local changes before pulling to avoid dirty-tree errors
    await autoCommit(projectPath, "Auto-save before pull", { type: "sync" });

    const result: PullResult = await gitPull(
      projectPath,
      "origin",
      conn.default_branch,
      conn.access_token
    );

    if (result.hasConflicts) {
      await db.updateConnection(projectId, { syncStatus: "conflict" });
      throw new Error(
        `Merge conflicts in ${result.conflictedFiles.length} file(s): ${result.conflictedFiles.join(", ")}. ` +
          `Resolve conflicts or abort the merge.`
      );
    }

    const { stdout: sha } = await execGit(projectPath, ["rev-parse", "HEAD"]);

    // Log the pull in DB
    await db.createCommit({
      connectionId: conn.id,
      sha,
      message: `Pull from GitHub`,
      author: "Doable",
      branch: conn.default_branch,
      direction: "pull",
    });

    await db.updateConnection(projectId, {
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    });

    return {
      direction: "pull",
      commitSha: sha,
      message: "Pull from GitHub",
      filesChanged: result.filesChanged,
    };
  });
}

// ─── Sync Status ────────────────────────────────────────────

export async function syncStatus(
  projectId: string,
  projectPath?: string
): Promise<SyncStatus> {
  const conn = await db.findConnectionByProject(projectId);

  if (!conn) {
    return {
      connected: false,
      status: "disconnected",
      lastSyncedAt: null,
      repoUrl: null,
      branch: "main",
      repoOwner: null,
      repoName: null,
      lastCommitSha: null,
    };
  }

  let status = conn.sync_status as SyncStatusType;
  let lastCommitSha: string | null = null;
  let ahead = 0;
  let behind = 0;

  // If we have a local repo, use git to check ahead/behind
  if (projectPath && isGitRepo(projectPath)) {
    try {
      await gitFetch(projectPath, "origin", conn.access_token);
      const counts = await getAheadBehind(
        projectPath,
        "origin",
        conn.default_branch
      );
      ahead = counts.ahead;
      behind = counts.behind;

      const { stdout: sha } = await execGit(projectPath, [
        "rev-parse",
        "HEAD",
      ]);
      lastCommitSha = sha;

      // Derive status from ahead/behind
      if (ahead > 0 && behind > 0) {
        status = "diverged";
      } else if (behind > 0) {
        status = "behind";
      } else if (ahead > 0) {
        status = "ahead";
      } else {
        status = "synced";
      }

      // Persist derived status
      if (status !== conn.sync_status) {
        await db.updateConnection(projectId, { syncStatus: status });
      }
    } catch {
      // Can't reach remote — leave status as-is
    }
  } else {
    // Fallback: read last commit sha from DB
    const { rows: lastCommits } = await db.listCommits(conn.id, {
      pageSize: 1,
    });
    lastCommitSha = lastCommits[0]?.sha ?? null;
  }

  return {
    connected: true,
    status,
    lastSyncedAt: conn.last_synced_at?.toISOString() ?? null,
    repoUrl: `https://github.com/${conn.repo_owner}/${conn.repo_name}`,
    branch: conn.default_branch,
    repoOwner: conn.repo_owner,
    repoName: conn.repo_name,
    lastCommitSha,
    ahead,
    behind,
  };
}

// ─── Import from GitHub ─────────────────────────────────────

export async function importFromGitHub(
  projectId: string,
  projectPath: string,
  opts: {
    token: string;
    repoOwner: string;
    repoName: string;
    branch?: string;
    userId: string;
  }
): Promise<SyncResult> {
  const branch = opts.branch ?? "main";
  const repoUrl = `https://github.com/${opts.repoOwner}/${opts.repoName}.git`;

  // Clone the repo into the project path
  await gitClone(repoUrl, projectPath, opts.token, branch);

  // Save the connection in DB
  await db.createConnection({
    projectId,
    repoOwner: opts.repoOwner,
    repoName: opts.repoName,
    defaultBranch: branch,
    accessToken: opts.token,
    createdBy: opts.userId,
  });

  const { stdout: sha } = await execGit(projectPath, ["rev-parse", "HEAD"]);

  const conn = await db.findConnectionByProject(projectId);
  if (conn) {
    await db.createCommit({
      connectionId: conn.id,
      sha,
      message: "Imported from GitHub",
      author: "Doable",
      branch,
      direction: "pull",
    });
  }

  await db.updateConnection(projectId, {
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  });

  // Count files in repo
  const { stdout: fileList } = await execGit(projectPath, [
    "ls-files",
  ]);
  const filesChanged = fileList ? fileList.split("\n").filter(Boolean).length : 0;

  return {
    direction: "pull",
    commitSha: sha,
    message: "Imported from GitHub",
    filesChanged,
  };
}

// ─── Disconnect ─────────────────────────────────────────────

export async function disconnectGitHub(
  projectId: string,
  projectPath?: string
): Promise<boolean> {
  // Remove the git remote if the repo exists
  if (projectPath && isGitRepo(projectPath)) {
    await removeRemote(projectPath, "origin").catch(() => {});
  }

  // Remove the project's github_repo_url
  await sql`
    UPDATE projects
    SET github_repo_url = NULL
    WHERE id = ${projectId}
  `;

  return db.deleteConnection(projectId);
}

// ─── Conflict Resolution ────────────────────────────────────

export async function resolveConflicts(
  projectPath: string,
  strategy: "ours" | "theirs"
): Promise<void> {
  await gitResolveAll(projectPath, strategy);
  // Commit the merge resolution
  await execGit(projectPath, ["commit", "--no-edit"]);
}

export async function abortMerge(projectPath: string): Promise<void> {
  await gitAbortMerge(projectPath);
}

// ─── Commit History ─────────────────────────────────────────

export async function getCommitHistory(
  projectId: string,
  opts: { page?: number; pageSize?: number } = {}
): Promise<{
  commits: Array<{
    id: string;
    sha: string;
    message: string;
    author: string;
    branch: string;
    direction: string;
    createdAt: string;
  }>;
  total: number;
}> {
  const conn = await db.findConnectionByProject(projectId);
  if (!conn) {
    return { commits: [], total: 0 };
  }

  const { rows, total } = await db.listCommits(conn.id, opts);

  return {
    commits: rows.map((r) => ({
      id: r.id,
      sha: r.sha,
      message: r.message,
      author: r.author,
      branch: r.branch,
      direction: r.direction,
      createdAt: r.created_at.toISOString(),
    })),
    total,
  };
}
