import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "../db/index.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { gitFetch } from "./git-ops.js";
import { isGitRepo } from "../git/init.js";
import { getProjectPath } from "../projects/file-manager.js";

const db = githubQueries(sql);

// ─── Types ──────────────────────────────────────────────────

export interface WebhookPayload {
  ref: string;
  after: string;
  repository: {
    full_name: string;
    name: string;
    owner: { login: string };
  };
  head_commit: {
    id: string;
    message: string;
    author: { name: string; email: string };
    timestamp: string;
  } | null;
  commits: Array<{
    id: string;
    message: string;
    author: { name: string };
    added: string[];
    removed: string[];
    modified: string[];
  }>;
}

export interface WebhookResult {
  handled: boolean;
  projectId: string | null;
  message: string;
}

// ─── Signature Verification ────────────────────────────────

export function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ─── Webhook Handler ───────────────────────────────────────

export async function handlePushEvent(
  payload: WebhookPayload
): Promise<WebhookResult> {
  const repoOwner = payload.repository.owner.login;
  const repoName = payload.repository.name;

  // Find the connection for this repo
  const conn = await db.findConnectionByRepo(repoOwner, repoName);

  if (!conn) {
    return {
      handled: false,
      projectId: null,
      message: `No connection found for ${repoOwner}/${repoName}`,
    };
  }

  // Extract branch from ref (refs/heads/main -> main)
  const branch = payload.ref.replace("refs/heads/", "");

  // Log commits
  const headCommit = payload.head_commit;
  if (headCommit) {
    await db.createCommit({
      connectionId: conn.id,
      sha: headCommit.id,
      message: headCommit.message,
      author: headCommit.author.name,
      branch,
      direction: "pull",
    });
  }

  // Update sync status to indicate remote has new changes
  await db.updateConnection(conn.project_id, { syncStatus: "behind" });

  // Try to fetch new remote state so local tracking refs are up-to-date
  try {
    const projectPath = getProjectPath(conn.project_id);
    if (isGitRepo(projectPath)) {
      await gitFetch(projectPath, "origin", conn.access_token);
    }
  } catch {
    // Non-critical: webhook still succeeds even if local fetch fails
  }

  const totalChanges = payload.commits.reduce(
    (sum, c) => sum + c.added.length + c.removed.length + c.modified.length,
    0
  );

  return {
    handled: true,
    projectId: conn.project_id,
    message: `Received ${payload.commits.length} commit(s) with ${totalChanges} file change(s)`,
  };
}

// ─── Middleware Helper ──────────────────────────────────────

export async function processWebhook(
  event: string,
  rawBody: string,
  signature: string | undefined
): Promise<WebhookResult> {
  // Only handle push events
  if (event !== "push") {
    return {
      handled: false,
      projectId: null,
      message: `Ignoring event type: ${event}`,
    };
  }

  const payload = JSON.parse(rawBody) as WebhookPayload;
  const repoOwner = payload.repository.owner.login;
  const repoName = payload.repository.name;

  // Look up webhook secret for this repo
  const conn = await db.findConnectionByRepo(repoOwner, repoName);

  // Verify signature if secret is set
  if (conn?.webhook_secret) {
    if (!verifySignature(rawBody, signature, conn.webhook_secret)) {
      return {
        handled: false,
        projectId: null,
        message: "Invalid webhook signature",
      };
    }
  }

  return handlePushEvent(payload);
}
