"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Loader2, Sparkles, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Platform-default embedding provider panel.
 *
 * Doable admins configure this ONCE during /setup (or later in /admin). All
 * workspaces inherit silently — end users never see embeddings UI; they
 * just prompt "build me a chatbot" and runtime resolves the embedding
 * provider through this fallback.
 */

interface EmbeddingPreset {
  id: "openai" | "gemini" | "custom";
  name: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  apiKeyHelp?: string;
  apiKeyPlaceholder?: string;
}

const PRESETS: readonly EmbeddingPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "text-embedding-3-small / large. Fast, widely supported, $0.02/1M tokens.",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "text-embedding-3-small",
    apiKeyHelp: "https://platform.openai.com/api-keys",
    apiKeyPlaceholder: "sk-…",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "gemini-embedding-001 / text-embedding-004 via Gemini's OpenAI-compatible API.",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-embedding-001",
    apiKeyHelp: "https://aistudio.google.com/app/apikey",
    apiKeyPlaceholder: "AIza…",
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    description: "Any /v1/embeddings endpoint — Ollama, vLLM, Voyage, Cohere via proxy, etc.",
    defaultBaseUrl: "",
    defaultModel: "",
    apiKeyPlaceholder: "Your provider's key",
  },
];

interface EmbeddingStatus {
  embedding_provider: string | null;
  embedding_base_url: string | null;
  embedding_model: string | null;
  embedding_api_key: string | null;
}

export function Step2EmbeddingPanel() {
  const [open, setOpen] = useState(false);
  const [savedStatus, setSavedStatus] = useState<EmbeddingStatus | null>(null);
  const [selected, setSelected] = useState<EmbeddingPreset | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dims, setDims] = useState<number | null>(null);

  // Fetch current configuration so the admin sees "already configured" if
  // they're re-visiting the wizard or coming from /admin.
  useEffect(() => {
    apiFetch<EmbeddingStatus>("/setup/status")
      .then((res) => {
        setSavedStatus(res);
        // Auto-open the panel only when nothing is configured yet.
        if (!res.embedding_provider) setOpen(true);
      })
      .catch(() => {
        setOpen(true);
      });
  }, []);

  function selectPreset(p: EmbeddingPreset) {
    setSelected(p);
    setBaseUrl(p.defaultBaseUrl);
    setModel(p.defaultModel);
    setStatus("idle");
    setErrorMsg(null);
  }

  async function handleSave() {
    if (!selected) return;
    if (!apiKey.trim() || !baseUrl.trim() || !model.trim()) {
      setStatus("error");
      setErrorMsg("Provider, base URL, model and API key are all required.");
      return;
    }
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await apiFetch<{ ok: true; dimensions: number }>(
        "/setup/ai-embedding-provider",
        {
          method: "POST",
          body: JSON.stringify({
            provider: selected.id,
            baseUrl: baseUrl.trim(),
            model: model.trim(),
            apiKey: apiKey.trim(),
          }),
        },
      );
      setStatus("success");
      setDims(res.dimensions);
      setApiKey("");
      setSavedStatus({
        embedding_provider: selected.id === "gemini" ? "openai" : selected.id === "custom" ? "openai" : selected.id,
        embedding_base_url: baseUrl.trim(),
        embedding_model: model.trim(),
        embedding_api_key: "••••••••",
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Could not save. Try again.");
    }
  }

  const configured = !!savedStatus?.embedding_provider && !!savedStatus?.embedding_api_key;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="h-4 w-4 text-brand-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Embedding model
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (optional — for chatbots, semantic search, RAG)
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {configured
                ? `Configured: ${savedStatus?.embedding_model} via ${savedStatus?.embedding_base_url}`
                : "Pick once — every workspace inherits this. Skip if you don't need RAG yet."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {configured && (
            <span className="inline-flex items-center gap-1 text-xs text-green-500">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            End-users of apps built on Doable will never see this — they just
            ask the AI to build a chatbot. The runtime calls this embedding
            provider to vectorise their documents. You can change it any time
            from <code className="text-foreground">/admin/ai-settings</code>.
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPreset(p)}
                className={cn(
                  "flex flex-col gap-1 rounded-md border p-3 text-left transition-all",
                  selected?.id === p.id
                    ? "border-brand-500 bg-brand-600/10"
                    : "border-border bg-background hover:border-brand-500/40 hover:bg-accent/40",
                )}
              >
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
              </button>
            ))}
          </div>

          {selected && (
            <div className="rounded-md border border-brand-500/40 bg-background p-3 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-foreground">Base URL</label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={selected.defaultBaseUrl || "https://api.example.com/v1"}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                />
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-foreground">API key</label>
                  {selected.apiKeyHelp && (
                    <a
                      href={selected.apiKeyHelp}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2"
                    >
                      Get a key
                    </a>
                  )}
                </div>
                <div className="relative mt-1">
                  <input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={selected.apiKeyPlaceholder ?? "Your API key"}
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
              </div>

              <div>
                <label className="text-xs font-medium text-foreground">Embedding model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={selected.defaultModel || "e.g. text-embedding-3-small"}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                {status === "error" && errorMsg && (
                  <p className="text-xs text-red-400">{errorMsg}</p>
                )}
                {status === "success" && (
                  <p className="text-xs text-green-500">
                    Saved {dims ? `(${dims}-dim vectors)` : ""}
                  </p>
                )}
                {status !== "error" && status !== "success" && <span className="text-xs text-muted-foreground">Validates the key with a probe call before saving.</span>}
                <Button
                  onClick={handleSave}
                  disabled={status === "saving" || !apiKey.trim() || !baseUrl.trim() || !model.trim()}
                  size="sm"
                  className="bg-brand-600 text-white hover:bg-brand-500 gap-1.5"
                >
                  {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
                  {status === "success" ? "Update" : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
