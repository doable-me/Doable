import { Hono } from "hono";
import { sql } from "../../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { githubQueries } from "@doable/db/queries/github.js";
import {
  getGitHubAuthUrl, exchangeGitHubCode, getGitHubCopilotAuthUrl,
  GITHUB_COPILOT_REDIRECT_URI, GITHUB_REPO_REDIRECT_URI,
  getGoogleAuthUrl, exchangeGoogleCode,
} from "../../lib/oauth.js";
import {
  stripHtmlTags, sanitizeUser, issueTokens, ensureWorkspace, FRONTEND_URL,
} from "./helpers.js";

const auth = authQueries(sql);

export const oauthRoutes = new Hono();

// ─── GET /auth/github ──────────────────────────────────────
oauthRoutes.get("/github", (c) => {
  return c.redirect(getGitHubAuthUrl(crypto.randomUUID()));
});

// ─── GET /auth/github/callback ─────────────────────────────
oauthRoutes.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect(`${FRONTEND_URL}/login?error=missing_code`);
  try {
    const { user: ghUser } = await exchangeGitHubCode(code);
    if (!ghUser.email) return c.redirect(`${FRONTEND_URL}/login?error=no_email`);

    const user = await auth.createOrUpdateOAuthUser({
      email: ghUser.email, displayName: stripHtmlTags(ghUser.name ?? ghUser.login),
      avatarUrl: ghUser.avatar_url, githubId: String(ghUser.id),
    });

    // Auto-create personal workspace for new OAuth users
    await ensureWorkspace(user.id, user.display_name, user.email);

    const tokens = await issueTokens(user.id, user.email);
    const params = new URLSearchParams({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    return c.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    console.error("[OAuth] GitHub callback error:", err);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ─── GET /auth/google ──────────────────────────────────────
oauthRoutes.get("/google", (c) => {
  return c.redirect(getGoogleAuthUrl(crypto.randomUUID()));
});

// ─── GET /auth/google/callback ─────────────────────────────
oauthRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.redirect(`${FRONTEND_URL}/login?error=missing_code`);
  try {
    const { user: googleUser } = await exchangeGoogleCode(code);

    // Try database first, fall back to direct JWT if DB is unavailable
    let userId: string;
    let email: string;
    try {
      const user = await auth.createOrUpdateOAuthUser({
        email: googleUser.email, displayName: stripHtmlTags(googleUser.name),
        avatarUrl: googleUser.picture, googleId: googleUser.sub,
      });
      userId = user.id;
      email = user.email;

      // Auto-create personal workspace for new OAuth users
      await ensureWorkspace(userId, user.display_name, user.email);
    } catch (dbErr) {
      console.warn("[OAuth] DB unavailable, issuing token from Google profile:", dbErr);
      userId = `google-${googleUser.sub}`;
      email = googleUser.email;
    }

    const tokens = await issueTokens(userId, email);
    const params = new URLSearchParams({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
    return c.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
  } catch (err) {
    console.error("[OAuth] Google callback error:", err);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ─── GET /auth/github/copilot ─ Initiate Copilot account connection ─
// No authMiddleware — this is a browser redirect, not an API call.
oauthRoutes.get("/github/copilot", (c) => {
  // Pass workspace info via state parameter
  const workspaceId = c.req.query("workspaceId");
  const state = JSON.stringify({ type: "copilot", workspaceId, nonce: crypto.randomUUID() });
  const encodedState = Buffer.from(state).toString("base64url");
  return c.redirect(getGitHubCopilotAuthUrl(encodedState));
});

// ─── GET /auth/github/copilot/callback ─ Handle Copilot account OAuth ─
oauthRoutes.get("/github/copilot/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code) return c.redirect(`${FRONTEND_URL}/ai-settings?error=missing_code`);

  let workspaceId: string | undefined;
  try {
    const decoded = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    workspaceId = decoded.workspaceId;
  } catch {
    return c.redirect(`${FRONTEND_URL}/ai-settings?error=invalid_state`);
  }

  try {
    const { accessToken: githubToken, user: ghUser } = await exchangeGitHubCode(code, GITHUB_COPILOT_REDIRECT_URI);

    // Redirect back to frontend with the token info — the frontend will call
    // the API to store it (we can't call the DB here without the user's JWT).
    const params = new URLSearchParams({
      githubToken,
      githubLogin: ghUser.login,
      githubId: String(ghUser.id),
      ...(workspaceId ? { workspaceId } : {}),
    });
    return c.redirect(`${FRONTEND_URL}/ai-settings/callback?${params.toString()}`);
  } catch (err) {
    console.error("[OAuth] GitHub Copilot callback error:", err);
    return c.redirect(`${FRONTEND_URL}/ai-settings?error=oauth_failed`);
  }
});

// ─── GET /auth/github/repo/callback ─ Handle GitHub repo OAuth ─
// This route handles the repo-scoped OAuth callback (needs "repo" scope)
// so users can push/pull code to GitHub from their Doable projects.
oauthRoutes.get("/github/repo/callback", async (c) => {
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
      const ghDb = githubQueries(sql);
      await ghDb.upsertUserToken({
        userId,
        githubUsername: ghUser.login,
        githubId: String(ghUser.id),
        accessToken: githubToken,
        scopes: "repo,read:user",
      });
    }

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
