"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User, LoginRequest, RegisterRequest } from "@doable/shared";
import {
  apiLogin,
  apiRegister,
  apiLogout,
  apiGetMe,
  getStoredTokens,
  storeTokens,
  clearTokens,
  type ApiError,
} from "@/lib/api";

type AuthUser = Omit<User, "githubId" | "googleId">;

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Called by the OAuth callback page to set tokens from URL params. */
  setTokensFromOAuth: (accessToken: string, refreshToken: string) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const { accessToken } = getStoredTokens();
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    apiGetMe()
      .then((data) => setUser(data.user))
      .catch(() => {
        clearTokens();
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    const res = await apiLogin(data);
    setUser(res.user);
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    const res = await apiRegister(data);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const setTokensFromOAuth = useCallback(
    (accessToken: string, refreshToken: string) => {
      storeTokens({ accessToken, refreshToken, expiresIn: 900 });
      apiGetMe()
        .then((data) => setUser(data.user))
        .catch(() => clearTokens());
    },
    []
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      setTokensFromOAuth,
    }),
    [user, isLoading, login, register, logout, setTokensFromOAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
