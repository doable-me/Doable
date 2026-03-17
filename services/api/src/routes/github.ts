import { Hono } from "hono";
import * as githubClient from "../github/client.js";
import * as githubSync from "../github/sync.js";
import { processWebhook } from "../github/webhook.js";
import { sql } from "../db/index.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";

export const githubRoutes = new Hono<AuthEnv>();

// Protect all routes except webhook — use specific paths to avoid
// matching unrelated routes (this router is mounted at "/" in index.ts)
githubRoutes.use("/:projectId/github/*", authMiddleware);
githubRoutes.use("/repos", authMiddleware);

// ─── Connect project to GitHub ─────────────────────────────
githubRoutes.post("/:projectId/github/connect", async (c) => {
  const projectId = c.req.param("projectId");

  const body = await c.req.json<{
    token: string;
    repoOwner: string;
    repoName: string;
    branch?: string;
    userId: string;
    projectPath: string;
    createNew?: boolean;
    isPrivate?: boolean;
    description?: string;
  }>();

  if (!body.token || !body.repoOwner || !body.repoName || !body.userId || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: token, repoOwner, repoName, userId, projectPath" },
      400
    );
  }

  try {
    // Validate token
    await githubClient.authenticate(body.token);

    const result = await githubSync.initialPush(projectId, body.projectPath, {
      token: body.token,
      repoOwner: body.repoOwner,
      repoName: body.repoName,
      branch: body.branch,
      userId: body.userId,
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to connect GitHub", message }, 500);
  }
});

// ─── Push to GitHub ─────────────────────────────────────────
githubRoutes.post("/:projectId/github/push", async (c) => {
  const projectId = c.req.param("projectId");

  const body = await c.req.json<{
    message: string;
    userId: string;
    projectPath: string;
  }>();

  if (!body.message || !body.userId || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: message, userId, projectPath" },
      400
    );
  }

  try {
    const result = await githubSync.pushToGitHub(
      projectId,
      body.projectPath,
      body.message,
      body.userId
    );

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to push to GitHub", message }, 500);
  }
});

// ─── Pull from GitHub ───────────────────────────────────────
githubRoutes.post("/:projectId/github/pull", async (c) => {
  const projectId = c.req.param("projectId");

  const body = await c.req.json<{
    userId: string;
    projectPath: string;
  }>();

  if (!body.userId || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: userId, projectPath" },
      400
    );
  }

  try {
    const result = await githubSync.pullFromGitHub(
      projectId,
      body.projectPath,
      body.userId
    );

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to pull from GitHub", message }, 500);
  }
});

// ─── Sync status ────────────────────────────────────────────
githubRoutes.get("/:projectId/github/status", async (c) => {
  const projectId = c.req.param("projectId");

  try {
    const status = await githubSync.syncStatus(projectId);
    return c.json({ data: status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get sync status", message }, 500);
  }
});

// ─── List user repos ───────────────────────────────────────
githubRoutes.get("/repos", async (c) => {
  const token = c.req.header("X-GitHub-Token");

  if (!token) {
    return c.json({ error: "Missing X-GitHub-Token header" }, 401);
  }

  try {
    const repos = await githubClient.listRepos(token);
    return c.json({ data: repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to list repos", message }, 500);
  }
});

// ─── Webhook ────────────────────────────────────────────────
githubRoutes.post("/webhook", async (c) => {
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
