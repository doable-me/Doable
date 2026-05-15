import { Hono } from "hono";
import * as githubClient from "../../github/client.js";
import { sql } from "../../db/index.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { type AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls as authMiddleware } from "../../middleware/rls.js";

const db = githubQueries(sql);

export const githubAccountRoutes = new Hono<AuthEnv>({ strict: false });

githubAccountRoutes.use("/github/repos", authMiddleware);
githubAccountRoutes.use("/github/disconnect", authMiddleware);
githubAccountRoutes.use("/github/status", authMiddleware);

// ─── Check GitHub connection status (user-level) ────────────
githubAccountRoutes.get("/github/status", async (c) => {
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

    // If decryption failed upstream (key rotated / ciphertext corrupt),
    // access_token will be null. Treat it as "reconnect required".
    if (!userToken.access_token) {
      return c.json({
        data: {
          connected: false,
          githubUsername: userToken.github_username,
          tokenExpired: true,
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
githubAccountRoutes.delete("/github/disconnect", async (c) => {
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
githubAccountRoutes.get("/github/repos", async (c) => {
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
