import { Hono } from "hono";
import { sql } from "../../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { mfaQueries } from "@doable/db/queries/mfa.js";
import { signupApprovalQueries } from "@doable/db/queries/signup-approval.js";
import {
  getGitHubAuthUrl, exchangeGitHubCode, getGitHubCopilotAuthUrl,
  GITHUB_COPILOT_REDIRECT_URI, GITHUB_REPO_REDIRECT_URI,
  getGoogleAuthUrl, exchangeGoogleCode,
} from "../../lib/oauth.js";
import {
  stripHtmlTags, issueTokens, ensureWorkspace, FRONTEND_URL,
} from "./helpers.js";
import { signMfaChallengeToken } from "../../lib/jwt.js";

const auth = authQueries(sql);
const mfa = mfaQueries(sql);
const signupApproval = signupApprovalQueries(sql);

/**
 * For OAuth callbacks: figure out the approval status the user should have
 * AFTER the upsert. We must decide BEFORE calling createOrUpdateOAuthUser
 * so that brand-new users get persisted as 'pending' when approvals are on.
 * Existing users keep whatever status they already had.
 */
async function resolveOauthApprovalStatus(email: string): Promise<"approved" | "pending"> {
  const existing = await auth.findUserByEmail(email).catch(() => undefined);
  if (existing) return existing.approval_status === "pending" ? "pending" : "approved";
  const cfg = await signupApproval.getConfig().catch(() => ({ enabled: false, pending_message: "" }));
  return cfg.enabled ? "pending" : "approved";
}

/**
 * Returns a redirect URL when the OAuth user's account is blocked from
 * signing in (pending or rejected). Returns null if they should proceed.
 */
async function maybePendingRedirect(userId: string): Promise<string | null> {
  let status: string | undefined;
  try {
    const [row] = await sql<{ approval_status: string }[]>`
      SELECT approval_status FROM users WHERE id = ${userId}
    `;
    status = row?.approval_status;
  } catch { /* ignore */ }
  if (status === "pending") {
    const cfg = await signupApproval.getConfig();
    const params = new URLSearchParams({ pending: "1", message: cfg.pending_message });
    return `${FRONTEND_URL}/login?${params.toString()}`;
  }
  if (status === "rejected") {
    const params = new URLSearchParams({ error: "ACCOUNT_DENIED", message: "Your signup was not approved." });
    return `${FRONTEND_URL}/login?${params.toString()}`;
  }
  return null;
}

/**
 * Build the post-OAuth redirect URL. If the user has MFA enabled we send
 * them to /auth/callback with `mfaToken=...` in the fragment instead of
 * the real session pair; the frontend forwards them to the MFA challenge
 * screen. Otherwise we pass real tokens via fragment as before (Bug-105).
 */
async function postOauthRedirect(args: {
  userId: string;
  email: string;
  returnTo: string | null;
}): Promise<string> {
  const fragParams = new URLSearchParams();
  let mfaRequired = false;
  try {
    mfaRequired = await mfa.hasVerifiedFactor(args.userId);
  } catch (err) {
    console.warn("[OAuth] MFA check failed, proceeding without MFA gate:", err);
  }

  if (mfaRequired) {
    const mfaToken = await signMfaChallengeToken(args.userId, args.email);
    fragParams.set("mfaToken", mfaToken);
  } else {
    const tokens = await issueTokens(args.userId, args.email);
    fragParams.set("accessToken", tokens.accessToken);
    fragParams.set("refreshToken", tokens.refreshToken);
  }
  if (args.returnTo) fragParams.set("returnTo", args.returnTo);
  return `${FRONTEND_URL}/auth/callback#${fragParams.toString()}`;
}

export const oauthRoutes = new Hono();

// Validate a returnTo value is a safe same-origin path (starts with /, not //).
function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.length > 512) return null;
  return value;
}

// ─── GET /auth/github ──────────────────────────────────────
oauthRoutes.get("/github", (c) => {
  const returnTo = safeReturnTo(c.req.query("returnTo"));
  const state = JSON.stringify({
    type: "github",
    nonce: crypto.randomUUID(),
    ...(returnTo ? { returnTo } : {}),
  });
  const encodedState = Buffer.from(state).toString("base64url");
  return c.redirect(getGitHubAuthUrl(encodedState));
});

// ─── GET /auth/github/callback ─────────────────────────────
oauthRoutes.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  if (!code) return c.redirect(`${FRONTEND_URL}/login?error=missing_code`);

  // Validate state parameter to prevent CSRF (Bug-114)
  let decodedState: { type?: string; nonce?: string; returnTo?: string } = {};
  try {
    decodedState = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    if (decodedState.type !== "github" || !decodedState.nonce) throw new Error("bad state");
  } catch {
    return c.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
  }
  const returnTo = safeReturnTo(decodedState.returnTo);

  try {
    const { user: ghUser } = await exchangeGitHubCode(code);
    if (!ghUser.email) return c.redirect(`${FRONTEND_URL}/login?error=no_email`);

    if (await signupApproval.isEmailBlocked(ghUser.email)) {
      return c.redirect(`${FRONTEND_URL}/login?error=ACCOUNT_DENIED&message=${encodeURIComponent("This email address cannot be registered.")}`);
    }

    const approvalStatus = await resolveOauthApprovalStatus(ghUser.email);

    const user = await auth.createOrUpdateOAuthUser({
      email: ghUser.email, displayName: stripHtmlTags(ghUser.name ?? ghUser.login),
      avatarUrl: ghUser.avatar_url, githubId: String(ghUser.id),
      approvalStatus,
    });

    const blocked = await maybePendingRedirect(user.id);
    if (blocked) return c.redirect(blocked);

    // Auto-create personal workspace for new OAuth users
    await ensureWorkspace(user.id, user.display_name, user.email);

    return c.redirect(await postOauthRedirect({
      userId: user.id,
      email: user.email,
      returnTo,
    }));
  } catch (err) {
    console.error("[OAuth] GitHub callback error:", err);
    return c.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ─── GET /auth/google ──────────────────────────────────────
oauthRoutes.get("/google", (c) => {
  const returnTo = safeReturnTo(c.req.query("returnTo"));
  const state = JSON.stringify({
    type: "google",
    nonce: crypto.randomUUID(),
    ...(returnTo ? { returnTo } : {}),
  });
  const encodedState = Buffer.from(state).toString("base64url");
  return c.redirect(getGoogleAuthUrl(encodedState));
});

// ─── GET /auth/google/callback ─────────────────────────────
oauthRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  if (!code) return c.redirect(`${FRONTEND_URL}/login?error=missing_code`);

  // Validate state parameter to prevent CSRF (Bug-114)
  let decodedState: { type?: string; nonce?: string; returnTo?: string } = {};
  try {
    decodedState = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    if (decodedState.type !== "google" || !decodedState.nonce) throw new Error("bad state");
  } catch {
    return c.redirect(`${FRONTEND_URL}/login?error=invalid_state`);
  }
  const returnTo = safeReturnTo(decodedState.returnTo);

  try {
    const { user: googleUser } = await exchangeGoogleCode(code);

    if (await signupApproval.isEmailBlocked(googleUser.email)) {
      return c.redirect(`${FRONTEND_URL}/login?error=ACCOUNT_DENIED&message=${encodeURIComponent("This email address cannot be registered.")}`);
    }

    // Try database first, fall back to direct JWT if DB is unavailable
    let userId: string;
    let email: string;
    try {
      const approvalStatus = await resolveOauthApprovalStatus(googleUser.email);
      const user = await auth.createOrUpdateOAuthUser({
        email: googleUser.email, displayName: stripHtmlTags(googleUser.name),
        avatarUrl: googleUser.picture, googleId: googleUser.sub,
        approvalStatus,
      });
      userId = user.id;
      email = user.email;

      const blocked = await maybePendingRedirect(user.id);
      if (blocked) return c.redirect(blocked);

      // Auto-create personal workspace for new OAuth users
      await ensureWorkspace(userId, user.display_name, user.email);
    } catch (dbErr) {
      console.warn("[OAuth] DB unavailable, issuing token from Google profile:", dbErr);
      userId = `google-${googleUser.sub}`;
      email = googleUser.email;
    }

    return c.redirect(await postOauthRedirect({
      userId,
      email,
      returnTo,
    }));
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
