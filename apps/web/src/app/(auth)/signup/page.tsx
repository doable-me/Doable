"use client";

import { useState, useEffect, useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { getGitHubLoginUrl, getGoogleLoginUrl } from "@/lib/api";
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react";

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score, label: "Fair", color: "bg-orange-500" };
  if (score <= 3) return { score, label: "Good", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-green-500" };
}

function getPasswordCriteria(password: string) {
  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    { label: "Uppercase letter", met: /[A-Z]/.test(password) },
    { label: "Lowercase letter", met: /[a-z]/.test(password) },
    { label: "Number", met: /\d/.test(password) },
    { label: "Special character", met: /[^a-zA-Z0-9]/.test(password) },
  ];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function SignupPage() {
  const router = useRouter();
  const { register, isAuthenticated, isLoading: authLoading } = useAuth();

  // Redirect to dashboard if already signed in
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<
    "github" | "google" | null
  >(null);
  const [emailTouched, setEmailTouched] = useState(false);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const criteria = useMemo(() => getPasswordCriteria(password), [password]);
  const emailValid = useMemo(() => isValidEmail(email), [email]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (strength.score < 2) {
      setError(
        "Password is too weak. Use at least 8 characters with uppercase, lowercase, and numbers."
      );
      return;
    }

    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setIsLoading(true);

    try {
      await register({
        email,
        password,
        displayName: displayName || undefined,
      });
      router.push("/dashboard");
    } catch (err: unknown) {
      if (err && typeof err === "object" && "body" in err) {
        const apiErr = err as { body: { error: string } };
        setError(apiErr.body.error);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleOAuth(provider: "github" | "google") {
    setIsOAuthLoading(provider);
    setError(null);
    window.location.href =
      provider === "github" ? getGitHubLoginUrl() : getGoogleLoginUrl();
  }

  const isFormDisabled = isLoading || isOAuthLoading !== null;

  return (
    <>
      <h2 className="mb-6 text-center text-xl font-semibold text-[hsl(var(--foreground))]">
        Create your account
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
            Or sign up with email
          </span>
        </div>
      </div>

      {/* Registration Form */}
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
          <Label htmlFor="displayName">Name (optional)</Label>
          <Input
            id="displayName"
            type="text"
            placeholder="Your name"
            autoComplete="name"
            disabled={isFormDisabled}
            className="rounded-xl"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={isFormDisabled}
            className={`rounded-xl ${
              emailTouched && email.length > 0 && !emailValid
                ? "border-red-500 focus-visible:ring-red-500"
                : ""
            }`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
          />
          {emailTouched && email.length > 0 && !emailValid && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Please enter a valid email address
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              minLength={8}
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
          {password.length > 0 && (
            <div className="space-y-2">
              {/* Strength bar */}
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        level <= strength.score
                          ? strength.color
                          : "bg-[hsl(var(--muted))]"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Password strength: {strength.label}
                </p>
              </div>
              {/* Criteria checklist */}
              <div className="space-y-1">
                {criteria.map((c) => (
                  <div
                    key={c.label}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    {c.met ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <X className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                    )}
                    <span
                      className={
                        c.met
                          ? "text-green-600 dark:text-green-400"
                          : "text-[hsl(var(--muted-foreground))]"
                      }
                    >
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              required
              disabled={isFormDisabled}
              className="rounded-xl pr-10"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={
                showConfirmPassword ? "Hide password" : "Show password"
              }
            >
              {showConfirmPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          {confirmPassword.length > 0 && confirmPassword !== password && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Passwords do not match
            </p>
          )}
          {confirmPassword.length > 0 && confirmPassword === password && (
            <p className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
              <Check className="h-3 w-3" />
              Passwords match
            </p>
          )}
        </div>

        {/* Terms of Service */}
        <div className="flex items-start gap-2">
          <input
            id="terms"
            type="checkbox"
            checked={agreedToTerms}
            onChange={(e) => setAgreedToTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[hsl(var(--border))] bg-transparent text-brand-700 focus:ring-brand-700 focus:ring-offset-0"
          />
          <label
            htmlFor="terms"
            className="text-sm text-[hsl(var(--muted-foreground))] select-none cursor-pointer leading-snug"
          >
            I agree to the{" "}
            <a
              href="/terms"
              className="font-medium text-brand-700 hover:underline"
              target="_blank"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="/privacy"
              className="font-medium text-brand-700 hover:underline"
              target="_blank"
            >
              Privacy Policy
            </a>
          </label>
        </div>

        <Button
          type="submit"
          className="w-full rounded-xl bg-brand-700 text-white hover:bg-brand-800"
          disabled={isFormDisabled || !agreedToTerms}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating account...
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-brand-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
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
