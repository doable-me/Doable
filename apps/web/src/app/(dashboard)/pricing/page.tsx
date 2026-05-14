"use client";

import { useRouter } from "next/navigation";
import { Check, X, Zap } from "lucide-react";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for exploring and personal projects.",
    highlighted: false,
    features: [
      { label: "3 projects", ok: true },
      { label: "1 workspace member", ok: true },
      { label: "5 AI credits / day", ok: true },
      { label: "5 MB max file size", ok: true },
      { label: "Custom domains", ok: false },
      { label: "Analytics dashboard", ok: false },
      { label: "Priority support", ok: false },
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$19",
    period: "/ month",
    description: "For creators and small teams who want to ship faster.",
    highlighted: true,
    features: [
      { label: "25 projects", ok: true },
      { label: "5 workspace members", ok: true },
      { label: "50 AI credits / day + 500 / month", ok: true },
      { label: "25 MB max file size", ok: true },
      { label: "Custom domains", ok: true },
      { label: "Analytics dashboard", ok: true },
      { label: "Priority support", ok: false },
    ],
  },
  {
    key: "business",
    name: "Business",
    price: "$79",
    period: "/ month",
    description: "For growing teams that need scale and advanced controls.",
    highlighted: false,
    features: [
      { label: "100 projects", ok: true },
      { label: "25 workspace members", ok: true },
      { label: "200 AI credits / day + 3,000 / month", ok: true },
      { label: "100 MB max file size", ok: true },
      { label: "Custom domains", ok: true },
      { label: "Analytics dashboard", ok: true },
      { label: "Priority support", ok: true },
    ],
  },
];

export default function PricingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-foreground mb-4">Simple, transparent pricing</h1>
          <p className="text-lg text-muted-foreground">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
              return (
              <div
                key={plan.key}
                className={`rounded-2xl border p-8 flex flex-col gap-6 ${
                  plan.highlighted
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-950/20 shadow-lg"
                    : "border-border bg-card"
                }`}
              >
                {plan.highlighted && (
                  <div className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400 text-xs font-semibold uppercase tracking-wide">
                    <Zap className="h-3.5 w-3.5" />
                    Most popular
                  </div>
                )}

                <div>
                  <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>

                <ul className="flex flex-col gap-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.label} className="flex items-start gap-2.5 text-sm">
                      {f.ok ? (
                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground/40 mt-0.5 shrink-0" />
                      )}
                      <span className={f.ok ? "text-foreground" : "text-muted-foreground/50"}>
                        {f.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => router.push("/billing")}
                  className={`w-full rounded-lg py-2.5 text-sm font-medium transition-colors ${
                    plan.highlighted
                      ? "bg-brand-600 text-white hover:bg-brand-500"
                      : "border border-border bg-secondary text-foreground hover:bg-accent"
                  }`}
                >
                  {plan.key === "free" ? "Get started" : "Upgrade"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          Need more? <a href="mailto:hello@doable.me" className="underline hover:text-foreground">Contact us</a> for Enterprise pricing.
        </p>
      </div>
    </div>
  );
}
