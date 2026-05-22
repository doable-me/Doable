"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  apiLogin,
  apiRegister,
  apiLogout,
  apiGetMe,
  apiMfaLoginVerify,
  storeTokens,
  clearTokens,
  getStoredTokens,
  refreshAccessToken,
  isMfaChallenge,
  isPendingSignup,
} from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isPlatformAdmin?: boolean;
  platformRole?: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  displayName?: string;
}

/**
 * Outcome of `login`. Returns `{ mfaRequired: true, mfaToken }` when the
 * user has opted into MFA, so callers can render the challenge step
 * without prematurely treating the user as signed-in.
 */
export type LoginResult =
  | { mfaRequired: false }
  | { mfaRequired: true; mfaToken: string; expiresIn: number };

/**
 * Outcome of `register`. When signup approvals are enabled, the API
 * returns `{ pending: true, message }` instead of issuing tokens; the
 * signup page must render the message instead of redirecting.
 */
export type RegisterResult =
  | { pending: false }
  | { pending: true; message: string };

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginData) => Promise<LoginResult>;
  completeMfaLogin: (args: { mfaToken: string; code: string }) => Promise<void>;
  register: (data: RegisterData) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  loginAsDemo: () => void;
  /** Re-fetch the current user from /auth/me (used after OAuth callback) */
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helpers ──────────────────────────────────────────────────

const DEMO_USER: AuthUser = {
  id: "demo-user-1",
  email: "demo@doable.dev",
  displayName: "Demo User",
  avatarUrl: null,
};

const USER_STORAGE_KEY = "doable_auth_user";

function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function storeUser(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

function toAuthUser(apiUser: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isPlatformAdmin?: boolean;
  platformRole?: string;
}): AuthUser {
  return {
    id: apiUser.id,
    email: apiUser.email,
    displayName: apiUser.displayName ?? apiUser.email.split("@")[0] ?? apiUser.email,
    avatarUrl: apiUser.avatarUrl,
    isPlatformAdmin: apiUser.isPlatformAdmin ?? false,
    platformRole: apiUser.platformRole ?? "member",
  };
}

// ─── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  // Plain initial state: always `true`, then the mount effect below flips
  // to false once /auth/me resolves. R15's "optimistic init that reads
  // localStorage when window exists" caused a React 19 hydration mismatch
  // because SSR rendered the AuthGuard Loading fallback while the client
  // skipped straight to children — the resulting `Hydration failed`
  // exception forced a full client re-render, which cascaded into stale
  // workspace data being used elsewhere on the page (e.g. sidebar showing
  // the plan-tier project limit instead of the per-workspace admin
  // override). The R16 `allowedDevOrigins` fix is what actually keeps the
  // mount effect firing reliably; this `useState(true)` is the
  // SSR/CSR-consistent partner to that.
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const { accessToken } = getStoredTokens();

    if (!accessToken) {
      setUser(null);
      storeUser(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    apiGetMe()
      .then((res) => {
        if (cancelled) return;
        const authUser = toAuthUser(res.user);
        setUser(authUser);
        storeUser(authUser);
      })
      .catch(() => {
        if (cancelled) return;
        setUser(null);
        storeUser(null);
        clearTokens();
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep localStorage tokens fresh by proactively refreshing ~2min before
  // expiry. Without this, idle sessions leave a stale access token in
  // localStorage until the next apiFetch triggers a 401 retry — breaking
  // new tabs and any external/integration script that reads localStorage
  // to get "the current token".
  useEffect(() => {
    if (!user || user.id === "demo-user-1") return;
    // Access token TTL is 15 min — refresh every 13 min so there's always
    // a fresh window; the server-side 401 retry is still a safety net.
    const intervalMs = 13 * 60 * 1000;
    const id = setInterval(() => {
      void refreshAccessToken();
    }, intervalMs);

    // When the user returns to the tab after being away (browser throttles
    // setInterval in background tabs), refresh immediately so they don't
    // hit a stale/expired access token.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshAccessToken();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);

  const login = useCallback(async (data: LoginData): Promise<LoginResult> => {
    const res = await apiLogin(data);
    if (isMfaChallenge(res)) {
      // Don't set user yet — the caller must render the MFA challenge
      // step and call completeMfaLogin to finish signing in.
      return { mfaRequired: true, mfaToken: res.mfaToken, expiresIn: res.expiresIn };
    }
    const authUser = toAuthUser(res.user);
    setUser(authUser);
    storeUser(authUser);
    return { mfaRequired: false };
  }, []);

  const completeMfaLogin = useCallback(async (args: { mfaToken: string; code: string }) => {
    const res = await apiMfaLoginVerify(args);
    const authUser = toAuthUser(res.user);
    setUser(authUser);
    storeUser(authUser);
  }, []);

  const register = useCallback(async (data: RegisterData): Promise<RegisterResult> => {
    const res = await apiRegister(data);
    if (isPendingSignup(res)) {
      // Approvals are on — no tokens issued, no user state. Caller shows
      // the message and stops at the signup page.
      return { pending: true, message: res.message };
    }
    const authUser = toAuthUser(res.user);
    setUser(authUser);
    storeUser(authUser);
    return { pending: false };
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // Even if the server call fails, clear local state
    }
    setUser(null);
    storeUser(null);
  }, []);

  const loginAsDemo = useCallback(() => {
    // Demo mode — store a fake token so AuthGuard sees it
    storeTokens({
      accessToken: "demo-token",
      refreshToken: "demo-refresh-token",
      expiresIn: 86400,
    });
    setUser(DEMO_USER);
    storeUser(DEMO_USER);
  }, []);

  const refreshUser = useCallback(async () => {
    const { accessToken } = getStoredTokens();
    if (!accessToken) return;

    try {
      const res = await apiGetMe();
      const authUser = toAuthUser(res.user);
      setUser(authUser);
      storeUser(authUser);
    } catch {
      // If /auth/me fails, tokens may be invalid
      setUser(null);
      storeUser(null);
      clearTokens();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      completeMfaLogin,
      register,
      logout,
      loginAsDemo,
      refreshUser,
    }),
    [user, isLoading, login, completeMfaLogin, register, logout, loginAsDemo, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
