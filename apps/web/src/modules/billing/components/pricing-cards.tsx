"use client";

import { useState } from "react";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "../hooks/use-billing";

interface PricingCardsProps {
  plans: Plan[];
  currentPlan?: string;
  onSelect: (planId: string, interval: "monthly" | "yearly") => void;
  loading?: boolean;
}

export function PricingCards({
  plans,
  currentPlan = "free",
  onSelect,
  loading,
}: PricingCardsProps) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");

  return (
    <div className="space-y-6">
      {/* Interval Toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/80 p-1">
          <button
            onClick={() => setInterval("monthly")}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-all",
              interval === "monthly"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("yearly")}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-all",
              interval === "yearly"
                ? "bg-orange-600 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Yearly
            <span className="ml-1.5 rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isPopular = plan.id === "pro";
          const price =
            interval === "yearly" ? plan.priceYearly / 12 : plan.priceMonthly;

          return (
            <div
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-xl border p-6 transition-all",
                isPopular
                  ? "border-orange-500/50 bg-orange-500/5 shadow-lg shadow-orange-500/10"
                  : "border-zinc-800 bg-zinc-900/50",
                isCurrent && "ring-1 ring-orange-500/30"
              )}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <div className="inline-flex items-center gap-1 rounded-full bg-orange-600 px-3 py-1 text-xs font-medium text-white shadow-sm">
                    <Sparkles className="h-3 w-3" />
                    Most Popular
                  </div>
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-white">
                  ${Math.round(price)}
                </span>
                {plan.priceMonthly > 0 && (
                  <span className="text-zinc-500">/mo</span>
                )}
                {interval === "yearly" && plan.priceYearly > 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Billed ${plan.priceYearly}/year
                  </p>
                )}
                {plan.priceMonthly === 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Free forever
                  </p>
                )}
              </div>

              <ul className="mb-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
                    <span className="text-zinc-300">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onSelect(plan.id, interval)}
                disabled={isCurrent || loading || plan.id === "free"}
                className={cn(
                  "w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isPopular
                    ? "bg-orange-600 text-white hover:bg-orange-500 shadow-sm"
                    : "border border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white"
                )}
              >
                {loading ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : isCurrent ? (
                  "Current Plan"
                ) : plan.id === "free" ? (
                  "Free Forever"
                ) : (
                  `Upgrade to ${plan.name}`
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
