"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { ArrowLeft, CreditCard, Zap, ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { PricingCards } from "@/modules/billing/components/pricing-cards";
import { CreditDisplay } from "@/modules/billing/components/credit-display";
import {
  usePlans,
  useCredits,
  useUsage,
  useBillingActions,
  useCurrentPlan,
} from "@/modules/billing/hooks/use-billing";

function useActiveWorkspaceId(): string | undefined {
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const stored = localStorage.getItem("doable_active_workspace_id");
    if (stored) setWorkspaceId(stored);
  }, []);
  return workspaceId;
}

export default function BillingPage() {
  const router = useRouter();
  const WORKSPACE_ID = useActiveWorkspaceId();
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");
  const topupSuccess = searchParams.get("topup") === "success";

  const { plans, loading: plansLoading } = usePlans();
  const { credits, loading: creditsLoading } = useCredits(WORKSPACE_ID);
  const { usage, loading: usageLoading } = useUsage(WORKSPACE_ID);
  const { subscribe, openPortal, topUp, loading: actionLoading } =
    useBillingActions(WORKSPACE_ID);
  const { plan: currentPlan } = useCurrentPlan(WORKSPACE_ID);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      {/* Back button + Header */}
      <div>
        <button
          onClick={() => router.push("/dashboard")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </button>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-zinc-400">
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

      {/* Credits Overview */}
      <CreditDisplay credits={credits} loading={creditsLoading} />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => openPortal()}
          disabled={actionLoading || !WORKSPACE_ID}
          className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Manage Subscription
        </button>
        <button
          onClick={() => topUp(100)}
          disabled={actionLoading || !WORKSPACE_ID}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Buy 100 Credits
        </button>
      </div>

      {/* Plans */}
      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Plans</h2>
        {plansLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/50" />
            ))}
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-400">Unable to load plans. Please try again later.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-3 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
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
        <h2 className="mb-4 text-xl font-semibold text-white">Usage History</h2>
        {usageLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50" />
            ))}
          </div>
        ) : usage.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
            <p className="text-zinc-500">No usage recorded yet.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Credit usage will appear here once you start using AI features.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Action</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Credits</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Date</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((entry) => (
                  <tr key={entry.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 capitalize text-zinc-200">
                      {entry.action.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-300">{entry.credits_used}</td>
                    <td className="px-4 py-3 text-zinc-500">
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
