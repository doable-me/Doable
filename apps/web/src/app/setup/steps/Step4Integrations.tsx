"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiFetch, apiListWorkspaces } from "@/lib/api";
import { PlanDefaultsInline } from "./PlanDefaultsInline";

type SupabaseConnectionRow = {
  id: string;
  integrationId: string;
  displayName: string | null;
  status: string;
};

interface StepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** When true, the primary button label switches to "Finish setup". */
  isFinalStep?: boolean;
}

type SaveStatus = "idle" | "saving" | "success" | "error";

export function Step4Integrations({ onNext, onBack, onSkip, isFinalStep }: StepProps) {
  // Billing
  const [showBilling, setShowBilling] = useState(false);
  const [stripeSecret, setStripeSecret] = useState("");
  const [stripeWebhook, setStripeWebhook] = useState("");
  const [showStripeKey, setShowStripeKey] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [billingStatus, setBillingStatus] = useState<SaveStatus>("idle");
  const [billingError, setBillingError] = useState<string | null>(null);

  // Signup policy
  const [requireApproval, setRequireApproval] = useState(false);
  const [policyStatus, setPolicyStatus] = useState<SaveStatus>("idle");

  async function saveBilling() {
    if (!stripeSecret.trim() && !stripeWebhook.trim()) return;
    setBillingStatus("saving");
    setBillingError(null);
    try {
      const body: Record<string, string> = {};
      if (stripeSecret.trim()) body.stripeSecretKey = stripeSecret.trim();
      if (stripeWebhook.trim()) body.stripeWebhookSecret = stripeWebhook.trim();
      await apiFetch("/setup/billing", { method: "POST", body: JSON.stringify(body) });
      setBillingStatus("success");
      setStripeSecret("");
      setStripeWebhook("");
    } catch (err) {
      setBillingStatus("error");
      setBillingError(err instanceof Error ? err.message : "Could not save");
    }
  }

  async function savePolicy(next: boolean) {
    setRequireApproval(next);
    setPolicyStatus("saving");
    try {
      await apiFetch("/setup/signup-policy", {
        method: "POST",
        body: JSON.stringify({ requireApproval: next }),
      });
      setPolicyStatus("success");
      setTimeout(() => setPolicyStatus("idle"), 1200);
    } catch {
      setRequireApproval(!next);
      setPolicyStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">Plans &amp; billing</h2>
        <p className="text-sm text-muted-foreground">
          Pick which AI model each plan tier defaults to, then optionally wire up Stripe + signup policy. Everything here can be changed later in /admin.
        </p>
      </div>

      {/* Plan default AI models (R13 US-003 — was previously only reachable from /admin/plans) */}
      <PlanDefaultsInline />

      {/* Signup policy toggle */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Signup approval</p>
            <p className="text-xs text-muted-foreground mt-1">
              When ON, new signups stay pending until an admin approves them in <span className="font-medium text-foreground">/admin/signups</span>.
              When OFF (default), anyone with a valid email can sign up immediately.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireApproval}
            onClick={() => savePolicy(!requireApproval)}
            disabled={policyStatus === "saving"}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
              requireApproval ? "bg-brand-600" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                requireApproval ? "translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
        {policyStatus === "success" && (
          <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
            <Check className="h-3 w-3" /> Saved
          </p>
        )}
        {policyStatus === "error" && (
          <p className="text-xs text-red-400 mt-2">Could not save — try again or use /admin/signups</p>
        )}
      </div>

      {/* Stripe billing — collapsible */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowBilling((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div>
            <p className="text-sm font-medium text-foreground">Stripe (paid plans)</p>
            <p className="text-xs text-muted-foreground mt-1">
              {showBilling
                ? "Paste your Stripe secret + webhook secret to enable Pro and Business plans."
                : "Optional — enable paid Pro/Business plans via Stripe."}
            </p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showBilling && "rotate-180")} />
        </button>

        {showBilling && (
          <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">Stripe secret key</label>
              <div className="relative">
                <input
                  type={showStripeKey ? "text" : "password"}
                  value={stripeSecret}
                  onChange={(e) => { setStripeSecret(e.target.value); setBillingStatus("idle"); }}
                  placeholder="Your Stripe secret"
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                />
                <button
                  type="button"
                  onClick={() => setShowStripeKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showStripeKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-foreground">Webhook signing secret</label>
              <div className="relative">
                <input
                  type={showWebhookSecret ? "text" : "password"}
                  value={stripeWebhook}
                  onChange={(e) => { setStripeWebhook(e.target.value); setBillingStatus("idle"); }}
                  placeholder="Your Stripe webhook signing secret"
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                />
                <button
                  type="button"
                  onClick={() => setShowWebhookSecret((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showWebhookSecret ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {billingStatus === "error" && (
              <p className="text-xs text-red-400">{billingError}</p>
            )}
            {billingStatus === "success" && (
              <p className="text-xs text-green-500 flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </p>
            )}

            <div className="flex items-center justify-between gap-3 mt-1">
              <p className="text-xs text-muted-foreground">
                Price IDs for Pro/Business can be added in <span className="text-foreground font-medium">/admin/billing</span>.
              </p>
              <Button
                onClick={saveBilling}
                disabled={(!stripeSecret.trim() && !stripeWebhook.trim()) || billingStatus === "saving" || billingStatus === "success"}
                size="sm"
                className="bg-brand-600 text-white hover:bg-brand-500 gap-2"
              >
                {billingStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                {billingStatus === "saving" ? "Saving…" : billingStatus === "success" ? "Saved" : "Save Stripe"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Plan limits link */}
      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Want to fine-tune what each plan (free / pro / business / enterprise) can do?
        Set projects-per-user, daily credits, file size limits, custom domains, and more in{" "}
        <a href="/admin/plan-limits" className="text-foreground font-medium underline underline-offset-2">
          /admin/plan-limits
        </a>{" "}
        — sensible defaults apply automatically until then.
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Skip for now
          </button>
          <Button onClick={onNext} className="bg-brand-600 text-white hover:bg-brand-500 gap-2">
            {isFinalStep ? "Finish setup" : "Continue"} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
