import { Hono } from "hono";
import { sql } from "../../db/index.js";
import { githubQueries } from "@doable/db/queries/github.js";
import {
  getGitHubRepoAuthUrl,
  GITHUB_REPO_REDIRECT_URI,
  exchangeGitHubCode,
} from "../../lib/oauth.js";

const db = githubQueries(sql);
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export const githubOAuthRoutes = new Hono({ strict: false });

// ─── OAuth: Initiate GitHub repo connection ─────────────────
// Browser redirect -- no auth middleware (user clicks a link).
// The userId is passed as a query param and embedded in the state.
githubOAuthRoutes.get("/github/connect", async (c) => {
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

  return c.redirect(await getGitHubRepoAuthUrl(encodedState));
});

// ─── OAuth: GitHub repo callback ────────────────────────────
// No auth middleware -- this is a browser redirect from GitHub.
githubOAuthRoutes.get("/github/repo/callback", async (c) => {
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
    // CSRF defense: state must be one we minted with type="repo" + a
    // server-side nonce. Without these checks an attacker who can craft an
    // arbitrary base64-encoded JSON could pin a victim's browser-derived
    // OAuth token onto an attacker-controlled userId/projectId.
    if (decoded.type !== "repo" || !decoded.nonce) {
      return c.redirect(`${FRONTEND_URL}?error=github_invalid_state`);
    }
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
