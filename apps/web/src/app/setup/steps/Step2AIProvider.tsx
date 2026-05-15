"use client";

import { useState } from "react";
import { Check, Loader2, ArrowRight, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface StepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type Provider = "anthropic" | "openai" | "github_copilot" | "byok";

interface ProviderInfo {
  id: Provider;
  label: string;
  description: string;
  keyLabel: string;
  keyPlaceholder: string;
  models: string[];
  defaultModel: string;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude — best for creative and complex tasks",
    keyLabel: "API key",
    keyPlaceholder: "Your Anthropic key",
    models: ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
    defaultModel: "claude-sonnet-4-6",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT — broad ecosystem support",
    keyLabel: "API key",
    keyPlaceholder: "Your OpenAI key",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4.1"],
    defaultModel: "gpt-4o",
  },
  {
    id: "github_copilot",
    label: "GitHub Copilot",
    description: "Use your existing GitHub Copilot subscription",
    keyLabel: "Personal access token",
    keyPlaceholder: "Your GitHub Copilot token",
    models: ["claude-sonnet-4.5", "gpt-5", "gpt-4o"],
    defaultModel: "claude-sonnet-4.5",
  },
  {
    id: "byok",
    label: "Bring your own (BYOK)",
    description: "Any OpenAI-compatible endpoint — pick from 60+ providers in /admin",
    keyLabel: "API key",
    keyPlaceholder: "Your API key",
    models: [],
    defaultModel: "",
  },
];

export function Step2AIProvider({ onNext, onBack, onSkip }: StepProps) {
  const [selected, setSelected] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedProvider = selected ? PROVIDERS.find((p) => p.id === selected) : null;

  async function handleSave() {
    if (!selected || !apiKey.trim()) return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      const body: Record<string, string> = { provider: selected, apiKey: apiKey.trim() };
      if (model.trim()) body.model = model.trim();
      if (selected === "byok" && customBaseUrl.trim()) body.baseUrl = customBaseUrl.trim();
      await apiFetch("/setup/ai-provider", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setStatus("success");
      setApiKey(""); // clear plaintext from input after save
      setTimeout(onNext, 800);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Could not save. Try again.");
    }
  }

  function handleSelect(id: Provider) {
    if (selected === id) return;
    setSelected(id);
    setApiKey("");
    const provInfo = PROVIDERS.find((p) => p.id === id);
    setModel(provInfo?.defaultModel ?? "");
    setCustomBaseUrl("");
    setStatus("idle");
    setErrorMsg(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">Connect an AI provider</h2>
        <p className="text-sm text-muted-foreground">
          Doable uses this to power the AI builder. Pick one to start — you can add more in{" "}
          <span className="text-foreground font-medium">/admin/integrations</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROVIDERS.map((p) => {
          const isSelected = selected === p.id;
          return (
            <div key={p.id} className="flex flex-col gap-0">
              <button
                type="button"
                onClick={() => handleSelect(p.id)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 text-left transition-all",
                  isSelected
                    ? "border-brand-500 bg-brand-600/10"
                    : "border-border bg-card hover:border-brand-500/40 hover:bg-accent/40",
                  selected && selected !== p.id ? "opacity-50" : "",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    isSelected ? "border-brand-500 bg-brand-500" : "border-muted-foreground/40",
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                </div>
              </button>

              {/* Inline expansion */}
              {isSelected && (
                <div className="rounded-b-lg border border-t-0 border-brand-500/40 bg-card px-4 pb-4 pt-3 flex flex-col gap-3">
                  <label className="text-xs font-medium text-foreground">{p.keyLabel}</label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setStatus("idle");
                        setErrorMsg(null);
                      }}
                      placeholder={p.keyPlaceholder}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck={false}
                      className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {/* Model picker */}
                  {p.models.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-foreground">Default model</label>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                      >
                        {p.models.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* BYOK base URL */}
                  {p.id === "byok" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-foreground">Base URL</label>
                      <input
                        type="url"
                        value={customBaseUrl}
                        onChange={(e) => setCustomBaseUrl(e.target.value)}
                        placeholder="https://api.example.com/v1"
                        autoComplete="off"
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                      />
                      <label className="text-xs font-medium text-foreground mt-2">Model</label>
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="e.g. mixtral-8x7b, llama-3.1-70b"
                        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                      />
                    </div>
                  )}

                  {status === "error" && (
                    <p className="text-xs text-red-400">{errorMsg}</p>
                  )}
                  {status === "success" && (
                    <p className="text-xs text-green-500 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Saved
                    </p>
                  )}

                  <Button
                    onClick={handleSave}
                    disabled={!apiKey.trim() || status === "saving" || status === "success"}
                    size="sm"
                    className="bg-brand-600 text-white hover:bg-brand-500 self-start gap-2"
                  >
                    {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                    {status === "saving" ? "Validating…" : status === "success" ? "Saved" : "Validate & Save"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Skip banner — surfaces the full 60+ provider catalog */}
      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Want Groq, OpenRouter, Ollama, Mistral, or one of 55+ other providers?
        Configure them in{" "}
        <a href="/admin/ai-providers" className="text-foreground font-medium underline underline-offset-2">
          /admin/ai-providers
        </a>{" "}
        — the full catalog is available after first setup.
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
          {selected && status === "success" && (
            <Button onClick={onNext} className="bg-brand-600 text-white hover:bg-brand-500 gap-2">
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
