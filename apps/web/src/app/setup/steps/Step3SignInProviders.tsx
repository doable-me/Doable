"use client";

import { useState } from "react";
import { Check, Copy, ChevronDown, ChevronUp, Loader2, ArrowRight, ArrowLeft, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface StepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type OAuthProvider = "google" | "github" | "supabase";

interface ProviderState {
  expanded: boolean;
  clientId: string;
  clientSecret: string;
  showSecret: boolean;
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com");
// OAuth callbacks go through the API server, not the web server
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const OAUTH_PROVIDERS: {
  id: OAuthProvider;
  label: string;
  description: string;
  callbackPath: string;
  consoleUrl: string;
  consoleLabel: string;
}[] = [
  {
    id: "google",
    label: "Google",
    description: "Sign in with Google accounts",
    callbackPath: "/auth/google/callback",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    consoleLabel: "Open Google Cloud Console",
  },
  {
    id: "github",
    label: "GitHub",
    // Register the PARENT path (with trailing slash) in the GitHub OAuth App's
    // "Authorization callback URL" field. GitHub validates the actual
    // redirect_uri at OAuth time using a subdirectory-match rule, so the
    // single registration covers all three first-party flows:
    //   /oauth/github/login/callback   — sign-in
    //   /oauth/github/copilot/callback — Copilot AI provider
    //   /oauth/github/repo/callback    — repo push/pull from the editor
    // Registering a leaf callback (e.g. `/oauth/github/login/callback` only)
    // makes GitHub reject the sibling Copilot + repo redirect URIs with
    // "redirect_uri is not associated with this application".
    description: "Sign-in + Copilot AI + repo push/pull — ONE OAuth App, register the parent URL below",
    callbackPath: "/oauth/github/",
    consoleUrl: "https://github.com/settings/developers",
    consoleLabel: "Open GitHub Developer Settings",
  },
  {
    id: "supabase",
    label: "Supabase",
    description:
      "Lets users authorize Doable to provision Supabase projects on their behalf when the AI builds a backend-enabled app. Without this, users see a sign-in prompt mid-build.",
    callbackPath: "/integrations/enhanced-auth/callback",
    consoleUrl: "https://supabase.com/dashboard/account/tokens",
    consoleLabel: "Open Supabase OAuth Apps",
  },
];

function deriveCallbackUrl(apiUrl: string, path: string): string {
  // Strip trailing slash, compose callback
  const base = apiUrl.replace(/\/$/, "");
  return `${base}${path}`;
}

export function Step3SignInProviders({ onNext, onBack, onSkip }: StepProps) {
  const [states, setStates] = useState<Record<OAuthProvider, ProviderState>>({
    google: { expanded: false, clientId: "", clientSecret: "", showSecret: false, status: "idle", errorMsg: null },
    github: { expanded: false, clientId: "", clientSecret: "", showSecret: false, status: "idle", errorMsg: null },
    supabase: { expanded: false, clientId: "", clientSecret: "", showSecret: false, status: "idle", errorMsg: null },
  });
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  function update(id: OAuthProvider, patch: Partial<ProviderState>) {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((prev) => ({ ...prev, [key]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [key]: false })), 2000);
    } catch {
      // ignore
    }
  }

  async function handleSave(id: OAuthProvider) {
    const s = states[id];
    if (!s.clientId.trim() || !s.clientSecret.trim()) return;
    update(id, { status: "saving", errorMsg: null });
    try {
      await apiFetch(`/setup/oauth/${id}`, {
        method: "POST",
        body: JSON.stringify({ clientId: s.clientId.trim(), clientSecret: s.clientSecret.trim() }),
      });
      update(id, { status: "success", clientId: "", clientSecret: "" }); // clear plaintext after save
    } catch (err) {
      update(id, {
        status: "error",
        errorMsg: err instanceof Error ? err.message : "Could not save. Try again.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">Sign-in providers</h2>
        <p className="text-sm text-muted-foreground">
          Let your users sign in with Google or GitHub. Register the callback URL in each
          provider&apos;s dashboard, then paste the credentials below.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {OAUTH_PROVIDERS.map((p) => {
          const s = states[p.id];
          const callbackUrl = deriveCallbackUrl(API_URL, p.callbackPath);
          const copyKey = `${p.id}-callback`;

          return (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border transition-colors",
                s.expanded ? "border-brand-500/40" : "border-border",
              )}
            >
              {/* Header row */}
              <button
                type="button"
                onClick={() => update(p.id, { expanded: !s.expanded })}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  {s.status === "success" ? (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600/20">
                      <Check className="h-3 w-3 text-green-500" />
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-border" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">Connect {p.label}</p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                </div>
                {s.expanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>

              {/* Expanded body */}
              {s.expanded && (
                <div className="border-t border-border/60 px-4 pb-4 pt-3 flex flex-col gap-4">
                  {/* Callback URL display */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-medium text-foreground">
                        1. Register this callback URL in the {p.label} developer console
                      </p>
                      <a
                        href={p.consoleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 underline-offset-2 hover:underline"
                      >
                        {p.consoleLabel} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 rounded border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground overflow-x-auto">
                        {callbackUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(callbackUrl, copyKey)}
                        className="shrink-0 flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        {copied[copyKey] ? (
                          <><Check className="h-3 w-3 text-green-500" /> Copied</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy</>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Credentials */}
                  {s.status !== "success" ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-xs font-medium text-foreground">2. Paste your credentials</p>
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={s.clientId}
                          onChange={(e) => update(p.id, { clientId: e.target.value, status: "idle" })}
                          placeholder="Client ID"
                          autoComplete="off"
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                        />
                        <div className="relative">
                          <input
                            type={s.showSecret ? "text" : "password"}
                            value={s.clientSecret}
                            onChange={(e) => update(p.id, { clientSecret: e.target.value, status: "idle" })}
                            placeholder="Client Secret"
                            autoComplete="new-password"
                            className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                          />
                          <button
                            type="button"
                            onClick={() => update(p.id, { showSecret: !s.showSecret })}
                            tabIndex={-1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {s.showSecret ? (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" /></svg>
                            ) : (
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            )}
                          </button>
                        </div>
                      </div>

                      {s.status === "error" && (
                        <p className="text-xs text-red-400">{s.errorMsg}</p>
                      )}

                      <Button
                        size="sm"
                        onClick={() => handleSave(p.id)}
                        disabled={!s.clientId.trim() || !s.clientSecret.trim() || s.status === "saving"}
                        className="self-start bg-brand-600 text-white hover:bg-brand-500 gap-2"
                      >
                        {s.status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                        {s.status === "saving" ? "Saving…" : "Save credentials"}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-green-500">
                      <Check className="h-4 w-4" />
                      Credentials saved. Value masked for security.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Sign-in providers are optional. You can configure them later in{" "}
        <span className="text-foreground font-medium">/admin</span>.
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
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
