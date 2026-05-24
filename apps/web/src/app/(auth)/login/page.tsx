"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { getGitHubLoginUrl, getGoogleLoginUrl } from "@/lib/api";
import { Eye, EyeOff, Loader2 } from "lucide-react";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  missing_tokens: "Authentication failed. Please try again.",
  oauth_failed: "OAuth authentication failed. Please try again.",
  access_denied: "Access was denied. Please try again.",
  missing_code: "Authentication code was missing. Please try again.",
  no_email: "No email address associated with your account. Please try again.",
  ACCOUNT_DENIED: "Your signup was not approved.",
};

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, completeMfaLogin, isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect after sign-in (honor returnTo, fall back to dashboard).
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      const params = new URLSearchParams(window.location.search);
      // Honor `returnTo` (OAuth/native flows) and `next` (SSR middleware's
      // loginRedirect writes ?next=, e.g. when an admin's access-token cookie
      // expired) so re-auth returns to the page the user actually wanted.
      const returnTo = params.get("returnTo") ?? params.get("next");
      const urlPrompt = params.get("prompt");
      let target: string;
      if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        target = returnTo;
      } else if (urlPrompt) {
        target = `/dashboard?prompt=${encodeURIComponent(urlPrompt)}`;
      } else {
        target = "/dashboard";
      }
      router.replace(target);
    }
  }, [authLoading, isAuthenticated, router]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<
    "github" | "google" | null
  >(null);

  // MFA challenge state — populated when the API tells us the user has
  // opted into MFA. While set, we render the TOTP/recovery prompt
  // instead of the password form.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  // Surfaced when an unapproved user tries to log in (admin enabled
  // signup approvals and hasn't approved this account yet). Replaces
  // the form entirely with the admin-customized pending message.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  // Restore remembered email
  useEffect(() => {
    if (typeof window === "undefined") return;
    const remembered = localStorage.getItem("doable_remember_email");
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  // Pick up error from OAuth callback redirect, including the pending
  // approval gate (OAuth users hit this via redirect, not the form).
  useEffect(() => {
    const pendingParam = searchParams.get("pending");
    const messageParam = searchParams.get("message");
    if (pendingParam === "1" && messageParam) {
      setPendingMessage(messageParam);
      return;
    }
    const errorParam = searchParams.get("error");
    if (errorParam) {
      const fallback = messageParam ?? `Authentication error: ${errorParam}`;
      setError(OAUTH_ERROR_MESSAGES[errorParam] ?? fallback);
    }
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Handle remember me
    if (rememberMe) {
      localStorage.setItem("doable_remember_email", email);
    } else {
      localStorage.removeItem("doable_remember_email");
    }

    try {
      const result = await login({ email, password });
      if (result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setIsLoading(false);
        return;
      }
      const params = new URLSearchParams(window.location.search);
      // Honor `returnTo` (OAuth/native flows) and `next` (SSR middleware's
      // loginRedirect writes ?next=, e.g. when an admin's access-token cookie
      // expired) so re-auth returns to the page the user actually wanted.
      const returnTo = params.get("returnTo") ?? params.get("next");
      const urlPrompt = params.get("prompt");
      let target: string;
      if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        target = returnTo;
      } else if (urlPrompt) {
        target = `/dashboard?prompt=${encodeURIComponent(urlPrompt)}`;
      } else {
        target = "/dashboard";
      }
      router.push(target);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "body" in err) {
        const apiErr = err as { status?: number; body: { error: string; message?: string }; retryAfter?: number };
        if (apiErr.status === 429) {
          const wait = apiErr.retryAfter ? ` Try again in ${apiErr.retryAfter} seconds.` : "";
          setError(`Too many login attempts.${wait}`);
        } else if (apiErr.body.error === "PENDING_APPROVAL") {
          setPendingMessage(apiErr.body.message ?? "Your signup is awaiting approval.");
        } else if (apiErr.body.error === "ACCOUNT_DENIED") {
          setError(apiErr.body.message ?? "Your signup was not approved.");
        } else {
          setError(apiErr.body.error);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMfaSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    setIsLoading(true);
    try {
      await completeMfaLogin({ mfaToken, code: mfaCode });
      const params = new URLSearchParams(window.location.search);
      // Honor `returnTo` (OAuth/native flows) and `next` (SSR middleware's
      // loginRedirect writes ?next=, e.g. when an admin's access-token cookie
      // expired) so re-auth returns to the page the user actually wanted.
      const returnTo = params.get("returnTo") ?? params.get("next");
      const urlPrompt = params.get("prompt");
      let target: string;
      if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
        target = returnTo;
      } else if (urlPrompt) {
        target = `/dashboard?prompt=${encodeURIComponent(urlPrompt)}`;
      } else {
        target = "/dashboard";
      }
      router.push(target);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "body" in err) {
        const apiErr = err as { body: { error: string } };
        setError(apiErr.body.error);
        // Expired challenge tokens kick the user back to the password step
        if (apiErr.body.error.toLowerCase().includes("expired")) {
          setMfaToken(null);
          setMfaCode("");
        }
      } else {
        setError("Verification failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleOAuth(provider: "github" | "google") {
    setIsOAuthLoading(provider);
    setError(null);
    const params = new URLSearchParams(window.location.search);
    const returnToRaw = params.get("returnTo");
    const returnTo =
      returnToRaw && returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
        ? returnToRaw
        : null;
    window.location.href =
      provider === "github"
        ? getGitHubLoginUrl(returnTo)
        : getGoogleLoginUrl(returnTo);
  }

  const isFormDisabled = isLoading || isOAuthLoading !== null;

  if (pendingMessage) {
    return (
      <>
        <h2 className="mb-3 text-center text-xl font-semibold text-[hsl(var(--foreground))]">
          You&apos;re on the list
        </h2>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 text-sm leading-relaxed text-[hsl(var(--foreground))] whitespace-pre-wrap">
          {pendingMessage}
        </div>
        <button
          type="button"
          onClick={() => { setPendingMessage(null); setError(null); }}
          className="mt-6 block w-full text-center text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
        >
          Back to sign in
        </button>
      </>
    );
  }

  if (mfaToken) {
    return (
      <>
        <h2 className="mb-2 text-center text-xl font-semibold text-[hsl(var(--foreground))]">
          Two-factor authentication
        </h2>
        <p className="mb-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Enter the 6-digit code from your authenticator app, or a recovery code.
        </p>

        <form onSubmit={handleMfaSubmit} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.75a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0v-3zM8 11a1 1 0 110 2 1 1 0 010-2z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="mfaCode">Verification code</Label>
            <Input
              id="mfaCode"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123456 or recovery-code"
              required
              disabled={isLoading}
              className="rounded-xl text-center tracking-widest"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            className="w-full rounded-xl bg-brand-700 text-white hover:bg-brand-800"
            disabled={isLoading || mfaCode.length < 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify and continue"
            )}
          </Button>

          <button
            type="button"
            onClick={() => { setMfaToken(null); setMfaCode(""); setError(null); }}
            className="block w-full text-center text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
          >
            Back to sign in
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-[hsl(var(--foreground))]">
        Sign in to your account
      </h2>

      {/* OAuth Buttons */}
      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full rounded-xl"
          disabled={isFormDisabled}
          onClick={() => handleOAuth("github")}
        >
          {isOAuthLoading === "github" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GitHubIcon className="mr-2 h-4 w-4" />
          )}
          Continue with GitHub
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-xl"
          disabled={isFormDisabled}
          onClick={() => handleOAuth("google")}
        >
          {isOAuthLoading === "google" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <GoogleIcon className="mr-2 h-4 w-4" />
          )}
          Continue with Google
        </Button>
      </div>

      {/* Divider */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-[hsl(var(--border))]" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[hsl(var(--card))] px-2 text-[hsl(var(--muted-foreground))]">
            Or continue with email
          </span>
        </div>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4.75a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0v-3zM8 11a1 1 0 110 2 1 1 0 010-2z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={isFormDisabled}
            className="rounded-xl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              disabled={isFormDisabled}
              className="rounded-xl pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Remember Me */}
        <div className="flex items-center gap-2">
          <input
            id="remember"
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-[hsl(var(--border))] bg-transparent text-brand-700 focus:ring-brand-700 focus:ring-offset-0"
          />
          <label
            htmlFor="remember"
            className="text-sm text-[hsl(var(--muted-foreground))] select-none cursor-pointer"
          >
            Remember me
          </label>
        </div>

        <Button
          type="submit"
          className="w-full rounded-xl bg-brand-700 text-white hover:bg-brand-800"
          disabled={isFormDisabled}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in...
            </>
          ) : (
            "Sign in"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-brand-700 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

// ─── Inline SVG Icons ────────────────────────────────────────

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
