import { Hono } from "hono";
import * as githubClient from "../github/client.js";
import * as githubSync from "../github/sync.js";
import { processWebhook } from "../github/webhook.js";
import { sql } from "../db/index.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import {
  getGitHubRepoAuthUrl,
  GITHUB_REPO_REDIRECT_URI,
  exchangeGitHubCode,
} from "../lib/oauth.js";

const db = githubQueries(sql);
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const githubRoutes = new Hono<AuthEnv>();

// Protect API routes (not OAuth redirects or webhook)
githubRoutes.use("/github/repos", authMiddleware);
githubRoutes.use("/github/disconnect", authMiddleware);
githubRoutes.use("/github/status", authMiddleware);
githubRoutes.use("/:projectId/github/*", authMiddleware);

// ─── OAuth: Initiate GitHub repo connection ─────────────────
// Browser redirect -- no auth middleware (user clicks a link).
// The userId is passed as a query param and embedded in the state.
githubRoutes.get("/github/connect", (c) => {
  const userId = c.req.query("userId") ?? "";
  const projectId = c.req.query("projectId") ?? "";
  const returnUrl = c.req.query("returnUrl") ?? "";

  const state = JSON.stringify({
    type: "repo",
    userId,
    projectId,
    returnUrl,
    nonce: crypto.randomUUID(),
  });
  const encodedState = Buffer.from(state).toString("base64url");

  return c.redirect(getGitHubRepoAuthUrl(encodedState));
});

// ─── OAuth: GitHub repo callback ────────────────────────────
// No auth middleware -- this is a browser redirect from GitHub.
githubRoutes.get("/github/repo/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code) {
    return c.redirect(`${FRONTEND_URL}?error=github_missing_code`);
  }

  let projectId = "";
  let returnUrl = "";
  let userId = "";
  try {
    const decoded = JSON.parse(
      Buffer.from(stateParam ?? "", "base64url").toString()
    );
    projectId = decoded.projectId ?? "";
    returnUrl = decoded.returnUrl ?? "";
    userId = decoded.userId ?? "";
  } catch {
    return c.redirect(`${FRONTEND_URL}?error=github_invalid_state`);
  }

  try {
    const { accessToken: githubToken, user: ghUser } =
      await exchangeGitHubCode(code, GITHUB_REPO_REDIRECT_URI);

    if (userId) {
      await db.upsertUserToken({
        userId,
        githubUsername: ghUser.login,
        githubId: String(ghUser.id),
        accessToken: githubToken,
        scopes: "repo,read:user",
      });
    }

    // Redirect back to frontend with github info
    const params = new URLSearchParams({
      githubToken,
      githubUsername: ghUser.login,
      ...(projectId ? { projectId } : {}),
    });

    const redirectUrl = returnUrl
      ? `${returnUrl}?${params.toString()}`
      : `${FRONTEND_URL}/editor/${projectId}?githubConnected=true&${params.toString()}`;

    return c.redirect(redirectUrl);
  } catch (err) {
    console.error("[OAuth] GitHub repo callback error:", err);
    const redirectUrl = returnUrl || `${FRONTEND_URL}/editor/${projectId}`;
    return c.redirect(`${redirectUrl}?error=github_oauth_failed`);
  }
});

// ─── Check GitHub connection status (user-level) ────────────
githubRoutes.get("/github/status", async (c) => {
  const userId = c.get("userId");

  try {
    const userToken = await db.findUserToken(userId);

    if (!userToken) {
      return c.json({
        data: {
          connected: false,
          githubUsername: null,
        },
      });
    }

    // Verify the token is still valid
    try {
      const ghUser = await githubClient.authenticate(userToken.access_token);
      return c.json({
        data: {
          connected: true,
          githubUsername: ghUser.login,
          scopes: userToken.scopes,
          connectedAt: userToken.connected_at.toISOString(),
        },
      });
    } catch {
      // Token is invalid/expired
      return c.json({
        data: {
          connected: false,
          githubUsername: userToken.github_username,
          tokenExpired: true,
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get GitHub status", message }, 500);
  }
});

// ─── Disconnect GitHub (user-level) ─────────────────────────
githubRoutes.delete("/github/disconnect", async (c) => {
  const userId = c.get("userId");

  try {
    await db.deleteUserToken(userId);
    return c.json({ data: { disconnected: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to disconnect GitHub", message }, 500);
  }
});

// ─── List user repos ───────────────────────────────────────
githubRoutes.get("/github/repos", async (c) => {
  const userId = c.get("userId");

  // Try user token from DB first, then header fallback
  let token = c.req.header("X-GitHub-Token");

  if (!token) {
    const userToken = await db.findUserToken(userId);
    if (userToken) {
      token = userToken.access_token;
    }
  }

  if (!token) {
    return c.json({ error: "No GitHub token available. Connect GitHub first." }, 401);
  }

  try {
    const repos = await githubClient.listRepos(token);
    return c.json({ data: repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to list repos", message }, 500);
  }
});

// ─── Connect project to GitHub ─────────────────────────────
githubRoutes.post("/:projectId/github/connect", async (c) => {
  const projectId = c.req.param("projectId");
  const userId = c.get("userId");

  const body = await c.req.json<{
    token?: string;
    repoOwner: string;
    repoName: string;
    branch?: string;
    projectPath: string;
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

  if (!token || !body.repoOwner || !body.repoName || !body.projectPath) {
    return c.json(
      { error: "Missing required fields: repoOwner, repoName, projectPath (and a GitHub token)" },
      400
    );
  }

  try {
    // Validate token
    await githubClient.authenticate(token);

    const result = await githubSync.initialPush(projectId, body.projectPath, {
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to connect GitHub", message }, 500);
  }
});

// ─── Push to GitHub ─────────────────────────────────────────
githubRoutes.post("/:projectId/github/push", async (c) => {
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
    const pushFn = body.force
      ? githubSync.forcePushToGitHub
      : githubSync.pushToGitHub;

    const result = await pushFn(
      projectId,
      body.projectPath,
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
githubRoutes.post("/:projectId/github/pull", async (c) => {
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
    const result = await githubSync.pullFromGitHub(
      projectId,
      body.projectPath,
      userId
    );

    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to pull from GitHub", message }, 500);
  }
});

// ─── Sync status (project-level) ────────────────────────────
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

// ─── Commit history ─────────────────────────────────────────
githubRoutes.get("/:projectId/github/commits", async (c) => {
  const projectId = c.req.param("projectId");
  const page = parseInt(c.req.query("page") ?? "1", 10);
  const pageSize = parseInt(c.req.query("pageSize") ?? "20", 10);

  try {
    const result = await githubSync.getCommitHistory(projectId, { page, pageSize });
    return c.json({ data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: "Failed to get commit history", message }, 500);
  }
});

// ─── Disconnect project from GitHub ─────────────────────────
githubRoutes.delete("/:projectId/github/connect", async (c) => {
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
githubRoutes.post("/github/webhook", async (c) => {
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
