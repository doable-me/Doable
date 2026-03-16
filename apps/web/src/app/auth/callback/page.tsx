"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeTokens, apiGetMe } from "@/lib/api";

const ERROR_MESSAGES: Record<string, string> = {
  missing_tokens: "Authentication tokens were missing from the response.",
  oauth_failed: "OAuth authentication failed. Please try again.",
  access_denied: "Access was denied by the provider.",
  missing_code: "Authorization code was missing.",
  no_email: "No email address is associated with your account.",
};

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Verifying your identity...");

  useEffect(() => {
    // Prevent double-processing in React strict mode
    if (processed.current) return;
    processed.current = true;

    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(
        ERROR_MESSAGES[errorParam] ?? `Authentication error: ${errorParam}`
      );
      return;
    }

    if (!accessToken || !refreshToken) {
      setError(ERROR_MESSAGES.missing_tokens ?? "Authentication tokens were missing.");
      return;
    }

    // Store the tokens from the OAuth callback
    storeTokens({
      accessToken,
      refreshToken,
      expiresIn: 3600, // Default; the real expiry is in the JWT
    });

    setStatus("Loading your account...");

    // Fetch user data to populate localStorage cache so the AuthProvider
    // picks up the user immediately on the next page
    apiGetMe()
      .then((res) => {
        const user = {
          id: res.user.id,
          email: res.user.email,
          displayName:
            res.user.displayName ??
            res.user.email.split("@")[0] ??
            res.user.email,
          avatarUrl: res.user.avatarUrl,
        };
        localStorage.setItem("doable_auth_user", JSON.stringify(user));
        setStatus("Redirecting to dashboard...");
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
        setStatus("Redirecting to dashboard...");
        router.replace("/dashboard");
      });
  }, [router, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
        <div className="w-full max-w-sm text-center px-4">
          {/* Error icon */}
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg
              className="h-7 w-7 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          <h2 className="mb-2 text-lg font-semibold text-[hsl(var(--foreground))]">
            Authentication Failed
          </h2>
          <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
            {error}
          </p>

          <div className="space-y-3">
            <button
              onClick={() => router.replace("/login")}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[hsl(263,70%,50%)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[hsl(263,70%,45%)] transition-colors"
            >
              Back to sign in
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[hsl(var(--border))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
      <div className="text-center">
        {/* Animated logo */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-zinc-700 border-t-[hsl(263,70%,50%)] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-[hsl(263,70%,50%)]">
                D
              </span>
            </div>
          </div>
        </div>

        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          {status}
        </p>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          This should only take a moment
        </p>

        {/* Progress dots */}
        <div className="mt-6 flex justify-center gap-1.5">
          <div
            className="h-1.5 w-1.5 rounded-full bg-[hsl(263,70%,50%)] animate-pulse"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="h-1.5 w-1.5 rounded-full bg-[hsl(263,70%,50%)] animate-pulse"
            style={{ animationDelay: "300ms" }}
          />
          <div
            className="h-1.5 w-1.5 rounded-full bg-[hsl(263,70%,50%)] animate-pulse"
            style={{ animationDelay: "600ms" }}
          />
        </div>
      </div>
    </div>
  );
}

function CallbackFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-2 border-zinc-700 border-t-[hsl(263,70%,50%)] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-[hsl(263,70%,50%)]">
                D
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          Preparing authentication...
        </p>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          This should only take a moment
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<CallbackFallback />}>
      <CallbackHandler />
    </Suspense>
  );
}
