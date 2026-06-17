// ─── GitHub OAuth ──────────────────────────────────────────
//
// All three first-party GitHub flows (sign-in, Copilot, repo) live under one
// parent path `/oauth/github/{login,copilot,repo}/callback` so a single GitHub
// OAuth App registered with callback `https://${host}/oauth/github/` covers
// every flow via GitHub's subdirectory-match rule. The integrations layer at
// `services/api/src/integrations/oauth2.ts` is intentionally separate — it has
// its own per-integration oauth_apps table + OAUTH_REDIRECT_URI and remains
// untouched by this refactor.
//
// Credentials resolve at call time, not module load:
//   process.env.GITHUB_CLIENT_ID  →  platform_config "setup.github_client_id"
// This lets the setup wizard's Step 3 save take effect immediately without an
// api container restart (previously: wizard saved to platform_config but
// lib/oauth.ts read only from env, so saves had no runtime effect).

import { getConfig, getEncryptedConfig } from "./platformConfig";

async function getGitHubClientId(): Promise<string> {
  const fromEnv = process.env.GITHUB_CLIENT_ID;
  if (fromEnv) return fromEnv;
  const fromDb = await getConfig("setup.github_client_id");
  return typeof fromDb === "string" ? fromDb : "";
}

async function getGitHubClientSecret(): Promise<string> {
  const fromEnv = process.env.GITHUB_CLIENT_SECRET;
  if (fromEnv) return fromEnv;
  const fromDb = await getEncryptedConfig("setup.github_client_secret");
  return fromDb ?? "";
}

const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI ??
  "http://localhost:4000/oauth/github/login/callback";

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

export async function getGitHubAuthUrl(state?: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: await getGitHubClientId(),
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: "read:user user:email",
    ...(state ? { state } : {}),
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeGitHubCode(
  code: string,
  redirectUri?: string,
): Promise<{ accessToken: string; user: GitHubUser }> {
  // Exchange code for token
  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: await getGitHubClientId(),
        client_secret: await getGitHubClientSecret(),
        code,
        redirect_uri: redirectUri ?? GITHUB_REDIRECT_URI,
      }),
    }
  );

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    throw new Error(
      tokenData.error_description ?? "Failed to exchange GitHub code"
    );
  }

  // Fetch user profile
  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const user = (await userRes.json()) as GitHubUser;

  // If email is private, try to fetch from emails endpoint
  if (!user.email) {
    try {
      const emailRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email: string;
          primary: boolean;
          verified: boolean;
        }>;
        if (Array.isArray(emails)) {
          const primary = emails.find((e) => e.primary && e.verified);
          user.email = primary?.email ?? emails[0]?.email ?? null;
        }
      }
    } catch {
      // Email fetch failed (scope may not include user:email) — continue without email
    }
  }

  return { accessToken: tokenData.access_token, user };
}

// ─── GitHub OAuth for Copilot Account Connection ──────────
export const GITHUB_COPILOT_REDIRECT_URI =
  process.env.GITHUB_COPILOT_REDIRECT_URI ??
  "http://localhost:4000/oauth/github/copilot/callback";

export async function getGitHubCopilotAuthUrl(state?: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: await getGitHubClientId(),
    redirect_uri: GITHUB_COPILOT_REDIRECT_URI,
    scope: "read:user user:email",
    ...(state ? { state } : {}),
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// ─── GitHub OAuth for Repo Connection (needs "repo" scope) ─

export const GITHUB_REPO_REDIRECT_URI =
  process.env.GITHUB_REPO_REDIRECT_URI ??
  "http://localhost:4000/oauth/github/repo/callback";

export async function getGitHubRepoAuthUrl(state?: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: await getGitHubClientId(),
    redirect_uri: GITHUB_REPO_REDIRECT_URI,
    scope: "repo read:user",
    ...(state ? { state } : {}),
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// ─── Revoke a GitHub OAuth grant (used by "Switch account") ─
//
// Deleting Doable's stored token alone does NOT revoke the authorization on
// github.com. GitHub OAuth Apps have no `prompt=select_account`, so the next
// authorize call — with an active github.com session and an existing grant —
// silently re-issues a token for the SAME account with no chooser. That's why
// "Switch account" appeared to do nothing. Revoking the grant via the GitHub
// app endpoint forces GitHub to show its authorization/account screen on the
// next connect, which is where the user can actually pick a different account.
//
// Generic + platform-level: uses the same client_id/client_secret every flow
// resolves at call time, so it works on any install (env or setup-wizard
// creds) and for every project. Best-effort: returns false instead of throwing
// so a revoke failure (network, missing creds) can never block the disconnect.
export async function revokeGitHubGrant(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;
  const clientId = await getGitHubClientId();
  const clientSecret = await getGitHubClientSecret();
  if (!clientId || !clientSecret) return false;
  try {
    const res = await fetch(
      `https://api.github.com/applications/${clientId}/grant`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization:
            "Basic " +
            Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: accessToken }),
      },
    );
    // 204 = grant revoked; 404 = no such grant (already gone) — both mean the
    // github.com authorization is no longer present, so treat as success.
    return res.status === 204 || res.status === 404;
  } catch {
    return false;
  }
}

// ─── Google OAuth ──────────────────────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI ??
  "http://localhost:4000/auth/google/callback";

export interface GoogleUser {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture: string;
}

export function getGoogleAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    ...(state ? { state } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string
): Promise<{ accessToken: string; user: GoogleUser }> {
  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    throw new Error(
      tokenData.error_description ?? "Failed to exchange Google code"
    );
  }

  // Fetch user info
  const userRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    }
  );

  const user = (await userRes.json()) as GoogleUser;

  return { accessToken: tokenData.access_token, user };
}
