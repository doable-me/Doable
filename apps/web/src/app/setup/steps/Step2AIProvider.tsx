"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
  Github,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import {
  PROVIDER_CATALOG,
  PROVIDER_COUNT,
  type ProviderPreset,
} from "@doable/shared";
import { Step2EmbeddingPanel } from "./Step2EmbeddingPanel";

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

// Stable list of Copilot-accessible models. GitHub Copilot rotates its
// model catalog faster than we can ship releases, so the picker hardcodes a
// reasonable common-denominator set and lets the admin change it later via
// /admin/ai-settings (where the list comes back live from the user's
// validate-token response). Default sits at `gpt-4o` — universally
// available on every Copilot subscription tier as of 2026.
const COPILOT_MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "gpt-4o", label: "gpt-4o (OpenAI)" },
  { id: "gpt-4o-mini", label: "gpt-4o-mini (OpenAI, cheaper)" },
  { id: "o3-mini", label: "o3-mini (OpenAI reasoning)" },
  { id: "claude-3.7-sonnet", label: "claude-3.7-sonnet (Anthropic)" },
  { id: "claude-sonnet-4", label: "claude-sonnet-4 (Anthropic, latest)" },
  { id: "gemini-2.0-flash-001", label: "gemini-2.0-flash (Google)" },
];

interface CopilotConnectedMessage {
  type: "doable:copilot-connected";
  ok: true;
  accountId?: string;
  githubLogin: string;
}
interface CopilotErrorMessage {
  type: "doable:copilot-error";
  ok: false;
  error: string;
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== "undefined" ? `${window.location.origin}/api` : "");

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
  // Default true: a first-time installer overwhelmingly wants their wizard
  // choice to also apply as the per-plan default. Power-users can untick.
  const [setAsPlanDefault, setSetAsPlanDefault] = useState(true);

  // Copilot OAuth state — populated when the admin completes the GitHub
  // popup OAuth handshake. Without these, the Copilot tile only records the
  // platform_config preference; with them, /setup/ai-provider also binds
  // workspace_ai_settings + platform_ai_defaults to use the chosen account
  // and model, so chat works the moment the wizard finishes.
  const [copilotWorkspaceId, setCopilotWorkspaceId] = useState<string | null>(null);
  const [copilotAccountId, setCopilotAccountId] = useState<string | null>(null);
  const [copilotGithubLogin, setCopilotGithubLogin] = useState<string | null>(null);
  const [copilotConnecting, setCopilotConnecting] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);
  const [copilotModel, setCopilotModel] = useState<string>(COPILOT_MODEL_OPTIONS[0]!.id);
  // Live model list for the connected Copilot account. Populated post-OAuth
  // via /ai/models?copilotAccountId=…, which calls CopilotEngine.listModels()
  // on the server (5-min cached). Falls back to COPILOT_MODEL_OPTIONS if the
  // fetch fails so the wizard never strands the admin on an empty dropdown.
  const [copilotModels, setCopilotModels] = useState<Array<{ id: string; label: string }>>(
    COPILOT_MODEL_OPTIONS,
  );
  const [copilotModelsLoading, setCopilotModelsLoading] = useState(false);
  // Snapshot of copilot-account ids that exist BEFORE the popup is opened.
  // Used by the polling fallback to identify which account is the new one
  // when postMessage from the popup never lands (browser COOP clears
  // window.opener after the cross-origin trip through github.com on some
  // Chrome/Safari versions — see BUG-R34-O).
  const [copilotBaselineAccountIds, setCopilotBaselineAccountIds] = useState<Set<string>>(
    new Set(),
  );

  // Fetch the admin's primary workspace once — we need its ID to scope the
  // copilot-account POST after OAuth. /workspaces returns the caller's
  // workspaces (auto-created on signup); the first is the admin's own.
  useEffect(() => {
    apiFetch<Array<{ id: string }> | { data: Array<{ id: string }> }>("/workspaces")
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data ?? [];
        if (list.length > 0) setCopilotWorkspaceId(list[0]!.id);
      })
      .catch(() => {
        // Non-fatal — Copilot tile will surface a clear "no workspace" error
        // if the user tries to connect before this resolves.
      });
  }, []);

  // Listen for postMessage from the popup OAuth flow. The callback page
  // (/ai-settings/callback) detects window.opener and emits one of:
  //   {type:"doable:copilot-connected", ok:true, accountId, githubLogin}
  //   {type:"doable:copilot-error", ok:false, error}
  // We accept only same-origin messages to avoid a hostile tab spoofing the
  // event.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const data = e.data as CopilotConnectedMessage | CopilotErrorMessage | undefined;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      if (data.type === "doable:copilot-connected" && data.ok) {
        setCopilotAccountId(data.accountId ?? null);
        setCopilotGithubLogin(data.githubLogin);
        setCopilotConnecting(false);
        setCopilotError(null);
      } else if (data.type === "doable:copilot-error" && !data.ok) {
        setCopilotConnecting(false);
        setCopilotError(data.error);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // localStorage signal channel — the callback page writes
  // "doable:copilot-recent" on success (both new-account and refresh-
  // existing-account paths). Same-origin tabs/windows get a `storage`
  // event when localStorage changes, so this is robust to:
  //   - window.opener being null (Chrome/Safari COOP after cross-origin
  //     trip through github.com)
  //   - The polling baseline already containing the account (the user
  //     re-authorized an existing Copilot account)
  //   - The popup having become a regular tab (popup blocker promoted
  //     it, window.close() is a no-op, but localStorage still works).
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== "doable:copilot-recent" || !e.newValue) return;
      try {
        const data = JSON.parse(e.newValue) as {
          accountId?: string;
          githubLogin?: string;
        };
        if (typeof data.accountId === "string" && typeof data.githubLogin === "string") {
          setCopilotAccountId(data.accountId);
          setCopilotGithubLogin(data.githubLogin);
          setCopilotConnecting(false);
          setCopilotError(null);
        }
      } catch {
        // Malformed payload — ignore.
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Polling backup for the postMessage signal above. Empirically the
  // wizard's "Waiting for GitHub…" button can get stuck on Chrome/Safari
  // builds where cross-origin trips through github.com clear window.opener
  // (COOP=same-origin-allow-popups still allows the navigation but the
  // browser refuses to expose opener after the redirect chain). When that
  // happens postMessage never fires, the wizard never advances, and the
  // user sees a frozen button despite a successful OAuth handshake in the
  // popup.
  //
  // Polling /workspaces/:wid/ai-settings/copilot-accounts every 2s and
  // diffing against the baseline captured in openCopilotPopup() catches
  // the new row regardless of opener state. Aborts as soon as a new
  // account materialises OR the popup-blocker timeout (60s) passes.
  useEffect(() => {
    if (!copilotConnecting || !copilotWorkspaceId) return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const res = await apiFetch<{
          data: Array<{ id: string; github_login: string }>;
        }>(
          `/workspaces/${copilotWorkspaceId}/ai-settings/copilot-accounts`,
        );
        if (cancelled) return;
        const fresh = (res.data ?? []).find(
          (a) => !copilotBaselineAccountIds.has(a.id),
        );
        if (fresh) {
          setCopilotAccountId(fresh.id);
          setCopilotGithubLogin(fresh.github_login);
          setCopilotConnecting(false);
          setCopilotError(null);
          clearInterval(interval);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          if (!cancelled) {
            setCopilotConnecting(false);
            setCopilotError(
              "Connection timed out. If you completed OAuth on GitHub, reload this page and check /admin/ai-settings.",
            );
          }
        }
      } catch {
        // Ignore transient API errors — postMessage may still fire, and
        // the next poll tick will retry.
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [copilotConnecting, copilotWorkspaceId, copilotBaselineAccountIds]);

  // Fetch the live model list once OAuth has populated copilotAccountId.
  // /ai/models is the same endpoint /admin/ai-settings uses; the server
  // calls CopilotEngine.listModels() under the hood with a 5-min cache so
  // walking back from the success state and tweaking the dropdown is cheap.
  // We seed copilotModel with the first returned id so the default reflects
  // what the account actually supports, not the hardcoded gpt-4o fallback.
  useEffect(() => {
    if (!copilotAccountId) return;
    let cancelled = false;
    setCopilotModelsLoading(true);
    apiFetch<{ data: Array<{ id: string; name?: string }> }>(
      `/ai/models?copilotAccountId=${encodeURIComponent(copilotAccountId)}`,
    )
      .then((res) => {
        if (cancelled) return;
        const live = (res.data ?? [])
          .filter((m) => typeof m.id === "string" && m.id.length > 0)
          .map((m) => ({ id: m.id, label: m.name ?? m.id }));
        if (live.length > 0) {
          // Prepend the synthetic "Auto" option. GitHub Copilot's
          // /models catalog endpoint does not list `auto` as a
          // discoverable model — it's a client-side routing token the
          // VS Code Copilot Chat extension sends as `model: "auto"`,
          // and the upstream session API accepts it as a "let Copilot
          // pick the best model per-request" instruction. Surfacing it
          // here lets operators ship "let it decide" as the platform
          // default; the live list still shows every specific model
          // for power-users who want to pin one.
          const withAuto = [
            { id: "auto", label: "Auto (route per request)" },
            ...live,
          ];
          setCopilotModels(withAuto);
          setCopilotModel("auto");
        }
      })
      .catch(() => {
        // Keep hardcoded fallback; admin can refine later via /admin/ai-settings.
      })
      .finally(() => {
        if (!cancelled) setCopilotModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [copilotAccountId]);

  async function openCopilotPopup() {
    if (!copilotWorkspaceId) {
      setCopilotError("No workspace yet. Reload the page and try again.");
      return;
    }
    setCopilotError(null);

    // Snapshot the set of existing Copilot accounts BEFORE flipping
    // copilotConnecting=true so the polling effect doesn't fire with a
    // stale empty baseline and misclassify a previously-existing account
    // as the new one. Order matters: baseline first, then connecting.
    let baseline = new Set<string>();
    try {
      const existing = await apiFetch<{ data: Array<{ id: string }> }>(
        `/workspaces/${copilotWorkspaceId}/ai-settings/copilot-accounts`,
      );
      baseline = new Set((existing.data ?? []).map((a) => a.id));
    } catch {
      // Non-fatal: a fresh install has zero accounts, so an empty baseline
      // is the correct fallback.
    }
    setCopilotBaselineAccountIds(baseline);
    setCopilotConnecting(true);

    // scope=workspace so the account is workspace-shared rather than a
    // personal override owned by the admin's user id. Without this, the
    // wizard's "Set Copilot for every plan" save still works at chat time
    // (engine-resolver looks up by account_id, no scope check), but the
    // /admin/ai-settings UI lists the account as personal-only and it's
    // tied to the admin's user — deleting the admin would orphan it.
    // fromWizard=1 tells the api callback (which then echoes it through
    // to /ai-settings/callback) that this OAuth flow originated from the
    // setup wizard. The callback page uses that flag — not window.opener
    // (which Chrome/Safari COOP clears after the cross-origin trip) —
    // to decide NOT to redirect the popup to /admin/ai-settings.
    const url = `${API_URL}/auth/github/copilot?workspaceId=${encodeURIComponent(copilotWorkspaceId)}&scope=workspace&fromWizard=1`;
    const popup = window.open(url, "doable-copilot-oauth", "width=600,height=720,popup=yes");
    if (!popup) {
      setCopilotConnecting(false);
      setCopilotError("Popup blocked — allow popups for this site and try again.");
    }
  }

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
      // Pre-fill the editable URL field with the catalog default so the
      // user only has to touch it for template-substituted providers
      // (Azure {resource}, Bedrock {region}, Vertex {region}/{project}).
      setCustomBaseUrl(t.preset.baseUrlEditable ? t.preset.defaultBaseUrl : "");
      // Seed from catalog default. For providers with an empty defaultModels
      // list, leave blank — the free-text fallback input renders below.
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
    const isEditableUrlPreset =
      selected.kind === "preset" && selected.preset.baseUrlEditable;
    // Local providers (Ollama, LM Studio, vLLM, …) use authMethod="none" —
    // they bind to a localhost URL with no API key. Skip the key requirement.
    const skipsKey =
      isCopilot ||
      (selected.kind === "preset" && selected.preset.authMethod === "none");

    if (!skipsKey && !apiKey.trim()) return;
    // BYOK custom URL + editable-preset paths both need a base URL.
    if ((isByokCustom || isEditableUrlPreset) && !customBaseUrl.trim()) return;

    setStatus("saving");
    setErrorMsg(null);
    try {
      const backend =
        selected.kind === "preset"
          ? backendProviderFor(selected.preset)
          : backendProviderFor(selected.tile);

      const body: Record<string, string | boolean> = { provider: backend.provider };
      if (!isCopilot && apiKey.trim()) body.apiKey = apiKey.trim();
      // Editable-URL preset overrides defaultBaseUrl with operator-supplied value.
      if (isEditableUrlPreset && customBaseUrl.trim()) {
        body.baseUrl = customBaseUrl.trim();
      } else if (backend.baseUrl) {
        body.baseUrl = backend.baseUrl;
      }
      if (isByokCustom && customBaseUrl.trim()) body.baseUrl = customBaseUrl.trim();
      // Always send a model: prefer what the user typed/selected, then fall
      // back to the catalog default for the selected preset. Without a model
      // the API writes NULL into default_provider_model / suggestion_provider_model
      // / platform_ai_defaults, causing "No model available" errors at chat time.
      const resolvedModel =
        model.trim() ||
        (selected?.kind === "preset" ? (selected.preset.defaultModels[0]?.id ?? "") : "");
      // BUG-R26-004/005: without a model the API writes NULL into
      // default_provider_model + suggestion_provider_model, and chat then fails
      // with "No model available" on first use. Block save for every non-copilot
      // path (PresetForm with empty defaultModels, ByokCustomForm with blank
      // model field, EditableUrlPresetForm). Copilot OAuth has no model picker.
      if (!isCopilot && !resolvedModel) {
        setStatus("error");
        setErrorMsg("Pick or type a model — chat needs one to know which engine to call.");
        return;
      }
      if (resolvedModel) body.model = resolvedModel;
      if (isCopilot) {
        // Inline Copilot OAuth completed in the popup — send the resulting
        // account id and the chosen model so /setup/ai-provider also writes
        // workspace_ai_settings + platform_ai_defaults. Without these,
        // the wizard would only flip platform_config and chat would still
        // fail with "No model available" until the admin manually bound a
        // model under /admin/ai-settings.
        if (!copilotAccountId) {
          setStatus("error");
          setErrorMsg("Click \"Connect with GitHub\" first — Copilot needs a connected account before saving.");
          return;
        }
        body.copilotAccountId = copilotAccountId;
        body.copilotModel = copilotModel;
        body.setAsPlanDefault = setAsPlanDefault;
      } else {
        body.setAsPlanDefault = setAsPlanDefault;
      }

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
                  baseUrl={customBaseUrl}
                  onBaseUrlChange={setCustomBaseUrl}
                  model={model}
                  onModelChange={setModel}
                  showKey={showKey}
                  onToggleShowKey={() => setShowKey((v) => !v)}
                  status={status}
                  errorMsg={errorMsg}
                  onSave={handleSave}
                  setAsPlanDefault={setAsPlanDefault}
                  onSetAsPlanDefaultChange={setSetAsPlanDefault}
                />
              )}

              {isSelected && t.kind === "special" && t.tile.id === "github_copilot" && (
                <CopilotForm
                  status={status}
                  errorMsg={errorMsg}
                  onSave={handleSave}
                  copilotAccountId={copilotAccountId}
                  copilotGithubLogin={copilotGithubLogin}
                  copilotConnecting={copilotConnecting}
                  copilotError={copilotError}
                  copilotModel={copilotModel}
                  onCopilotModelChange={setCopilotModel}
                  copilotModels={copilotModels}
                  copilotModelsLoading={copilotModelsLoading}
                  onConnect={openCopilotPopup}
                  workspaceReady={!!copilotWorkspaceId}
                  setAsPlanDefault={setAsPlanDefault}
                  onSetAsPlanDefaultChange={setSetAsPlanDefault}
                />
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
                  setAsPlanDefault={setAsPlanDefault}
                  onSetAsPlanDefaultChange={setSetAsPlanDefault}
                />
              )}
            </div>
          );
        })}
      </div>

      <Step2EmbeddingPanel />

      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p>
          Tip: export any of 19 supported API key env vars
          (<code className="text-foreground">ANTHROPIC_API_KEY</code>,{" "}
          <code className="text-foreground">OPENAI_API_KEY</code>,{" "}
          <code className="text-foreground">GEMINI_API_KEY</code>,{" "}
          <code className="text-foreground">OPENROUTER_API_KEY</code>,{" "}
          <code className="text-foreground">GROQ_API_KEY</code>,{" "}
          <code className="text-foreground">DEEPSEEK_API_KEY</code>, …) before running{" "}
          <code className="text-foreground">docker/setup.sh</code> and the matching provider is
          pre-configured here. See <code className="text-foreground">docker/setup.sh</code>{" "}
          banner for the full list.
        </p>
        <p>
          Running a <span className="text-foreground font-medium">local model</span>? Search for{" "}
          <code className="text-foreground">ollama</code>,{" "}
          <code className="text-foreground">lm studio</code>, or{" "}
          <code className="text-foreground">vllm</code> above — no API key needed, just point
          at <code className="text-foreground">http://localhost:&lt;port&gt;/v1</code>.
        </p>
        <p>
          Doable does <span className="text-foreground font-medium">not</span> bundle, ship, or
          proxy any third-party AI keys — every key is BYOK (bring-your-own).
        </p>
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
  baseUrl: string;
  onBaseUrlChange: (v: string) => void;
  model: string;
  onModelChange: (v: string) => void;
  showKey: boolean;
  onToggleShowKey: () => void;
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
  onSave: () => void;
  setAsPlanDefault: boolean;
  onSetAsPlanDefaultChange: (v: boolean) => void;
}

function PresetForm({
  preset,
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
  setAsPlanDefault,
  onSetAsPlanDefaultChange,
}: PresetFormProps) {
  return (
    <div className="rounded-b-lg border border-t-0 border-brand-500/40 bg-card px-4 pb-4 pt-3 flex flex-col gap-3">
      {preset.baseUrlEditable ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-foreground">
              Base URL
              {preset.baseUrlTemplate && (
                <span className="ml-1 text-muted-foreground font-normal">
                  (replace {`{placeholders}`} with your values)
                </span>
              )}
            </label>
            {preset.apiKeyHelpUrl && (
              <a
                href={preset.apiKeyHelpUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2"
              >
                Help <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={preset.defaultBaseUrl}
            autoComplete="off"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          />
        </>
      ) : (
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
      )}

      {preset.authMethod === "none" ? (
        <p className="text-xs text-muted-foreground">
          This provider runs locally on your machine — no API key needed.
          Make sure the server is running at the URL above
          {preset.warnings && preset.warnings.length > 0 ? "; see warnings below" : ""}.
        </p>
      ) : (
        <>
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
        </>
      )}

      {preset.warnings && preset.warnings.length > 0 && (
        <ul className="text-xs text-yellow-500/90 space-y-0.5 list-disc list-inside">
          {preset.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {preset.defaultModels.length > 0 ? (
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
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-foreground">
            Model ID
            <span className="ml-1 font-normal text-muted-foreground">(from provider's docs)</span>
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder="e.g. grok-3, qwen-turbo, llama-3.1-70b"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          />
        </div>
      )}

      <SaveControls
        status={status}
        errorMsg={errorMsg}
        onSave={onSave}
        disabled={
          // Local providers (authMethod: "none") need no key — only require URL.
          // Editable-URL presets also need the URL field populated.
          (preset.authMethod !== "none" && !apiKey.trim()) ||
          (preset.baseUrlEditable && !baseUrl.trim())
        }
        setAsPlanDefault={setAsPlanDefault}
        onSetAsPlanDefaultChange={onSetAsPlanDefaultChange}
      />
    </div>
  );
}

interface CopilotFormProps {
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
  onSave: () => void;
  copilotAccountId: string | null;
  copilotGithubLogin: string | null;
  copilotConnecting: boolean;
  copilotError: string | null;
  copilotModel: string;
  onCopilotModelChange: (id: string) => void;
  copilotModels: Array<{ id: string; label: string }>;
  copilotModelsLoading: boolean;
  onConnect: () => void;
  workspaceReady: boolean;
  setAsPlanDefault: boolean;
  onSetAsPlanDefaultChange: (v: boolean) => void;
}

function CopilotForm({
  status,
  errorMsg,
  onSave,
  copilotAccountId,
  copilotGithubLogin,
  copilotConnecting,
  copilotError,
  copilotModel,
  onCopilotModelChange,
  copilotModels,
  copilotModelsLoading,
  onConnect,
  workspaceReady,
  setAsPlanDefault,
  onSetAsPlanDefaultChange,
}: CopilotFormProps) {
  const connected = !!copilotAccountId && !!copilotGithubLogin;
  return (
    <div className="rounded-b-lg border border-t-0 border-brand-500/40 bg-card px-4 pb-4 pt-3 flex flex-col gap-3">
      {!connected && (
        <>
          <p className="text-xs text-muted-foreground">
            GitHub Copilot uses OAuth — no API key is needed. Click below to
            authorize Doable against your existing Copilot subscription.
            A popup window opens; once you authorize on github.com, it closes
            automatically and we return here to pick the default model.
          </p>
          <Button
            onClick={onConnect}
            disabled={copilotConnecting || !workspaceReady}
            size="sm"
            className="bg-brand-600 text-white hover:bg-brand-500 self-start gap-2"
          >
            {copilotConnecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Github className="h-3.5 w-3.5" />
            )}
            {copilotConnecting ? "Waiting for GitHub…" : "Connect with GitHub"}
          </Button>
          {copilotError && (
            <p className="text-xs text-red-400">{copilotError}</p>
          )}
        </>
      )}
      {connected && (
        <>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-snug">
              Connected as{" "}
              <span className="text-foreground font-medium">@{copilotGithubLogin}</span>.
              Pick the default model below — you can change it any time in{" "}
              <code className="text-foreground">/admin/ai-settings</code>.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="copilot-model" className="text-xs font-medium text-foreground flex items-center gap-2">
              Default Copilot model
              {copilotModelsLoading && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </label>
            <select
              id="copilot-model"
              value={copilotModel}
              onChange={(e) => onCopilotModelChange(e.target.value)}
              disabled={copilotModelsLoading}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-60"
            >
              {copilotModels.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {copilotModelsLoading
                ? "Fetching the live list of models your Copilot subscription includes…"
                : `${copilotModels.length} models available on your Copilot subscription. Tune further from /admin/ai-settings any time.`}
            </p>
          </div>
          <SaveControls
            status={status}
            errorMsg={errorMsg}
            onSave={onSave}
            disabled={false}
            setAsPlanDefault={setAsPlanDefault}
            onSetAsPlanDefaultChange={onSetAsPlanDefaultChange}
          />
        </>
      )}
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
  setAsPlanDefault: boolean;
  onSetAsPlanDefaultChange: (v: boolean) => void;
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
  setAsPlanDefault,
  onSetAsPlanDefaultChange,
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
        // BUG-R26-004: require a model for BYOK Custom — the backend writes
        // NULL into default_provider_model otherwise, and chat fails on first
        // call with "No model available".
        disabled={!apiKey.trim() || !baseUrl.trim() || !model.trim()}
        setAsPlanDefault={setAsPlanDefault}
        onSetAsPlanDefaultChange={onSetAsPlanDefaultChange}
      />
    </div>
  );
}

interface SaveControlsProps {
  status: "idle" | "saving" | "success" | "error";
  errorMsg: string | null;
  onSave: () => void;
  disabled: boolean;
  // When provided, renders the "default model for all plans" checkbox above
  // the Save button. Omit for flows where the choice doesn't apply
  // (e.g. GitHub Copilot OAuth — that path doesn't reach this control yet).
  setAsPlanDefault?: boolean;
  onSetAsPlanDefaultChange?: (value: boolean) => void;
}

function SaveControls({
  status,
  errorMsg,
  onSave,
  disabled,
  setAsPlanDefault,
  onSetAsPlanDefaultChange,
}: SaveControlsProps) {
  const showPlanDefault =
    setAsPlanDefault !== undefined && onSetAsPlanDefaultChange !== undefined;
  return (
    <>
      {showPlanDefault && (
        <label className="inline-flex items-start gap-2 text-xs text-muted-foreground select-none cursor-pointer">
          <input
            type="checkbox"
            checked={setAsPlanDefault}
            onChange={(e) => onSetAsPlanDefaultChange!(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-input"
          />
          <span>
            Use this model as the default for every plan (Free, Pro, Business,
            Enterprise) and as the suggestions model. You can fine-tune
            per-plan and suggestions models later in{" "}
            <span className="text-foreground font-medium">/admin/plan-defaults</span>.
          </span>
        </label>
      )}
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
