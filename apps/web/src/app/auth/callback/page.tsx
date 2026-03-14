"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeTokens, apiGetMe } from "@/lib/api";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    // Prevent double-processing in React strict mode
    if (processed.current) return;
    processed.current = true;

    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");
    const error = searchParams.get("error");

    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!accessToken || !refreshToken) {
      router.replace("/login?error=missing_tokens");
      return;
    }

    // Store the tokens from the OAuth callback
    storeTokens({
      accessToken,
      refreshToken,
      expiresIn: 3600, // Default; the real expiry is in the JWT
    });

    // Fetch user data to populate localStorage cache so the AuthProvider
    // picks up the user immediately on the next page
    apiGetMe()
      .then((res) => {
        const user = {
          id: res.user.id,
          email: res.user.email,
          displayName: res.user.displayName ?? res.user.email.split("@")[0] ?? res.user.email,
          avatarUrl: res.user.avatarUrl,
        };
        localStorage.setItem("doable_auth_user", JSON.stringify(user));
        router.replace("/dashboard");
      })
      .catch(() => {
        // If /auth/me fails, try decoding the JWT as a fallback
        try {
          const jwtBody = accessToken.split(".")[1];
          if (!jwtBody) throw new Error("Invalid JWT");
          const payload = JSON.parse(atob(jwtBody));
          const user = {
            id: payload.sub,
            email: payload.email ?? "",
            displayName: payload.email?.split("@")[0] ?? "User",
            avatarUrl: null,
          };
          localStorage.setItem("doable_auth_user", JSON.stringify(user));
        } catch {
          // If JWT decode also fails, the AuthProvider will call /auth/me on mount
        }
        router.replace("/dashboard");
      });
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-purple-500" />
        <p className="text-sm text-gray-400">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-purple-500" />
            <p className="text-sm text-gray-400">Signing you in...</p>
          </div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
