"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  PROVIDER_CATALOG,
  PROVIDER_COUNT,
  type ProviderPreset,
} from "@doable/shared";

interface StepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// Two providers don't live in PROVIDER_CATALOG: GitHub Copilot uses OAuth (no
// API key entry) and "BYOK custom URL" is a free-form OpenAI-compatible
// endpoint. Both are first-class tiles in the wizard.
type SpecialTile = {
  id: "github_copilot" | "byok-custom";
  name: string;
  description: string;
  icon: string;
};

const SPECIAL_TILES: readonly SpecialTile[] = [
  {
    id: "github_copilot",
    name: "GitHub Copilot",
    description: "Use your existing Copilot subscription (OAuth, no key)",
    icon: "github",
  },
  {
    id: "byok-custom",
    name: "Custom OpenAI-compatible URL",
    description: "Paste any /v1 base URL + key (Llamafile, vLLM, proxies, …)",
    icon: "byok",
  },
];

// Map setup wizard provider IDs to the values accepted by aiProviderSchema in
// services/api/src/routes/setup.ts (anthropic|openai|copilot|custom).
function backendProviderFor(preset: ProviderPreset | SpecialTile): {
  provider: "anthropic" | "openai" | "copilot" | "custom";
  baseUrl?: string;
} {
  if ("category" in preset) {
    // Real PROVIDER_CATALOG entry
    if (preset.id === "openai") return { provider: "openai" };
    if (preset.id === "anthropic") return { provider: "anthropic" };
    // Everything else goes through the "custom" (OpenAI-compatible) path with
    // an explicit baseUrl from the preset.
    return { provider: "custom", baseUrl: preset.defaultBaseUrl };
  }
  // SPECIAL_TILES
  if (preset.id === "github_copilot") return { provider: "copilot" };
  return { provider: "custom" }; // byok-custom: baseUrl entered by user
}

function isPopular(p: ProviderPreset): boolean {
  return p.tags.includes("popular");
}

type SelectedTile =
  | { kind: "preset"; preset: ProviderPreset }
  | { kind: "special"; tile: SpecialTile };

export function Step2AIProvider({ onNext, onBack, onSkip }: StepProps) {
  const [selected, setSelected] = useState<SelectedTile | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const popularPresets = useMemo(() => PROVIDER_CATALOG.filter(isPopular), []);

  // Tile set shown in the grid. Order: popular presets first, then the two
  // special tiles (Copilot + BYOK URL). "Show all" appends the rest of the
  // catalog. Search applies after assembling the candidate list.
  const tiles = useMemo<SelectedTile[]>(() => {
    const presetTiles: SelectedTile[] = (showAll ? [...PROVIDER_CATALOG] : popularPresets).map(
      (p) => ({ kind: "preset", preset: p }),
    );
    const specialTiles: SelectedTile[] = SPECIAL_TILES.map((t) => ({ kind: "special", tile: t }));
    const all = [...presetTiles, ...specialTiles];
    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    return all.filter((t) => {
      if (t.kind === "preset") {
        return (
          t.preset.name.toLowerCase().includes(needle) ||
          t.preset.id.toLowerCase().includes(needle) ||
          t.preset.description.toLowerCase().includes(needle)
        );
      }
      return (
        t.tile.name.toLowerCase().includes(needle) ||
        t.tile.id.toLowerCase().includes(needle) ||
        t.tile.description.toLowerCase().includes(needle)
      );
    });
  }, [popularPresets, query, showAll]);

  function tileKey(t: SelectedTile): string {
    return t.kind === "preset" ? `p:${t.preset.id}` : `s:${t.tile.id}`;
  }
  function isSameTile(a: SelectedTile, b: SelectedTile): boolean {
    return tileKey(a) === tileKey(b);
  }

  function handleSelect(t: SelectedTile) {
    if (selected && isSameTile(selected, t)) return;
    setSelected(t);
    setApiKey("");
    setStatus("idle");
    setErrorMsg(null);
    if (t.kind === "preset") {
      setCustomBaseUrl("");
      setModel(t.preset.defaultModels[0]?.id ?? "");
    } else {
      setCustomBaseUrl("");
      setModel("");
    }
  }

  async function handleSave() {
    if (!selected) return;
    const isCopilot = selected.kind === "special" && selected.tile.id === "github_copilot";
    const isByokCustom = selected.kind === "special" && selected.tile.id === "byok-custom";

    // Copilot uses OAuth — no key entered here. Everything else needs a key.
    if (!isCopilot && !apiKey.trim()) return;
    // BYOK custom URL needs a base URL.
    if (isByokCustom && !customBaseUrl.trim()) return;

    setStatus("saving");
    setErrorMsg(null);
    try {
      const backend =
        selected.kind === "preset"
          ? backendProviderFor(selected.preset)
          : backendProviderFor(selected.tile);

      const body: Record<string, string> = { provider: backend.provider };
      if (!isCopilot && apiKey.trim()) body.apiKey = apiKey.trim();
      if (backend.baseUrl) body.baseUrl = backend.baseUrl;
      if (isByokCustom && customBaseUrl.trim()) body.baseUrl = customBaseUrl.trim();
      if (model.trim()) body.model = model.trim();

      await apiFetch("/setup/ai-provider", { method: "POST", body: JSON.stringify(body) });
      setStatus("success");
      setApiKey("");
      setTimeout(onNext, 800);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Could not save. Try again.");
    }
  }

  const totalCount = PROVIDER_COUNT + SPECIAL_TILES.length;
  const popularCount = popularPresets.length + SPECIAL_TILES.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">
          Connect an AI provider
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick one to start — you can add more in{" "}
          <span className="text-foreground font-medium">/admin/ai-providers</span> later.
        </p>
      </div>

      {/* Search + Show all toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers (e.g. minimax, groq, ollama)"
            className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-input"
          />
          Show all {totalCount} providers
          {!showAll && (
            <span className="text-muted-foreground/60">
              ({popularCount} popular shown)
            </span>
          )}
        </label>
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-h-[60vh] overflow-y-auto pr-1">
        {tiles.length === 0 && (
          <div className="col-span-full text-center text-sm text-muted-foreground py-6">
            No providers match “{query}”. Clear the search or toggle “Show all”.
          </div>
        )}
        {tiles.map((t) => {
          const isSelected = selected ? isSameTile(selected, t) : false;
          const name = t.kind === "preset" ? t.preset.name : t.tile.name;
          const description = t.kind === "preset" ? t.preset.description : t.tile.description;
          const free = t.kind === "preset" ? t.preset.freeTier : undefined;
          return (
            <div key={tileKey(t)} className="flex flex-col gap-0">
              <button
                type="button"
                onClick={() => handleSelect(t)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                  isSelected
                    ? "border-brand-500 bg-brand-600/10"
                    : "border-border bg-card hover:border-brand-500/40 hover:bg-accent/40",
                  selected && !isSelected ? "opacity-60" : "",
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
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {name}
                    {free && (
                      <span className="ml-1.5 inline-block rounded bg-green-500/15 text-green-400 px-1.5 py-0.5 text-[10px] font-medium align-middle">
                        free tier
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
                </div>
              </button>

              {isSelected && t.kind === "preset" && (
                <PresetForm
                  preset={t.preset}
                  apiKey={apiKey}
                  onApiKeyChange={(v) => {
                    setApiKey(v);
                    setStatus("idle");
                    setErrorMsg(null);
                  }}
                  model={model}
                  onModelChange={setModel}
                  showKey={showKey}
                  onToggleShowKey={() => setShowKey((v) => !v)}
                  status={status}
                  errorMsg={errorMsg}
                  onSave={handleSave}
                />
              )}

              {isSelected && t.kind === "special" && t.tile.id === "github_copilot" && (
                <CopilotForm status={status} errorMsg={errorMsg} onSave={handleSave} />
              )}

              {isSelected && t.kind === "special" && t.tile.id === "byok-custom" && (
                <ByokCustomForm
                  apiKey={apiKey}
                  onApiKeyChange={(v) => {
                    setApiKey(v);
                    setStatus("idle");
                    setErrorMsg(null);
                  }}
                  baseUrl={customBaseUrl}
                  onBaseUrlChange={setCustomBaseUrl}
                  model={model}
                  onModelChange={setModel}
                  showKey={showKey}
                  onToggleShowKey={() => setShowKey((v) => !v)}
                  status={status}
                  errorMsg={errorMsg}
                  onSave={handleSave}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        Tip: export <code className="text-foreground">MINIMAX_API_KEY</code>,{" "}
        <code className="text-foreground">ANTHROPIC_API_KEY</code>, or{" "}
        <code className="text-foreground">OPENAI_API_KEY</code> before running{" "}
        <code className="text-foreground">docker/setup.sh</code> and the matching provider is
        pre-configured for you.
      </div>

      <div className="flex items-center justify-between pt-2">
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

// ─── Inline forms ─────────────────────────────────────────────────────────

interface PresetFormProps {
  preset: ProviderPreset;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
  onSave: () => void;
}

function PresetForm({
  preset,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  showKey,
  onToggleShowKey,
  status,
  errorMsg,
  onSave,
}: PresetFormProps) {
  return (
    <div className="rounded-b-lg border border-t-0 border-brand-500/40 bg-card px-4 pb-4 pt-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Base URL: <code className="text-foreground">{preset.defaultBaseUrl}</code>
        </span>
        {preset.apiKeyHelpUrl && (
          <a
            href={preset.apiKeyHelpUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2"
          >
            Get key <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <label className="text-xs font-medium text-foreground">API key</label>
      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={preset.apiKeyPlaceholder ?? "Your API key"}
          autoComplete="new-password"
          autoCorrect="off"
          spellCheck={false}
          className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        />
        <button
          type="button"
          onClick={onToggleShowKey}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>

      {preset.defaultModels.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">Default model</label>
          <select
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            {preset.defaultModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <SaveControls status={status} errorMsg={errorMsg} onSave={onSave} disabled={!apiKey.trim()} />
    </div>
  );
}

interface CopilotFormProps {
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
  onSave: () => void;
}

function CopilotForm({ status, errorMsg, onSave }: CopilotFormProps) {
  return (
    <div className="rounded-b-lg border border-t-0 border-brand-500/40 bg-card px-4 pb-4 pt-3 flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        GitHub Copilot uses OAuth — no API key is needed here. Continue to register
        your Copilot OAuth app under <code className="text-foreground">/admin/integrations</code>,
        or click below to mark this step done and configure it later.
      </p>
      <SaveControls status={status} errorMsg={errorMsg} onSave={onSave} disabled={false} />
    </div>
  );
}

interface ByokCustomFormProps {
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
  onSave: () => void;
}

function ByokCustomForm({
  apiKey,
  onApiKeyChange,
  baseUrl,
  onBaseUrlChange,
  model,
  onModelChange,
  showKey,
  onToggleShowKey,
  status,
  errorMsg,
  onSave,
}: ByokCustomFormProps) {
  return (
    <div className="rounded-b-lg border border-t-0 border-brand-500/40 bg-card px-4 pb-4 pt-3 flex flex-col gap-3">
      <label className="text-xs font-medium text-foreground">Base URL</label>
      <input
        type="url"
        value={baseUrl}
        onChange={(e) => onBaseUrlChange(e.target.value)}
        placeholder="https://api.example.com/v1"
        autoComplete="off"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      />

      <label className="text-xs font-medium text-foreground">API key</label>
      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder="Your API key"
          autoComplete="new-password"
          autoCorrect="off"
          spellCheck={false}
          className="h-9 w-full rounded-md border border-input bg-background pr-9 pl-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        />
        <button
          type="button"
          onClick={onToggleShowKey}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          tabIndex={-1}
        >
          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>

      <label className="text-xs font-medium text-foreground">Model</label>
      <input
        type="text"
        value={model}
        onChange={(e) => onModelChange(e.target.value)}
        placeholder="e.g. mixtral-8x7b, llama-3.1-70b"
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      />

      <SaveControls
        status={status}
        errorMsg={errorMsg}
        onSave={onSave}
        disabled={!apiKey.trim() || !baseUrl.trim()}
      />
    </div>
  );
}

interface SaveControlsProps {
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
  onSave: () => void;
  disabled: boolean;
}

function SaveControls({ status, errorMsg, onSave, disabled }: SaveControlsProps) {
  return (
    <>
      {status === "error" && <p className="text-xs text-red-400">{errorMsg}</p>}
      {status === "success" && (
        <p className="text-xs text-green-500 flex items-center gap-1">
          <Check className="h-3 w-3" /> Saved
        </p>
      )}
      <Button
        onClick={onSave}
        disabled={disabled || status === "saving" || status === "success"}
        size="sm"
        className="bg-brand-600 text-white hover:bg-brand-500 self-start gap-2"
      >
        {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
        {status === "saving" ? "Validating…" : status === "success" ? "Saved" : "Validate & Save"}
      </Button>
    </>
  );
}
