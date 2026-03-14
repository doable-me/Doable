import { sql } from "../db/index.js";
import * as github from "./client.js";
import { createSnapshot, snapshotToJson } from "../version-control/snapshot.js";
import type { Snapshot } from "../version-control/snapshot.js";

// ─── Types ──────────────────────────────────────────────────

export type SyncDirection = "push" | "pull";
export type SyncStatusType = "synced" | "ahead" | "behind" | "diverged" | "disconnected";

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
}

interface ConnectionRow {
  id: string;
  project_id: string;
  repo_owner: string;
  repo_name: string;
  default_branch: string;
  access_token: string;
  webhook_secret: string | null;
  last_synced_at: Date | null;
  sync_status: SyncStatusType;
}

// ─── Connection Helpers ─────────────────────────────────────

async function getConnection(projectId: string): Promise<ConnectionRow> {
  const [conn] = await sql<ConnectionRow[]>`
    SELECT * FROM github_connections WHERE project_id = ${projectId}
  `;

  if (!conn) {
    throw new Error(`No GitHub connection for project ${projectId}`);
  }

  return conn;
}

// ─── Push to GitHub ─────────────────────────────────────────

export async function pushToGitHub(
  projectId: string,
  projectPath: string,
  message: string,
  userId: string
): Promise<SyncResult> {
  const conn = await getConnection(projectId);
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

  // Log the commit
  await sql`
    INSERT INTO github_commits (connection_id, sha, message, author, branch, direction, version_id)
    VALUES (
      ${conn.id},
      ${commit.sha},
      ${message},
      ${commit.author},
      ${conn.default_branch},
      'push',
      NULL
    )
  `;

  // Update sync status
  await sql`
    UPDATE github_connections
    SET sync_status = 'synced', last_synced_at = now()
    WHERE id = ${conn.id}
  `;

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
  const conn = await getConnection(projectId);

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
    await sql`
      INSERT INTO github_commits (connection_id, sha, message, author, branch, direction)
      VALUES (
        ${conn.id},
        ${latestCommit.sha},
        ${latestCommit.message},
        ${latestCommit.author},
        ${conn.default_branch},
        'pull'
      )
    `;
  }

  // Update sync status
  await sql`
    UPDATE github_connections
    SET sync_status = 'synced', last_synced_at = now()
    WHERE id = ${conn.id}
  `;

  return {
    direction: "pull",
    commitSha: latestCommit?.sha ?? "",
    message: latestCommit?.message ?? "Pull from GitHub",
    filesChanged: filesWritten,
  };
}

// ─── Sync Status ────────────────────────────────────────────

export async function syncStatus(projectId: string): Promise<SyncStatus> {
  const [conn] = await sql<ConnectionRow[]>`
    SELECT * FROM github_connections WHERE project_id = ${projectId}
  `;

  if (!conn) {
    return {
      connected: false,
      status: "disconnected",
      lastSyncedAt: null,
      repoUrl: null,
      branch: "main",
    };
  }

  return {
    connected: true,
    status: conn.sync_status,
    lastSyncedAt: conn.last_synced_at?.toISOString() ?? null,
    repoUrl: `https://github.com/${conn.repo_owner}/${conn.repo_name}`,
    branch: conn.default_branch,
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

  // Save the connection
  await sql`
    INSERT INTO github_connections (project_id, repo_owner, repo_name, default_branch, access_token, created_by)
    VALUES (
      ${projectId},
      ${opts.repoOwner},
      ${opts.repoName},
      ${branch},
      ${opts.token},
      ${opts.userId}
    )
    ON CONFLICT (project_id) DO UPDATE SET
      repo_owner = EXCLUDED.repo_owner,
      repo_name = EXCLUDED.repo_name,
      default_branch = EXCLUDED.default_branch,
      access_token = EXCLUDED.access_token
  `;

  // Push the current project files
  return pushToGitHub(projectId, projectPath, "Initial commit from Doable", opts.userId);
}
