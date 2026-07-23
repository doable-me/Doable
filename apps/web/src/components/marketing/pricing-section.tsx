"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type PublicPlan = {
  id: string;
  name: string;
  description: string;
  priceMonthly: number | null;
  priceYearly: number | null;
  contactSales?: boolean;
  features: string[];
};

type Interval = "monthly" | "yearly";

function planCtaHref(planId: string, interval: Interval): string {
  if (planId === "free") return "/signup";
  if (planId === "enterprise") return "/contact";
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("doable_access_token")
      : null;
  // Logged-in users go straight to billing Checkout; visitors sign up first.
  if (token) {
    return `/billing?plan=${encodeURIComponent(planId)}&interval=${interval}`;
  }
  return `/signup?plan=${encodeURIComponent(planId)}&interval=${interval}`;
}

function planCtaLabel(plan: PublicPlan): string {
  if (plan.id === "free") return "Start free";
  if (plan.contactSales || plan.id === "enterprise") return "Contact sales";
  return `Get ${plan.name}`;
}

export function MarketingPricingSection() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<Interval>("monthly");

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/billing/plans`)
      .then((r) => r.json())
      .then((res) => {
        if (!cancelled) setPlans(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setPlans([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="pricing" className="relative z-10 border-t border-white/5 py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple pricing
          </h2>
          <p className="mt-3 text-gray-400">
            Start free. Upgrade when you need more credits, projects, and team
            seats. Payments run through Stripe Checkout on Appbrics billing.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex rounded-full border border-white/10 bg-[#0c1520] p-1">
            {(["monthly", "yearly"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setInterval(opt)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  interval === opt
                    ? "bg-white text-black"
                    : "text-gray-400 hover:text-white",
                )}
              >
                {opt === "monthly" ? "Monthly" : "Yearly · save ~20%"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="mt-16 flex justify-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="mt-12 grid gap-6 lg:grid-cols-4">
            {plans.map((plan) => {
              const highlighted = plan.id === "pro";
              const price =
                interval === "yearly" ? plan.priceYearly : plan.priceMonthly;
              const perLabel =
                interval === "yearly" && price != null && price > 0
                  ? "/yr"
                  : price != null && price > 0
                    ? "/mo"
                    : "";

              return (
                <div
                  key={plan.id}
                  className={cn(
                    "flex flex-col rounded-2xl border p-6",
                    highlighted
                      ? "border-brand-400/50 bg-brand-950/40 shadow-lg shadow-brand-900/20"
                      : "border-white/10 bg-[#0c1520]",
                  )}
                >
                  {highlighted && (
                    <span className="mb-3 w-fit rounded-full bg-brand-500/20 px-2.5 py-0.5 text-xs font-medium text-brand-300">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-1 min-h-[40px] text-sm text-gray-400">
                    {plan.description}
                  </p>
                  <div className="mt-4 flex items-baseline gap-1">
                    {plan.contactSales || price == null ? (
                      <span className="text-3xl font-bold">Custom</span>
                    ) : (
                      <>
                        <span className="text-3xl font-bold">
                          {price === 0 ? "$0" : `$${price}`}
                        </span>
                        {perLabel && (
                          <span className="text-sm text-gray-500">{perLabel}</span>
                        )}
                      </>
                    )}
                  </div>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm text-gray-300"
                      >
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className={cn(
                      "mt-8 h-11 w-full rounded-full text-sm font-semibold",
                      highlighted
                        ? "bg-brand-500 text-white hover:bg-brand-400"
                        : "bg-white text-black hover:bg-gray-200",
                    )}
                  >
                    <Link href={planCtaHref(plan.id, interval)}>
                      {planCtaLabel(plan)}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
