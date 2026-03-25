import { sql } from "../db/index.js";
import * as github from "./client.js";
import {
  configureRemote,
  removeRemote,
  gitPush,
  gitPull,
  gitFetch,
  gitClone,
  getAheadBehind,
  resolveAllConflicts as gitResolveAll,
  abortMerge as gitAbortMerge,
  type PullResult,
} from "./git-ops.js";
import { ensureRepo, isGitRepo } from "../git/init.js";
import { autoCommit, getLog } from "../git/commits.js";
import { withProjectLock } from "../git/lock.js";
import { execGit } from "../git/exec.js";
import { githubQueries } from "@doable/db/queries/github.js";

const db = githubQueries(sql);

// ─── Types ──────────────────────────────────────────────────

export type SyncDirection = "push" | "pull";
export type SyncStatusType =
  | "synced"
  | "ahead"
  | "behind"
  | "diverged"
  | "conflict"
  | "disconnected";

export interface SyncResult {
  direction: SyncDirection;
  commitSha: string;
  message: string;
  filesChanged: number;
}

export interface SyncStatus {
  connected: boolean;
  status: SyncStatusType;
  lastSyncedAt: string | null;
  repoUrl: string | null;
  branch: string;
  repoOwner: string | null;
  repoName: string | null;
  lastCommitSha: string | null;
  ahead?: number;
  behind?: number;
}

export interface ConflictInfo {
  hasConflict: boolean;
  conflictedFiles: string[];
  message: string;
}

// ─── Push to GitHub ─────────────────────────────────────────

export async function pushToGitHub(
  projectId: string,
  projectPath: string,
  message: string,
  userId: string
): Promise<SyncResult> {
  const conn = await db.findConnectionByProject(projectId);
  if (!conn) {
    throw new Error(`No GitHub connection for project ${projectId}`);
  }

  return withProjectLock(projectId, async () => {
    await ensureRepo(projectPath);

    // Commit any pending changes
    const commitInfo = await autoCommit(projectPath, message);

    // Fetch remote state and check for divergence
    try {
      await gitFetch(projectPath, "origin", conn.access_token);
      const { behind } = await getAheadBehind(
        projectPath,
        "origin",
        conn.default_branch
      );
      if (behind > 0) {
        await db.updateConnection(projectId, { syncStatus: "diverged" });
        throw new Error(
          `Remote has ${behind} new commit(s) since last sync. Pull first or force push.`
        );
      }
    } catch (err) {
      // If it's our divergence error, re-throw
      if (err instanceof Error && err.message.includes("Pull first")) throw err;
      // Otherwise fetch failed (new repo, no remote branch yet) — safe to push
    }

    await gitPush(
      projectPath,
      "origin",
      conn.default_branch,
      conn.access_token
    );

    // Get HEAD sha after push
    const { stdout: sha } = await execGit(projectPath, ["rev-parse", "HEAD"]);

    // Log the commit in DB
    await db.createCommit({
      connectionId: conn.id,
      sha,
      message: commitInfo?.message ?? message,
      author: "Doable",
      branch: conn.default_branch,
      direction: "push",
    });

    await db.updateConnection(projectId, {
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    });

    return {
      direction: "push",
      commitSha: sha,
      message: commitInfo?.message ?? message,
      filesChanged: 0,
    };
  });
}

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

// ─── Force Push (skip conflict check) ───────────────────────

export async function forcePushToGitHub(
  projectId: string,
  projectPath: string,
  message: string,
  userId: string
): Promise<SyncResult> {
  const conn = await db.findConnectionByProject(projectId);
  if (!conn) {
    throw new Error(`No GitHub connection for project ${projectId}`);
  }

  return withProjectLock(projectId, async () => {
    await ensureRepo(projectPath);

    const commitInfo = await autoCommit(projectPath, message);

    await gitPush(
      projectPath,
      "origin",
      conn.default_branch,
      conn.access_token,
      true // force
    );

    const { stdout: sha } = await execGit(projectPath, ["rev-parse", "HEAD"]);

    await db.createCommit({
      connectionId: conn.id,
      sha,
      message: commitInfo?.message ?? message,
      author: "Doable",
      branch: conn.default_branch,
      direction: "push",
    });

    await db.updateConnection(projectId, {
      syncStatus: "synced",
      lastSyncedAt: new Date(),
    });

    return {
      direction: "push",
      commitSha: sha,
      message: commitInfo?.message ?? message,
      filesChanged: 0,
    };
  });
}

// ─── Initial Push ───────────────────────────────────────────

export async function initialPush(
  projectId: string,
  projectPath: string,
  opts: {
    token: string;
    repoOwner: string;
    repoName: string;
    branch?: string;
    userId: string;
    createNew?: boolean;
    isPrivate?: boolean;
    description?: string;
  }
): Promise<SyncResult> {
  const branch = opts.branch ?? "main";

  // Create the repo on GitHub if requested (auto_init: false — we push first commit)
  if (opts.createNew) {
    await github.createRepo(opts.token, {
      name: opts.repoName,
      description: opts.description,
      isPrivate: opts.isPrivate ?? true,
    });
  }

  // Ensure local repo exists
  await ensureRepo(projectPath);

  // Configure the remote
  const repoUrl = `https://github.com/${opts.repoOwner}/${opts.repoName}.git`;
  await configureRemote(projectPath, "origin", repoUrl);

  // Save the connection in DB (upsert)
  await db.createConnection({
    projectId,
    repoOwner: opts.repoOwner,
    repoName: opts.repoName,
    defaultBranch: branch,
    accessToken: opts.token,
    createdBy: opts.userId,
  });

  // Commit all current files and push
  const commitInfo = await autoCommit(projectPath, "Initial commit from Doable");

  await gitPush(projectPath, "origin", branch, opts.token);

  const { stdout: sha } = await execGit(projectPath, ["rev-parse", "HEAD"]);

  await db.createCommit({
    connectionId: (await db.findConnectionByProject(projectId))!.id,
    sha,
    message: commitInfo?.message ?? "Initial commit from Doable",
    author: "Doable",
    branch,
    direction: "push",
  });

  await db.updateConnection(projectId, {
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  });

  return {
    direction: "push",
    commitSha: sha,
    message: commitInfo?.message ?? "Initial commit from Doable",
    filesChanged: 0,
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
