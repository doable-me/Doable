"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setInterval("monthly")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            interval === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Monthly
        </button>
        <button
          onClick={() => setInterval("yearly")}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition-colors",
            interval === "yearly"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Yearly
          <span className="ml-1.5 text-xs text-green-600 dark:text-green-400">
            Save 20%
          </span>
        </button>
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
                "relative flex flex-col rounded-xl border p-6",
                isPopular && "border-primary shadow-lg",
                isCurrent && "bg-muted/50"
              )}
            >
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Most Popular
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold">
                  ${Math.round(price)}
                </span>
                {plan.priceMonthly > 0 && (
                  <span className="text-muted-foreground">/mo</span>
                )}
                {interval === "yearly" && plan.priceYearly > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Billed ${plan.priceYearly}/year
                  </p>
                )}
              </div>

              <ul className="mb-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onSelect(plan.id, interval)}
                disabled={isCurrent || loading || plan.id === "free"}
                className={cn(
                  "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isPopular
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                )}
              >
                {isCurrent
                  ? "Current Plan"
                  : plan.id === "free"
                    ? "Free Forever"
                    : `Upgrade to ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
