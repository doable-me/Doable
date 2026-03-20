import { sql } from "../db/index.js";
import * as github from "./client.js";
import { createSnapshot } from "../version-control/snapshot.js";
import { githubQueries } from "@doable/db/queries/github.js";

const db = githubQueries(sql);

// ─── Types ──────────────────────────────────────────────────

export type SyncDirection = "push" | "pull";
export type SyncStatusType = "synced" | "ahead" | "behind" | "diverged" | "conflict" | "disconnected";

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
}

export interface ConflictInfo {
  hasConflict: boolean;
  localSha: string | null;
  remoteSha: string | null;
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

  const snapshot = await createSnapshot(projectPath);
  const files = snapshot.files.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  if (files.length === 0) {
    throw new Error("No files to push");
  }

  // Check for conflicts before pushing
  const conflict = await checkConflicts(conn.id, conn.access_token, conn.repo_owner, conn.repo_name, conn.default_branch);
  if (conflict.hasConflict) {
    // Mark as diverged
    await db.updateConnection(projectId, { syncStatus: "diverged" });
    throw new Error(
      `Conflict detected: remote has new commits since last sync. ` +
      `Pull first or force push. ${conflict.message}`
    );
  }

  const commit = await github.createCommit(
    conn.access_token,
    conn.repo_owner,
    conn.repo_name,
    {
      branch: conn.default_branch,
      message,
      files,
    }
  );

  // Log the commit
  await db.createCommit({
    connectionId: conn.id,
    sha: commit.sha,
    message,
    author: commit.author,
    branch: conn.default_branch,
    direction: "push",
  });

  // Update sync status
  await db.updateConnection(projectId, {
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  });

  return {
    direction: "push",
    commitSha: commit.sha,
    message,
    filesChanged: files.length,
  };
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

  // Get all file contents from the repo
  const files = await github.getRepoContents(
    conn.access_token,
    conn.repo_owner,
    conn.repo_name,
    conn.default_branch
  );

  if (files.length === 0) {
    throw new Error("No files found in repository");
  }

  // Write files to project path
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");

  let filesWritten = 0;
  for (const file of files) {
    const fullPath = join(projectPath, file.path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, file.content, "utf-8");
    filesWritten++;
  }

  // Get the latest commit for logging
  const commits = await github.getCommits(
    conn.access_token,
    conn.repo_owner,
    conn.repo_name,
    { branch: conn.default_branch, perPage: 1 }
  );

  const latestCommit = commits[0];
  if (latestCommit) {
    await db.createCommit({
      connectionId: conn.id,
      sha: latestCommit.sha,
      message: latestCommit.message,
      author: latestCommit.author,
      branch: conn.default_branch,
      direction: "pull",
    });
  }

  // Update sync status
  await db.updateConnection(projectId, {
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  });

  return {
    direction: "pull",
    commitSha: latestCommit?.sha ?? "",
    message: latestCommit?.message ?? "Pull from GitHub",
    filesChanged: filesWritten,
  };
}

// ─── Sync Status ────────────────────────────────────────────

export async function syncStatus(projectId: string): Promise<SyncStatus> {
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

  // Try to detect if remote has diverged
  let status = conn.sync_status as SyncStatusType;
  let lastCommitSha: string | null = null;

  try {
    const remoteSha = await github.getLatestCommitSha(
      conn.access_token,
      conn.repo_owner,
      conn.repo_name,
      conn.default_branch
    );
    lastCommitSha = remoteSha;

    // Check our last known commit
    const { rows: lastCommits } = await db.listCommits(conn.id, { pageSize: 1 });
    const lastLocalSha = lastCommits[0]?.sha ?? null;

    if (lastLocalSha && lastLocalSha !== remoteSha && status === "synced") {
      status = "behind";
      await db.updateConnection(projectId, { syncStatus: "behind" });
    }
  } catch {
    // Can't reach GitHub -- leave status as-is
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
  };
}

// ─── Conflict Detection ─────────────────────────────────────

async function checkConflicts(
  connectionId: string,
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<ConflictInfo> {
  try {
    const remoteSha = await github.getLatestCommitSha(token, owner, repo, branch);

    // Get our last recorded commit for this connection
    const { rows: lastCommits } = await db.listCommits(connectionId, { pageSize: 1 });
    const lastLocalSha = lastCommits[0]?.sha ?? null;

    // If we have no recorded commits, it's a fresh connection -- no conflict
    if (!lastLocalSha) {
      return { hasConflict: false, localSha: null, remoteSha, message: "" };
    }

    // If the remote SHA matches our last known SHA, no conflict
    if (remoteSha === lastLocalSha) {
      return { hasConflict: false, localSha: lastLocalSha, remoteSha, message: "" };
    }

    // Remote has diverged -- someone pushed to the repo directly
    return {
      hasConflict: true,
      localSha: lastLocalSha,
      remoteSha,
      message: `Remote is at ${remoteSha.slice(0, 7)}, local last sync was ${lastLocalSha.slice(0, 7)}`,
    };
  } catch {
    // Can't check -- allow the push (GitHub will reject if there's a real conflict)
    return { hasConflict: false, localSha: null, remoteSha: null, message: "" };
  }
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

  const snapshot = await createSnapshot(projectPath);
  const files = snapshot.files.map((f) => ({
    path: f.path,
    content: f.content,
  }));

  if (files.length === 0) {
    throw new Error("No files to push");
  }

  const commit = await github.createCommit(
    conn.access_token,
    conn.repo_owner,
    conn.repo_name,
    {
      branch: conn.default_branch,
      message,
      files,
    }
  );

  await db.createCommit({
    connectionId: conn.id,
    sha: commit.sha,
    message,
    author: commit.author,
    branch: conn.default_branch,
    direction: "push",
  });

  await db.updateConnection(projectId, {
    syncStatus: "synced",
    lastSyncedAt: new Date(),
  });

  return {
    direction: "push",
    commitSha: commit.sha,
    message,
    filesChanged: files.length,
  };
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

  // Create the repo if requested
  if (opts.createNew) {
    await github.createRepo(opts.token, {
      name: opts.repoName,
      description: opts.description,
      isPrivate: opts.isPrivate ?? true,
    });
  }

  // Save the connection (upsert)
  await db.createConnection({
    projectId,
    repoOwner: opts.repoOwner,
    repoName: opts.repoName,
    defaultBranch: branch,
    accessToken: opts.token,
    createdBy: opts.userId,
  });

  // Push the current project files
  return pushToGitHub(projectId, projectPath, "Initial commit from Doable", opts.userId);
}

// ─── Disconnect ─────────────────────────────────────────────

export async function disconnectGitHub(projectId: string): Promise<boolean> {
  // Remove the project's github_repo_url
  await sql`
    UPDATE projects
    SET github_repo_url = NULL
    WHERE id = ${projectId}
  `;

  return db.deleteConnection(projectId);
}

// ─── Commit History ─────────────────────────────────────────

export async function getCommitHistory(
  projectId: string,
  opts: { page?: number; pageSize?: number } = {}
): Promise<{ commits: Array<{ id: string; sha: string; message: string; author: string; branch: string; direction: string; createdAt: string }>; total: number }> {
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
