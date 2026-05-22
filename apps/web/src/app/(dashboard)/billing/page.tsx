"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, Zap, ExternalLink, Loader2, CheckCircle2, XCircle, AlertTriangle, X } from "lucide-react";
import { PricingCards } from "@/modules/billing/components/pricing-cards";
import { CreditDisplay } from "@/modules/billing/components/credit-display";
import {
  usePlans,
  useCredits,
  useUsage,
  useBillingActions,
  useCurrentPlan,
} from "@/modules/billing/hooks/use-billing";
import { apiFetch, type ApiWorkspace } from "@/lib/api";

function useActiveWorkspaceId(): { workspaceId: string | undefined; loading: boolean } {
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolve = async () => {
      // 1. Try localStorage first
      const stored = localStorage.getItem("doable_active_workspace_id");
      if (stored) {
        setWorkspaceId(stored);
        setLoading(false);
        return;
      }

      // 2. Fetch workspaces from API
      try {
        const wsRes = await apiFetch<{ data: ApiWorkspace[] }>("/workspaces");
        if (wsRes.data && wsRes.data.length > 0) {
          const wsId = wsRes.data[0]!.id;
          localStorage.setItem("doable_active_workspace_id", wsId);
          setWorkspaceId(wsId);
          setLoading(false);
          return;
        }

        // 3. No workspaces exist — create one
        const slug = `my-workspace-${Date.now()}`;
        const createRes = await apiFetch<{ data: ApiWorkspace }>("/workspaces", {
          method: "POST",
          body: JSON.stringify({ name: "My Workspace", slug }),
        });
        if (createRes.data?.id) {
          localStorage.setItem("doable_active_workspace_id", createRes.data.id);
          setWorkspaceId(createRes.data.id);
        }
      } catch (err) {
        console.warn("[Billing] Failed to resolve workspace:", err);
      }
      setLoading(false);
    };
    resolve();
  }, []);

  return { workspaceId, loading };
}

export default function BillingPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            <p className="text-sm text-muted-foreground">Loading billing...</p>
          </div>
        </div>
      }
    >
      <BillingPage />
    </Suspense>
  );
}

function BillingPage() {
  const router = useRouter();
  const { workspaceId: WORKSPACE_ID, loading: wsLoading } = useActiveWorkspaceId();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");
  const topupSuccess = searchParams.get("topup") === "success";

  const { plans, loading: plansLoading } = usePlans();
  const { credits, loading: creditsLoading } = useCredits(WORKSPACE_ID);
  const { usage, loading: usageLoading } = useUsage(WORKSPACE_ID);
  const { subscribe, openPortal, topUp, loading: actionLoading, error: actionError, clearError } =
    useBillingActions(WORKSPACE_ID);
  const { plan: currentPlan } = useCurrentPlan(WORKSPACE_ID);

  // Show loading spinner while resolving workspace
  if (wsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-muted-foreground">Loading billing...</p>
        </div>
      </div>
    );
  }

  // Workspace could not be resolved (user likely not signed in)
  if (!WORKSPACE_ID) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-xl border border-border bg-card p-8 text-center max-w-md">
          <p className="text-foreground font-medium">Unable to load billing</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to manage your subscription and credits.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      {/* Back button + Header */}
      <div>
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </button>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription, credits, and usage.
        </p>
      </div>

      {/* Status Messages */}
      {success && (
        <div className="flex items-center gap-3 rounded-lg border border-green-800 bg-green-950/50 p-4 text-sm text-green-300">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
          Subscription updated successfully!
        </div>
      )}
      {canceled && (
        <div className="flex items-center gap-3 rounded-lg border border-yellow-800 bg-yellow-950/50 p-4 text-sm text-yellow-300">
          <XCircle className="h-5 w-5 shrink-0 text-yellow-400" />
          Checkout was canceled. No changes were made.
        </div>
      )}
      {topupSuccess && (
        <div className="flex items-center gap-3 rounded-lg border border-green-800 bg-green-950/50 p-4 text-sm text-green-300">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
          Credits added successfully!
        </div>
      )}
      {actionError && (
        <div className="flex items-center justify-between rounded-lg border border-red-800 bg-red-950/50 p-4 text-sm text-red-300">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
            {actionError}
          </div>
          <button
            onClick={clearError}
            className="shrink-0 rounded p-1 text-red-400 hover:bg-red-900/50 hover:text-red-300 transition-colors"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Credits Overview */}
      <CreditDisplay
        credits={credits}
        loading={creditsLoading}
        onUpgrade={() => {
          const plansSection = document.querySelector("[data-plans-section]");
          plansSection?.scrollIntoView({ behavior: "smooth" });
        }}
      />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => openPortal()}
          disabled={actionLoading || !WORKSPACE_ID}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Manage Subscription
        </button>
        <button
          onClick={() => topUp(100)}
          disabled={actionLoading || !WORKSPACE_ID}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Buy 100 Credits
        </button>
      </div>

      {/* Plans */}
      <section data-plans-section>
        <h2 className="mb-4 text-xl font-semibold text-foreground">Plans</h2>
        {plansLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-xl border border-border bg-card" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">Unable to load plans. Please try again later.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-secondary px-4 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <PricingCards
            plans={plans}
            currentPlan={currentPlan}
            onSelect={subscribe}
            loading={actionLoading}
          />
        )}
      </section>

      {/* Usage History */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-foreground">Usage History</h2>
        {usageLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : usage.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground">No usage recorded yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Credit usage will appear here once you start using AI features.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Credits</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors">
                    <td className="px-4 py-3 capitalize text-foreground">
                      {(entry.action ?? entry.action_type ?? "").replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">{entry.credits_used}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
