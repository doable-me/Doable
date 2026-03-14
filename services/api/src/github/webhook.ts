import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "../db/index.js";

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
  const [conn] = await sql<
    [{ id: string; project_id: string; webhook_secret: string | null } | undefined]
  >`
    SELECT id, project_id, webhook_secret
    FROM github_connections
    WHERE repo_owner = ${repoOwner} AND repo_name = ${repoName}
  `;

  if (!conn) {
    return {
      handled: false,
      projectId: null,
      message: `No connection found for ${repoOwner}/${repoName}`,
    };
  }

  // Extract branch from ref (refs/heads/main → main)
  const branch = payload.ref.replace("refs/heads/", "");

  // Log commits
  const headCommit = payload.head_commit;
  if (headCommit) {
    await sql`
      INSERT INTO github_commits (connection_id, sha, message, author, branch, direction)
      VALUES (
        ${conn.id},
        ${headCommit.id},
        ${headCommit.message},
        ${headCommit.author.name},
        ${branch},
        'pull'
      )
    `;
  }

  // Update sync status to indicate remote has new changes
  await sql`
    UPDATE github_connections
    SET sync_status = 'behind'
    WHERE id = ${conn.id}
  `;

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
  const [conn] = await sql<
    [{ webhook_secret: string | null } | undefined]
  >`
    SELECT webhook_secret
    FROM github_connections
    WHERE repo_owner = ${repoOwner} AND repo_name = ${repoName}
  `;

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
