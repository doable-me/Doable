"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  apiLogin,
  apiRegister,
  apiLogout,
  apiGetMe,
  storeTokens,
  clearTokens,
  getStoredTokens,
} from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isPlatformAdmin?: boolean;
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

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
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
}): AuthUser {
  return {
    id: apiUser.id,
    email: apiUser.email,
    displayName: apiUser.displayName ?? apiUser.email.split("@")[0] ?? apiUser.email,
    avatarUrl: apiUser.avatarUrl,
  };
}

// ─── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isLoading, setIsLoading] = useState(true);
  const initialCheckDone = useRef(false);

  // On mount, validate the stored token against /auth/me
  useEffect(() => {
    if (initialCheckDone.current) return;
    initialCheckDone.current = true;

    const { accessToken } = getStoredTokens();

    if (!accessToken) {
      // No token stored — not authenticated
      setUser(null);
      storeUser(null);
      setIsLoading(false);
      return;
    }

    // Validate token by calling /auth/me
    apiGetMe()
      .then((res) => {
        const authUser = toAuthUser(res.user);
        setUser(authUser);
        storeUser(authUser);
      })
      .catch(() => {
        // Token is invalid or expired (refresh also failed)
        setUser(null);
        storeUser(null);
        clearTokens();
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (data: LoginData) => {
    const res = await apiLogin(data);
    const authUser = toAuthUser(res.user);
    setUser(authUser);
    storeUser(authUser);
  }, []);

  const register = useCallback(async (data: RegisterData) => {
    const res = await apiRegister(data);
    const authUser = toAuthUser(res.user);
    setUser(authUser);
    storeUser(authUser);
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
      register,
      logout,
      loginAsDemo,
      refreshUser,
    }),
    [user, isLoading, login, register, logout, loginAsDemo, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
