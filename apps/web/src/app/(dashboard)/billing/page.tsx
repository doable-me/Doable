"use client";

import { useSearchParams } from "next/navigation";
import { PricingCards } from "@/modules/billing/components/pricing-cards";
import { CreditDisplay } from "@/modules/billing/components/credit-display";
import {
  usePlans,
  useCredits,
  useUsage,
  useBillingActions,
} from "@/modules/billing/hooks/use-billing";

// TODO: Replace with actual workspace context
const WORKSPACE_ID = undefined;

export default function BillingPage() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  const { plans, loading: plansLoading } = usePlans();
  const { credits, loading: creditsLoading } = useCredits(WORKSPACE_ID);
  const { usage, loading: usageLoading } = useUsage(WORKSPACE_ID);
  const { subscribe, openPortal, topUp, loading: actionLoading } =
    useBillingActions(WORKSPACE_ID);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      {/* Status Messages */}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          Subscription updated successfully.
        </div>
      )}
      {canceled && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
          Checkout was canceled. No changes were made.
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription, credits, and usage.
        </p>
      </div>

      {/* Credits Overview */}
      <CreditDisplay credits={credits} loading={creditsLoading} />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => openPortal()}
          disabled={actionLoading}
          className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          Manage Subscription
        </button>
        <button
          onClick={() => topUp(100)}
          disabled={actionLoading}
          className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          Buy 100 Credits
        </button>
      </div>

      {/* Plans */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Plans</h2>
        {plansLoading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-80 animate-pulse rounded-xl border bg-muted" />
            ))}
          </div>
        ) : (
          <PricingCards
            plans={plans}
            currentPlan="free"
            onSelect={subscribe}
            loading={actionLoading}
          />
        )}
      </section>

      {/* Usage History */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Usage History</h2>
        {usageLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : usage.length === 0 ? (
          <p className="rounded-lg border p-6 text-center text-muted-foreground">
            No usage recorded yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Credits</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="px-4 py-3 capitalize">
                      {entry.action.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{entry.credits_used}</td>
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
