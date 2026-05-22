"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { Step1Welcome } from "./steps/Step1Welcome";
import { Step2AIProvider } from "./steps/Step2AIProvider";
import { Step3SignInProviders } from "./steps/Step3SignInProviders";
import { StepCloudflare } from "./steps/StepCloudflare";
import { Step4Integrations } from "./steps/Step4Integrations";

const TOTAL_STEPS = 5;

// Admin-installer wizard — no "create first app" step (that belongs in the dashboard, not setup).
// Sign-in MUST come before AI Provider so the operator's GitHub OAuth App is
// registered before they have the option to pick GitHub Copilot as the AI
// provider (the Copilot tile triggers an OAuth handshake that uses the
// GITHUB_CLIENT_ID/SECRET saved in this step). Re-ordering the other way
// produced a dead-end where Copilot's authorize redirect went to GitHub with
// an empty client_id and bounced with "Application not found".
const STEP_LABELS = [
  "Welcome",
  "Sign-in",
  "AI Provider",
  "Cloudflare",
  "Plans & Billing",
];

export function WizardShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [workspaceName, setWorkspaceName] = useState<string>("");

  const rawStep = parseInt(searchParams.get("step") ?? "1", 10);
  const step = Math.min(Math.max(isNaN(rawStep) ? 1 : rawStep, 1), TOTAL_STEPS);

  // Check admin status + setup status client-side (handles cases where cookie wasn't available SSR)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/auth/login?redirect=/setup");
      return;
    }

    apiFetch<{ isPlatformAdmin: boolean; setupCompleted: boolean; workspaceName: string | null }>("/setup/status")
      .then((data) => {
        setIsPlatformAdmin(data.isPlatformAdmin);
        setSetupCompleted(data.setupCompleted);
        setWorkspaceName(data.workspaceName ?? "");
        if (!data.isPlatformAdmin || data.setupCompleted) {
          router.replace("/");
        }
      })
      .catch(() => {
        // Fail closed: if the status endpoint can't authenticate the user as a
        // platform admin (network error, 401, 403), do NOT render the wizard.
        // Send them home — they can hit /setup again once the backend is up.
        setIsPlatformAdmin(false);
        router.replace("/");
      })
      .finally(() => setStatusLoading(false));
  }, [user, authLoading, router]);

  function goToStep(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("step", String(n));
    router.push(`/setup?${params.toString()}`);
  }

  function handleNext() {
    if (step < TOTAL_STEPS) goToStep(step + 1);
  }

  function handleBack() {
    if (step > 1) goToStep(step - 1);
  }

  async function handleComplete() {
    try {
      await apiFetch("/setup/complete", { method: "POST" });
    } catch {
      // best-effort — if backend not ready yet, still navigate
    }
    router.push("/");
  }

  if (authLoading || statusLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  if (!isPlatformAdmin) return null;

  const stepProps = { onNext: handleNext, onBack: handleBack, onSkip: handleNext };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar with logo + progress */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          {/* Simple wordmark — matches the app's existing brand pattern */}
          <span className="text-lg font-semibold tracking-tight text-foreground">Doable</span>
          <span className="text-xs text-muted-foreground font-medium">Setup</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Step {step} of {TOTAL_STEPS}
          </span>
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              const done = n < step;
              const active = n === step;
              return (
                <div key={n} className="flex items-center gap-1">
                  <button
                    onClick={() => n < step && goToStep(n)}
                    disabled={n >= step}
                    title={label}
                    className={[
                      "h-7 w-7 rounded-full text-xs font-semibold transition-all flex items-center justify-center",
                      done
                        ? "bg-brand-600 text-white cursor-pointer hover:bg-brand-500"
                        : active
                        ? "bg-brand-600/20 text-brand-400 border border-brand-500/50"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
                  </button>
                  {i < TOTAL_STEPS - 1 && (
                    <div
                      className={[
                        "h-px w-6 transition-colors",
                        done ? "bg-brand-600" : "bg-border",
                      ].join(" ")}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Step content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        {/* Wider container so the AI Provider step's Copilot panel (model picker,
            scope+plan-default checkbox + helper text) doesn't squeeze into a
            multi-column scroll on the right side. Other steps still center
            cleanly inside max-w-3xl thanks to their own internal layouts. */}
        <div className="w-full max-w-3xl">
          {step === 1 && (
            <Step1Welcome
              workspaceName={workspaceName}
              onWorkspaceNameChange={setWorkspaceName}
              onNext={handleNext}
            />
          )}
          {step === 2 && <Step3SignInProviders {...stepProps} />}
          {step === 3 && <Step2AIProvider {...stepProps} />}
          {step === 4 && <StepCloudflare {...stepProps} />}
          {step === 5 && (
            <Step4Integrations
              onNext={handleComplete}
              onBack={handleBack}
              onSkip={handleComplete}
              isFinalStep
            />
          )}
        </div>
      </main>

      {/* Bottom progress bar */}
      <div className="h-1 bg-border/40">
        <div
          className="h-full bg-brand-500 transition-all duration-500"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}
