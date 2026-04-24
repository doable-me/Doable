import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
} from "@doable/shared";
import { apiFetch, storeTokens, getStoredTokens, clearTokens } from "./api-core";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Auth API Methods ──────────────────────────────────────

export async function apiLogin(
  data: LoginRequest
): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
  storeTokens(res.tokens);
  return res;
}

export async function apiRegister(
  data: RegisterRequest
): Promise<AuthResponse> {
  const res = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
