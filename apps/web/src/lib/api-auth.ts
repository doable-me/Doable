import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from "@doable/shared";
import { apiFetch, storeTokens, getStoredTokens, clearTokens } from "./api-core";
import { isMfaChallenge, type MfaChallenge } from "./api-mfa";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Auth API Methods ──────────────────────────────────────

/**
 * Log in with email + password. If the user has opted into MFA the API
 * returns an MFA challenge instead of session tokens; callers must
 * forward the user to the MFA prompt and exchange the challenge via
 * `apiMfaLoginVerify`. Tokens are only stored when a real session is
 * returned, never for an MFA challenge.
 */
export async function apiLogin(
  data: LoginRequest
): Promise<AuthResponse | MfaChallenge> {
  const res = await apiFetch<AuthResponse | MfaChallenge>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (isMfaChallenge(res)) return res;
  storeTokens(res.tokens);
  return res;
}

/**
 * Exchange an MFA challenge token + 6-digit TOTP code (or a recovery
 * code) for real session tokens. Stores tokens on success.
 */
export async function apiMfaLoginVerify(args: {
  mfaToken: string;
  code: string;
}): Promise<AuthResponse & { usedRecovery: boolean; unusedRecoveryCodes: number }> {
  const res = await apiFetch<
    AuthResponse & { usedRecovery: boolean; unusedRecoveryCodes: number }
  >("/auth/mfa/verify", {
    method: "POST",
    body: JSON.stringify(args),
  });
  storeTokens(res.tokens);
  return res;
}

export interface PendingSignupResponse {
  pending: true;
  message: string;
}

export function isPendingSignup(res: unknown): res is PendingSignupResponse {
  return (
    typeof res === "object" &&
    res !== null &&
    "pending" in res &&
    (res as { pending?: unknown }).pending === true
  );
}

export async function apiRegister(
  data: RegisterRequest
): Promise<AuthResponse | PendingSignupResponse> {
  const res = await apiFetch<AuthResponse | PendingSignupResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (isPendingSignup(res)) return res;
  storeTokens(res.tokens);
  return res;
}

export async function apiLogout(): Promise<void> {
  const { refreshToken } = getStoredTokens();
  try {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    });
  } finally {
    clearTokens();
    if (typeof window !== "undefined") {
      localStorage.removeItem("doable_active_workspace_id");
    }
  }
}

export async function apiGetMe(): Promise<{
  user: Omit<User, "githubId" | "googleId">;
}> {
  return apiFetch("/auth/me");
}

export async function apiForgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function apiResetPassword(data: {
  token: string;
  password: string;
}): Promise<{ message: string }> {
  return apiFetch("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getGitHubLoginUrl(returnTo?: string | null): string {
  const base = `${API_URL}/auth/github`;
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}

export function getGoogleLoginUrl(returnTo?: string | null): string {
  const base = `${API_URL}/auth/google`;
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}
