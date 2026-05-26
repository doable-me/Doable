import { Hono } from "hono";
import { sql } from "../../db/index.js";
import { authQueries } from "@doable/db/queries/auth.js";
import { githubQueries } from "@doable/db/queries/github.js";
import { mfaQueries } from "@doable/db/queries/mfa.js";
import { signupApprovalQueries } from "@doable/db/queries/signup-approval.js";
import {
  getGitHubAuthUrl, exchangeGitHubCode, getGitHubCopilotAuthUrl,
  getGitHubRepoAuthUrl, GITHUB_COPILOT_REDIRECT_URI, GITHUB_REPO_REDIRECT_URI,
  getGoogleAuthUrl, exchangeGoogleCode,
} from "../../lib/oauth.js";
import { verifyAccessToken } from "../../lib/jwt.js";
import {
  stripHtmlTags, issueTokens, ensureWorkspace, FRONTEND_URL,
} from "./helpers.js";
import { signMfaChallengeToken } from "../../lib/jwt.js";
import { firstUserBootstrap } from "../../auth/firstUserBootstrap.js";

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

export const oauthRoutes = new Hono({ strict: false });

// Validate a returnTo value is a safe same-origin path (starts with /, not //).
function safeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.length > 512) return null;
  return value;
}

// ─── GET /auth/github ──────────────────────────────────────
oauthRoutes.get("/github", async (c) => {
  const returnTo = safeReturnTo(c.req.query("returnTo"));
  const state = JSON.stringify({
    type: "github",
    nonce: crypto.randomUUID(),
    ...(returnTo ? { returnTo } : {}),
  });
  const encodedState = Buffer.from(state).toString("base64url");
  return c.redirect(await getGitHubAuthUrl(encodedState));
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
    try {
      await firstUserBootstrap(user.id, null, {
        clientIp: c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for") ?? null,
        userAgent: c.req.header("user-agent") ?? null,
      });
    } catch (err) {
      console.warn("[oauth/github] firstUserBootstrap error (non-fatal):", err);
    }

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
      try {
        await firstUserBootstrap(userId, null, {
          clientIp: c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for") ?? null,
          userAgent: c.req.header("user-agent") ?? null,
        });
      } catch (err) {
        console.warn("[oauth/google] firstUserBootstrap error (non-fatal):", err);
      }
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

// ─── GET /auth/github/repo/start ─ Initiate repo-scope OAuth ──────
// BUG-GH-001: this route previously did not exist. /auth/github/repo/start
// was returning 500/401 because there was no handler — repo-connect flow
// was only reachable via /github/connect (which doesn't require auth and
// takes userId as a query param). Test clients hitting /auth/github/repo/start
// expected an auth-gated 302 redirect to GitHub, so we now mirror the
// existing /github/connect handler but require a Bearer token / session.
oauthRoutes.get("/github/repo/start", async (c) => {
  // Manual auth check: Bearer header or `?token=` query param.
  // Browser <a href> can't set Authorization, so accept `?token=` too.
  const header = c.req.header("Authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const tokenFromQuery = c.req.query("token") ?? "";
  const accessToken = bearer || tokenFromQuery;

  let userId = "";
  if (accessToken) {
    try {
      const payload = await verifyAccessToken(accessToken);
      userId = payload.sub;
    } catch {
      return c.json({ error: "Unauthorized" }, 401);
    }
  } else {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const projectId = c.req.query("projectId") ?? "";
  const returnUrl = safeReturnTo(c.req.query("returnUrl")) ?? "";

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

// ─── GET /auth/github/copilot ─ Initiate Copilot account connection ─
// No authMiddleware — this is a browser redirect, not an API call.
// `scope` query param ("user" personal override | "workspace" shared with the
// workspace) is captured into the OAuth state so the callback can plumb it
// through to the apiAddCopilotAccount POST. Default = "user" preserves the
// pre-wizard /ai-settings behavior; the setup wizard passes scope=workspace
// because the platform admin's "Set Copilot for all users" save MUST land as
// a workspace-shared account, not a personal override hidden under their
// user id (which would invisibly disappear if they ever rotated their admin
// account).
oauthRoutes.get("/github/copilot", async (c) => {
  const workspaceId = c.req.query("workspaceId");
  const scope = c.req.query("scope") === "workspace" ? "workspace" : "user";
  // fromWizard=1 lets the callback page detect the setup-wizard flow
  // independently of `window.opener` — which Chrome/Safari can clear
  // after the cross-origin trip through github.com (COOP=
  // same-origin-allow-popups still permits the navigation but refuses
  // to expose opener). Without this flag the callback can't tell wizard
  // popups from regular /ai-settings connects and falls through to a
  // /admin/ai-settings redirect, stranding the wizard.
  const fromWizard = c.req.query("fromWizard") === "1";
  const state = JSON.stringify({
    type: "copilot",
    workspaceId,
    scope,
    fromWizard,
    nonce: crypto.randomUUID(),
  });
  const encodedState = Buffer.from(state).toString("base64url");
  return c.redirect(await getGitHubCopilotAuthUrl(encodedState));
});

// ─── GET /auth/github/copilot/callback ─ Handle Copilot account OAuth ─
oauthRoutes.get("/github/copilot/callback", async (c) => {
  const code = c.req.query("code");
  const stateParam = c.req.query("state");

  if (!code) return c.redirect(`${FRONTEND_URL}/ai-settings?error=missing_code`);

  let workspaceId: string | undefined;
  let scope: "user" | "workspace" = "user";
  let fromWizard = false;
  try {
    const decoded = JSON.parse(Buffer.from(stateParam ?? "", "base64url").toString());
    // CSRF defense: state was minted by our /github/copilot initiate above
    // with type="copilot" and a server-side nonce. Without these checks an
    // attacker who can craft an arbitrary base64-encoded JSON could feed in
    // a chosen workspaceId + scope=workspace and have the victim's browser
    // POST the OAuth token to /workspaces/<attackerWs>/ai-settings/copilot-
    // accounts. requireAdmin on the POST blunts the impact, but missing the
    // type/nonce check still drops one defense layer — see PR #50 review.
    if (decoded.type !== "copilot" || !decoded.nonce) {
      return c.redirect(`${FRONTEND_URL}/ai-settings?error=invalid_state`);
    }
    workspaceId = decoded.workspaceId;
    if (decoded.scope === "workspace") scope = "workspace";
    fromWizard = decoded.fromWizard === true;
  } catch {
    return c.redirect(`${FRONTEND_URL}/ai-settings?error=invalid_state`);
  }

  try {
    const { accessToken: githubToken, user: ghUser } = await exchangeGitHubCode(code, GITHUB_COPILOT_REDIRECT_URI);

    // Redirect back to frontend with the token info + the captured scope +
    // fromWizard flag. The callback page (apps/web/src/app/(dashboard)/ai-
    // settings/callback/page.tsx) reads fromWizard to decide whether to
    // hand control back to the setup wizard (postMessage + stay put) or
    // redirect to /ai-settings as it always has.
    const params = new URLSearchParams({
      githubToken,
      githubLogin: ghUser.login,
      githubId: String(ghUser.id),
      scope,
      ...(fromWizard ? { fromWizard: "1" } : {}),
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
    // CSRF defense: see copilot callback above. State must be one we minted
    // with type="repo" + a server-side nonce, not an attacker-controlled
    // base64-encoded JSON pinning a chosen userId/projectId.
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
