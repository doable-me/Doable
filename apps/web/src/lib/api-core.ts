import type {
  AuthResponse,
  AuthTokens,
  RefreshTokenRequest,
  ApiErrorResponse,
} from "@doable/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// ─── Token Storage ─────────────────────────────────────────

const TOKEN_KEY = "doable_access_token";
const REFRESH_KEY = "doable_refresh_token";

// BUG-ADMIN-009: server-side rendering can't read localStorage, so the
// previous client-only auth left protected pages like /admin serving HTML to
// any visitor. We additionally mirror the access token to a non-HttpOnly
// cookie so Next.js middleware can gate SSR before any admin markup ships.
// The cookie is non-HttpOnly because the same JS that owns localStorage owns
// the cookie — there's no XSS hardening loss vs. the existing setup, and we
// can't use HttpOnly without a server-side login route. Path=/ + SameSite=Lax
// keeps it scoped to the app and avoids CSRF on cross-site GET.
function mirrorTokenCookie(value: string | null): void {
  if (typeof document === "undefined") return;
  if (value) {
    // 7 days to match refresh-token longevity; middleware re-verifies anyway.
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=604800; SameSite=Lax`;
  } else {
    document.cookie = `${TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
}

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
  mirrorTokenCookie(tokens.accessToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  mirrorTokenCookie(null);
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

/**
 * Swap the stored refresh token for a fresh access+refresh pair.
 * Writes the new pair to localStorage so any other tab, external script,
 * or next apiFetch call reads the up-to-date value. Returns null if no
 * refresh token is stored or the server rejects the swap.
 *
 * Deduped globally: concurrent calls (proactive interval + 401 retry)
 * share a single in-flight request to avoid rotating the same token twice.
 */
export async function refreshAccessToken(): Promise<AuthTokens | null> {
  // Deduplicate: if a refresh is already in-flight, piggyback on it.
  if (refreshPromise) return refreshPromise;

  const { refreshToken } = getStoredTokens();
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken } satisfies RefreshTokenRequest),
      });

      if (!res.ok) {
        // Only clear tokens on definitive rejection (token revoked/invalid).
        // 5xx or other transient errors should NOT destroy the session.
        if (res.status === 401 || res.status === 403) {
          clearTokens();
        }
        return null;
      }

      const data = (await res.json()) as AuthResponse;
      storeTokens(data.tokens);
      return data.tokens;
    } catch {
      // Network error (offline, timeout, Cloudflare hiccup) — do NOT
      // clear tokens. The next request will retry the refresh.
      return null;
    }
  })();

  refreshPromise.finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
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
    const newTokens = await refreshAccessToken();
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
