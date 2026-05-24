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
    public body: ApiErrorResponse,
    public retryAfter?: number
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
  // Deduplicate: if a refresh is already in-flight in THIS tab, piggyback.
  if (refreshPromise) return refreshPromise;

  // The token we intend to rotate, captured before we (possibly) wait on the
  // cross-tab lock. If a peer rotates it while we wait, we adopt theirs.
  const tokenAtCall = getStoredTokens().refreshToken;
  if (!tokenAtCall) return null;

  const doRefresh = async (): Promise<AuthTokens | null> => {
    // Re-read inside the critical section. A peer tab that held the lock
    // before us may have already rotated the token; replaying our now-stale
    // token would 401 and (pre-fix) call clearTokens() → log every tab out.
    const current = getStoredTokens();
    if (!current.refreshToken) return null;
    if (current.refreshToken !== tokenAtCall) {
      // A peer already refreshed — adopt the fresh pair, don't rotate again.
      return current.accessToken
        ? { accessToken: current.accessToken, refreshToken: current.refreshToken, expiresIn: 0 }
        : null;
    }

    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: current.refreshToken } satisfies RefreshTokenRequest),
      });

      if (!res.ok) {
        // Only clear on definitive rejection — but first distinguish a benign
        // rotation race from a real revocation: if the stored token changed
        // while our request was in flight, a peer tab rotated it out from
        // under us. Adopt the fresh pair instead of destroying the session.
        if (res.status === 401 || res.status === 403) {
          const latest = getStoredTokens();
          if (latest.refreshToken && latest.refreshToken !== current.refreshToken) {
            return latest.accessToken
              ? { accessToken: latest.accessToken, refreshToken: latest.refreshToken, expiresIn: 0 }
              : null;
          }
          clearTokens();
        }
        // 5xx or other transient errors should NOT destroy the session.
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
  };

  refreshPromise = (async () => {
    // Serialize refresh ACROSS browser tabs. Without this, two tabs sharing
    // the same localStorage refresh token both POST /auth/refresh; the server
    // rotates (deletes old row, inserts new) on the first, so the second hits
    // a now-deleted row → 401 → both tabs logged out. The Web Locks API
    // guarantees only one tab runs doRefresh at a time; the others then see
    // the already-rotated token and adopt it. Degrades gracefully where
    // navigator.locks is unavailable (the in-flight peer check still applies).
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request) {
      return locks.request("doable-token-refresh", doRefresh);
    }
    return doRefresh();
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
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfter = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
    throw new ApiError(res.status, body, retryAfter);
  }

  return res.json() as Promise<T>;
}
