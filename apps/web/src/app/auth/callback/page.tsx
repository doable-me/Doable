"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeTokens, apiGetMe } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

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
  const { completeMfaLogin } = useAuth();
  const processed = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Verifying your identity...");

  // MFA challenge state for OAuth users who have MFA enabled.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaRedirect, setMfaRedirect] = useState<string>("/dashboard");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  useEffect(() => {
    // Prevent double-processing in React strict mode
    if (processed.current) return;
    processed.current = true;

    // Read tokens from URL fragment (preferred, secure — not sent to servers)
    // or fall back to query params for backward compatibility.
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    let mfaToken: string | null = null;
    let errorParam: string | null = null;
    let returnTo: string | null = null;

    const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (hash) {
      const fragmentParams = new URLSearchParams(hash);
      accessToken = fragmentParams.get("accessToken");
      refreshToken = fragmentParams.get("refreshToken");
      mfaToken = fragmentParams.get("mfaToken");
      returnTo = fragmentParams.get("returnTo");
      // Clear fragment immediately so tokens don't linger in the URL bar
      if (accessToken || mfaToken) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    // OAuth user has MFA enabled — render the challenge UI inline. The
    // mfaToken is purpose-locked and expires in 5 minutes, so it's safe
    // to keep in component state for the duration of this page.
    if (mfaToken) {
      const safeReturn =
        returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
          ? returnTo
          : "/dashboard";
      setMfaToken(mfaToken);
      setMfaRedirect(safeReturn);
      return;
    }

    // Fallback: query params (legacy, less secure)
    if (!accessToken) {
      accessToken = searchParams.get("accessToken");
      refreshToken = searchParams.get("refreshToken");
    }
    if (!returnTo) returnTo = searchParams.get("returnTo");
    errorParam = searchParams.get("error");

    // Validate returnTo is a safe same-origin path
    const safeReturnTo =
      returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : null;
    const redirectTarget = safeReturnTo ?? "/dashboard";

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
        setStatus(safeReturnTo ? "Redirecting..." : "Redirecting to dashboard...");
        router.replace(redirectTarget);
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
        setStatus(safeReturnTo ? "Redirecting..." : "Redirecting to dashboard...");
        router.replace(redirectTarget);
      });
  }, [router, searchParams]);

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setMfaSubmitting(true);
    setMfaError(null);
    try {
      await completeMfaLogin({ mfaToken, code: mfaCode });
      router.replace(mfaRedirect);
    } catch (err: unknown) {
      let msg = "Verification failed. Please try again.";
      if (err && typeof err === "object" && "body" in err) {
        const apiErr = err as { body: { error: string } };
        msg = apiErr.body.error;
        if (msg.toLowerCase().includes("expired")) {
          // Force the user back to /login so they can re-authenticate.
          router.replace("/login?error=mfa_expired");
          return;
        }
      }
      setMfaError(msg);
    } finally {
      setMfaSubmitting(false);
    }
  }

  if (mfaToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
        <div className="w-full max-w-sm px-4">
          <h2 className="mb-2 text-center text-xl font-semibold text-[hsl(var(--foreground))]">
            Two-factor authentication
          </h2>
          <p className="mb-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Enter the 6-digit code from your authenticator app, or a recovery code.
          </p>

          <form onSubmit={handleMfaSubmit} className="space-y-4">
            {mfaError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.75a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0v-3zM8 11a1 1 0 110 2 1 1 0 010-2z" />
                </svg>
                <span>{mfaError}</span>
              </div>
            )}
            <input
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456 or recovery-code"
              required
              disabled={mfaSubmitting}
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2.5 text-center tracking-widest text-[hsl(var(--foreground))] focus:border-brand-600 focus:outline-none"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />
            <button
              type="submit"
              disabled={mfaSubmitting || mfaCode.length < 6}
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60 transition-colors"
            >
              {mfaSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify and continue"
              )}
            </button>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="block w-full text-center text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            >
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

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
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-800 transition-colors"
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
            <div className="h-12 w-12 rounded-full border-2 border-zinc-700 border-t-brand-700 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-brand-700">
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
            className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-pulse"
            style={{ animationDelay: "0ms" }}
          />
          <div
            className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-pulse"
            style={{ animationDelay: "300ms" }}
          />
          <div
            className="h-1.5 w-1.5 rounded-full bg-brand-700 animate-pulse"
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
            <div className="h-12 w-12 rounded-full border-2 border-zinc-700 border-t-brand-700 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-brand-700">
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
