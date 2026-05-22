/**
 * GitHub push operations: push, force push, and initial push.
 */

import * as github from "./client.js";
import {
  configureRemote,
  gitPush,
  gitFetch,
  getAheadBehind,
} from "./git-ops.js";
import { ensureRepo } from "../git/init.js";
import { autoCommit } from "../git/commits.js";
import { withProjectLock } from "../git/lock.js";
import { execGit } from "../git/exec.js";
import { db, type SyncResult } from "./sync-types.js";

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
  let repoAlreadyExisted = false;
  let actualRepoName = opts.repoName;

  // Create the repo on GitHub if requested, or connect to existing
  if (opts.createNew) {
    const { repo, alreadyExisted } = await github.createOrGetRepo(
      opts.token,
      opts.repoOwner,
      {
        name: opts.repoName,
        description: opts.description,
        isPrivate: opts.isPrivate ?? true,
      }
    );
    repoAlreadyExisted = alreadyExisted;
    actualRepoName = repo.name;
  }

  // Ensure local repo exists
  await ensureRepo(projectPath);

  // Detect the actual local branch (may be "master" on older git versions)
  const { stdout: currentBranch } = await execGit(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = opts.branch ?? (currentBranch.trim() || "main");

  // If the local branch is "master" but we want "main", rename it
  if (currentBranch.trim() === "master" && branch === "main") {
    await execGit(projectPath, ["branch", "-M", "main"]);
  }

  // Configure the remote
  const repoUrl = `https://github.com/${opts.repoOwner}/${actualRepoName}.git`;
  await configureRemote(projectPath, "origin", repoUrl);

  // Save the connection in DB (upsert)
  await db.createConnection({
    projectId,
    repoOwner: opts.repoOwner,
    repoName: actualRepoName,
    defaultBranch: branch,
    accessToken: opts.token,
    createdBy: opts.userId,
  });

  // Commit all current files and push
  const commitInfo = await autoCommit(projectPath, "Initial commit from Doable");

  // Force push if connecting to an existing repo (Doable is source of truth)
  await gitPush(projectPath, "origin", branch, opts.token, repoAlreadyExisted);

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
