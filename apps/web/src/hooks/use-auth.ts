"use client";

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "@/providers/auth-provider";

/**
 * Hook to access auth state and actions.
 *
 * Must be used inside an <AuthProvider>.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, login, logout } = useAuth();
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }

  return context;
}
