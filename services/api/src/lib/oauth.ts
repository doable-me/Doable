// ─── GitHub OAuth ──────────────────────────────────────────

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const GITHUB_REDIRECT_URI =
  process.env.GITHUB_REDIRECT_URI ??
  "http://localhost:4000/auth/github/callback";

export interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
  name: string | null;
  avatar_url: string;
}

export function getGitHubAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
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
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
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

  // If email is private, fetch from emails endpoint
  if (!user.email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const emails = (await emailRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    const primary = emails.find((e) => e.primary && e.verified);
    user.email = primary?.email ?? emails[0]?.email ?? null;
  }

  return { accessToken: tokenData.access_token, user };
}

// ─── GitHub OAuth for Copilot Account Connection ──────────
export const GITHUB_COPILOT_REDIRECT_URI =
  process.env.GITHUB_COPILOT_REDIRECT_URI ??
  "http://localhost:4000/auth/github/copilot/callback";

export function getGitHubCopilotAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_COPILOT_REDIRECT_URI,
    scope: "read:user user:email",
    ...(state ? { state } : {}),
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

// ─── GitHub OAuth for Repo Connection (needs "repo" scope) ─

export const GITHUB_REPO_REDIRECT_URI =
  process.env.GITHUB_REPO_REDIRECT_URI ??
  "http://localhost:4000/github/repo/callback";

export function getGitHubRepoAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REPO_REDIRECT_URI,
    scope: "repo read:user",
    ...(state ? { state } : {}),
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
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
