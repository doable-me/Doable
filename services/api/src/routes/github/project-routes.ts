import { Hono } from "hono";
import * as githubClient from "../../github/client.js";
import * as githubSync from "../../github/sync.js";
import { processWebhook } from "../../github/webhook.js";
import { sql } from "../../db/index.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { type AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls as authMiddleware } from "../../middleware/rls.js";
import { getProjectPath } from "../../ai/project-files.js";
import { requireProjectAccess } from "../projects/helpers.js";

const db = githubQueries(sql);

export const githubProjectRoutes = new Hono<AuthEnv>({ strict: false });

// Protect project-level routes (not webhook)
githubProjectRoutes.use("/:projectId/github/*", authMiddleware);

// ─── Project-membership guard ───────────────────────────────
// BUG-CORPUS-GH-001: prior to this guard, `/:projectId/github/*` only
// required auth; any signed-in user could read another tenant's
// repoOwner / repoName / repoUrl / lastCommitSha via /github/status and
// enumerate projects via /github/commits. We now hide existence (404) for
// any caller that is not a workspace member, project collaborator, or
// platform admin — same semantics as `/projects/:id`.
githubProjectRoutes.use("/:projectId/github/*", async (c, next) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");
  if (!projectId || !userId) {
    return c.json({ error: "Project not found" }, 404);
  }
  const access = await requireProjectAccess(userId, projectId);
  if (!access) {
    return c.json({ error: "Project not found" }, 404);
  }
  await next();
});

// ─── Connect project to GitHub ─────────────────────────────
githubProjectRoutes.post("/:projectId/github/connect", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    token?: string;
    repoOwner: string;
    repoName: string;
    branch?: string;
    projectPath?: string;
    createNew?: boolean;
    isPrivate?: boolean;
    description?: string;
  }>();

  // Get token from body, header, or user's stored token
  let token = body.token ?? c.req.header("X-GitHub-Token");
  if (!token) {
    const userToken = await db.findUserToken(userId);
    if (userToken) {
      token = userToken.access_token;
    }
  }

  if (!token || !body.repoOwner || !body.repoName) {
    return c.json(
      { error: "Missing required fields: repoOwner, repoName (and a GitHub token)" },
      400
    );
  }

  try {
    // Validate token
    await githubClient.authenticate(token);

    const projectPath = getProjectPath(projectId);

    const result = await githubSync.initialPush(projectId, projectPath, {
      token,
      repoOwner: body.repoOwner,
      repoName: body.repoName,
      branch: body.branch,
      userId,
      createNew: body.createNew,
      isPrivate: body.isPrivate,
      description: body.description,
    });

    // Update project's github_repo_url
    await sql`
      UPDATE projects
      SET github_repo_url = ${`https://github.com/${body.repoOwner}/${body.repoName}`}
      WHERE id = ${projectId}
    `;

    return c.json({ data: result }, 201);
  } catch (err) {
    console.error(`[GitHub] connect error for ${projectId}: ${err instanceof Error ? err.message : err}`);
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to connect GitHub", message }, 500);
  }
});

// ─── Push to GitHub ─────────────────────────────────────────
githubProjectRoutes.post("/:projectId/github/push", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    message: string;
    projectPath: string;
    force?: boolean;
  }>();

  if (!body.message || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: message, projectPath" },
      400
    );
  }

  try {
    const projectPath = getProjectPath(projectId);
    const pushFn = body.force
      ? githubSync.forcePushToGitHub
      : githubSync.pushToGitHub;

    const result = await pushFn(
      projectId,
      projectPath,
      body.message,
      userId
    );

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const isConflict = message.includes("Conflict detected");
    return c.json(
      { error: isConflict ? "Conflict detected" : "Failed to push to GitHub", message },
      isConflict ? 409 : 500
    );
  }
});

// ─── Pull from GitHub ───────────────────────────────────────
githubProjectRoutes.post("/:projectId/github/pull", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    projectPath: string;
  }>();

  if (!body.projectPath) {
    return c.json(
      { error: "Missing required field: projectPath" },
      400
    );
  }

  try {
    const projectPath = getProjectPath(projectId);
    const result = await githubSync.pullFromGitHub(
      projectId,
      projectPath,
      userId
    );

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to pull from GitHub", message }, 500);
  }
});

// ─── Sync status (project-level) ────────────────────────────
githubProjectRoutes.get("/:projectId/github/status", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const status = await githubSync.syncStatus(projectId);
    return c.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get sync status", message }, 500);
  }
});

// ─── Commit history ─────────────────────────────────────────
githubProjectRoutes.get("/:projectId/github/commits", async (c) => {
  const projectId = c.req.param("projectId");
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "20", 10) || 20, 1), 100);

  try {
    const result = await githubSync.getCommitHistory(projectId, { page, pageSize });
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get commit history", message }, 500);
  }
});

// ─── Import from GitHub (clone existing repo) ───────────────
githubProjectRoutes.post("/:projectId/github/import", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    repoOwner: string;
    repoName: string;
    branch?: string;
  }>();

  if (!body.repoOwner || !body.repoName) {
    return c.json(
      { error: "Missing required fields: repoOwner, repoName" },
      400
    );
  }

  // Get token from user's stored token
  let token: string | undefined;
  const userToken = await db.findUserToken(userId);
  if (userToken) {
    token = userToken.access_token;
  }

  if (!token) {
    return c.json({ error: "No GitHub token available. Connect GitHub first." }, 401);
  }

  try {
    const projectPath = getProjectPath(projectId);
    const result = await githubSync.importFromGitHub(
      projectId,
      projectPath,
      {
        token,
        repoOwner: body.repoOwner,
        repoName: body.repoName,
        branch: body.branch,
        userId,
      }
    );

    return c.json({ data: result }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to import from GitHub", message }, 500);
  }
});

// ─── Resolve merge conflicts ─────────────────────────────────
githubProjectRoutes.post("/:projectId/github/resolve", async (c) => {
  const projectId = c.req.param("projectId");

  const body = await c.req.json<{
    strategy: "ours" | "theirs";
    projectPath: string;
  }>();

  if (!body.strategy || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: strategy, projectPath" },
      400
    );
  }

  try {
    await githubSync.resolveConflicts(body.projectPath, body.strategy);

    // Update sync status
    await sql`
      UPDATE github_connections SET sync_status = 'synced', last_synced_at = NOW()
      WHERE project_id = ${projectId}
    `;

    return c.json({ data: { resolved: true, strategy: body.strategy } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to resolve conflicts", message }, 500);
  }
});

// ─── Abort merge ─────────────────────────────────────────────
githubProjectRoutes.post("/:projectId/github/abort-merge", async (c) => {
  const body = await c.req.json<{ projectPath: string }>();

  if (!body.projectPath) {
    return c.json({ error: "Missing required field: projectPath" }, 400);
  }

  try {
    await githubSync.abortMerge(body.projectPath);
    return c.json({ data: { aborted: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to abort merge", message }, 500);
  }
});

// ─── Disconnect project from GitHub ─────────────────────────
githubProjectRoutes.delete("/:projectId/github/connect", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const deleted = await githubSync.disconnectGitHub(projectId);
    return c.json({ data: { disconnected: deleted } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to disconnect GitHub", message }, 500);
  }
});

// ─── Webhook ────────────────────────────────────────────────
githubProjectRoutes.post("/github/webhook", async (c) => {
  const event = c.req.header("X-GitHub-Event");
  const signature = c.req.header("X-Hub-Signature-256");

  if (!event) {
    return c.json({ error: "Missing X-GitHub-Event header" }, 400);
  }

  try {
    const rawBody = await c.req.text();
    const result = await processWebhook(event, rawBody, signature ?? undefined);

    return c.json({ data: result }, result.handled ? 200 : 202);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Webhook processing failed", message }, 500);
  }
});
