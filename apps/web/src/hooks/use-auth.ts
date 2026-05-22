"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/providers/auth-provider";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Return a no-op fallback so pages don't crash outside AuthProvider
    return {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: async () => ({ mfaRequired: false as const }),
      completeMfaLogin: async () => {},
      register: async () => ({ pending: false as const }),
      logout: async () => {},
      loginAsDemo: () => {},
      refreshUser: async () => {},
    };
  }
  return ctx;
}
