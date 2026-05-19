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

  // Supabase (Backend & Database)
  const [showSupabase, setShowSupabase] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [supabaseConnected, setSupabaseConnected] = useState<boolean | null>(null);
  const [supabaseConnectionId, setSupabaseConnectionId] = useState<string | null>(null);
  const [supabaseOrgName, setSupabaseOrgName] = useState<string | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<SaveStatus>("idle");
  const [supabaseError, setSupabaseError] = useState<string | null>(null);
  const supabasePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supabasePopupRef = useRef<Window | null>(null);

  const refreshSupabaseConnection = useCallback(
    async (wsId: string): Promise<boolean> => {
      const res = await apiFetch<{ data: SupabaseConnectionRow[] }>(
        `/integrations/connections?workspaceId=${encodeURIComponent(wsId)}`,
      );
      const row = res.data.find(
        (c) => c.integrationId === "supabase-mgmt" && c.status === "active",
      );
      if (row) {
        setSupabaseConnected(true);
        setSupabaseConnectionId(row.id);
        setSupabaseOrgName(row.displayName ?? "Supabase");
        return true;
      }
      setSupabaseConnected(false);
      setSupabaseConnectionId(null);
      setSupabaseOrgName(null);
      return false;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await apiListWorkspaces();
        const first = ws.data[0];
        if (cancelled || !first) {
          if (!cancelled) setSupabaseConnected(false);
          return;
        }
        setWorkspaceId(first.id);
        await refreshSupabaseConnection(first.id);
      } catch {
        if (!cancelled) setSupabaseConnected(false);
      }
    })();
    return () => {
      cancelled = true;
      if (supabasePollRef.current) {
        clearInterval(supabasePollRef.current);
        supabasePollRef.current = null;
      }
    };
  }, [refreshSupabaseConnection]);

  const connectSupabase = useCallback(() => {
    if (!workspaceId) return;
    setSupabaseStatus("saving");
    setSupabaseError(null);

    const width = 600;
    const height = 720;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      "about:blank",
      "supabase-oauth",
      `width=${width},height=${height},left=${left},top=${top},popup=1`,
    );
    if (!popup) {
      setSupabaseStatus("error");
      setSupabaseError("Popup was blocked. Allow popups for this site and try again.");
      return;
    }
    supabasePopupRef.current = popup;

    (async () => {
      try {
        const params = new URLSearchParams({ workspaceId, scope: "user" });
        const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(
          `/integrations/enhanced-auth/supabase-mgmt/authorize?${params}`,
        );
        popup.location.href = authorizationUrl;
      } catch (err) {
        try { popup.close(); } catch { /* ignore */ }
        setSupabaseStatus("error");
        setSupabaseError(err instanceof Error ? err.message : "Failed to start Supabase sign-in.");
        return;
      }

      const deadline = Date.now() + 150_000;
      if (supabasePollRef.current) clearInterval(supabasePollRef.current);
      supabasePollRef.current = setInterval(async () => {
        if (Date.now() > deadline) {
          if (supabasePollRef.current) {
            clearInterval(supabasePollRef.current);
            supabasePollRef.current = null;
          }
          try { popup.close(); } catch { /* ignore */ }
          setSupabaseStatus("error");
          setSupabaseError("Timed out waiting for Supabase sign-in. Try again.");
          return;
        }
        try {
          const ok = await refreshSupabaseConnection(workspaceId);
          if (ok) {
            if (supabasePollRef.current) {
              clearInterval(supabasePollRef.current);
              supabasePollRef.current = null;
            }
            try { popup.close(); } catch { /* ignore */ }
            setSupabaseStatus("success");
            setTimeout(() => setSupabaseStatus("idle"), 1500);
            return;
          }
        } catch {
          // ignore transient errors, keep polling
        }
        if (popup.closed) {
          if (supabasePollRef.current) {
            clearInterval(supabasePollRef.current);
            supabasePollRef.current = null;
          }
          // One last check — popup closed could mean success arrived just before close.
          const ok = await refreshSupabaseConnection(workspaceId).catch(() => false);
          if (!ok) {
            setSupabaseStatus("error");
            setSupabaseError("Supabase sign-in window was closed. Try again.");
          } else {
            setSupabaseStatus("success");
            setTimeout(() => setSupabaseStatus("idle"), 1500);
          }
        }
      }, 2000);
    })();
  }, [workspaceId, refreshSupabaseConnection]);

  const disconnectSupabase = useCallback(async () => {
    if (!supabaseConnectionId) return;
    setSupabaseStatus("saving");
    setSupabaseError(null);
    try {
      await apiFetch(`/integrations/connections/${supabaseConnectionId}`, { method: "DELETE" });
      setSupabaseConnected(false);
      setSupabaseConnectionId(null);
      setSupabaseOrgName(null);
      setSupabaseStatus("idle");
    } catch (err) {
      setSupabaseStatus("error");
      setSupabaseError(err instanceof Error ? err.message : "Could not disconnect Supabase.");
    }
  }, [supabaseConnectionId]);

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

      {/* Backend & Database (Supabase) — collapsible */}
      <div className="rounded-lg border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowSupabase((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div>
            <p className="text-sm font-medium text-foreground">Backend &amp; Database (optional)</p>
            <p className="text-xs text-muted-foreground mt-1">
              {showSupabase
                ? "Pre-authorize Doable to provision Supabase projects on demand."
                : "Optional — pre-authorize Supabase so users don't get a sign-in prompt mid-build."}
            </p>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showSupabase && "rotate-180")} />
        </button>

        {showSupabase && (
          <div className="border-t border-border px-4 pb-4 pt-3 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              Pre-authorize Doable to provision Supabase projects on demand. Without this, users will be prompted mid-build to sign in with Supabase each time.
            </p>

            {supabaseConnected === null && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking connection…
              </div>
            )}

            {supabaseConnected === true && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <Check className="h-3 w-3" /> Connected as {supabaseOrgName ?? "Supabase"}
                </p>
                <Button
                  onClick={disconnectSupabase}
                  disabled={supabaseStatus === "saving"}
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground gap-2"
                >
                  {supabaseStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                  Disconnect
                </Button>
              </div>
            )}

            {supabaseConnected === false && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Not connected yet.
                </p>
                <Button
                  onClick={connectSupabase}
                  disabled={!workspaceId || supabaseStatus === "saving"}
                  size="sm"
                  className="bg-brand-600 text-white hover:bg-brand-500 gap-2"
                >
                  {supabaseStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {supabaseStatus === "saving" ? "Waiting for sign-in…" : "Connect Supabase"}
                </Button>
              </div>
            )}

            {supabaseStatus === "error" && supabaseError && (
              <p className="text-xs text-red-400">{supabaseError}</p>
            )}
            {supabaseStatus === "success" && (
              <p className="text-xs text-green-500 flex items-center gap-1">
                <Check className="h-3 w-3" /> Connected
              </p>
            )}
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
