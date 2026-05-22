"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiAcceptWorkspaceInvite, ApiError } from "@/lib/api";

type Status = "loading" | "accepting" | "success" | "error" | "needs-auth";

function AcceptInvitePageInner() {
  const params = useParams<{ token: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Support both /invite/<token> and /invite/<anything>?token=<token>
  const token =
    (params?.token && params.token !== "accept" ? params.token : null) ??
    search.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!token) {
      setStatus("error");
      setErrorMessage("This invite link is missing a token.");
      return;
    }

    if (!isAuthenticated) {
      setStatus("needs-auth");
      return;
    }

    let cancelled = false;
    setStatus("accepting");

    apiAcceptWorkspaceInvite(token)
      .then((res) => {
        if (cancelled) return;
        const wsId = res?.data?.member?.workspace_id ?? null;
        setWorkspaceId(wsId);
        setStatus("success");
        // Auto-redirect after a short delay so user sees confirmation.
        setTimeout(() => {
          router.replace("/dashboard");
        }, 1500);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        let message = "This invite is invalid, expired, or already used.";
        if (err instanceof ApiError && err.body && typeof err.body === "object") {
          const body = err.body as { error?: string };
          if (body.error) message = body.error;
        }
        setErrorMessage(message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, token, router]);

  const returnTo = token ? `/invite/${encodeURIComponent(token)}` : "/dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 shadow-sm">
        {(status === "loading" || status === "accepting") && (
          <div className="flex flex-col items-center text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
            <h1 className="mt-4 text-lg font-semibold">
              {status === "accepting" ? "Accepting invite…" : "Loading…"}
            </h1>
          </div>
        )}

        {status === "needs-auth" && (
          <div className="flex flex-col items-center text-center">
            <h1 className="text-xl font-semibold">You're invited to a workspace</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Sign in or create an account to accept this invitation.
            </p>
            <div className="mt-6 flex w-full flex-col gap-2">
              <Button asChild className="w-full">
                <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
                  Sign in
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>
                  Create account
                </Link>
              </Button>
            </div>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <h1 className="mt-4 text-xl font-semibold">Invite accepted!</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              Redirecting you to your dashboard…
            </p>
            <Button
              className="mt-6"
              onClick={() => router.replace(workspaceId ? "/dashboard" : "/dashboard")}
            >
              Go to dashboard
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <h1 className="mt-4 text-xl font-semibold">Couldn't accept invite</h1>
            <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
              {errorMessage}
            </p>
            <Button asChild className="mt-6" variant="outline">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitePageInner />
    </Suspense>
  );
}
