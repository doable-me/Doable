import type {
  AuthResponse,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  ApiErrorResponse,
  User,
} from "@doable/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Token Storage ─────────────────────────────────────────

const TOKEN_KEY = "doable_access_token";
const REFRESH_KEY = "doable_refresh_token";

export function getStoredTokens(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null };
  }
  return {
    accessToken: localStorage.getItem(TOKEN_KEY),
    refreshToken: localStorage.getItem(REFRESH_KEY),
  };
}

export function storeTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ─── API Error ─────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorResponse
  ) {
    super(body.error);
    this.name = "ApiError";
  }
}

// ─── Core Fetch Wrapper ────────────────────────────────────

let refreshPromise: Promise<AuthTokens | null> | null = null;

async function refreshTokens(): Promise<AuthTokens | null> {
  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken } satisfies RefreshTokenRequest),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = (await res.json()) as AuthResponse;
    storeTokens(data.tokens);
    return data.tokens;
  } catch {
    clearTokens();
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { accessToken } = getStoredTokens();

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  // If 401, try to refresh and retry once
  if (res.status === 401 && accessToken) {
    // Deduplicate concurrent refresh attempts
    if (!refreshPromise) {
      refreshPromise = refreshTokens().finally(() => {
        refreshPromise = null;
      });
    }

    const newTokens = await refreshPromise;
    if (newTokens) {
      headers.set("Authorization", `Bearer ${newTokens.accessToken}`);
      res = await fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({
      error: "Request failed",
    }))) as ApiErrorResponse;
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

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

export function getGitHubLoginUrl(): string {
  return `${API_URL}/auth/github`;
}

export function getGoogleLoginUrl(): string {
  return `${API_URL}/auth/google`;
}
