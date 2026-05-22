"use client";

import {
  Loader2,
  Search,
  ExternalLink,
  XCircle,
} from "lucide-react";
import type { ProviderPreset, ModelPreset } from "@doable/shared";
import { ProviderCard } from "./provider-card";
import { ProviderIcon, PROVIDER_COLORS } from "./provider-icons";
import {
  type CategoryTab,
  type WizardFormState,
} from "./provider-wizard-types";

// ─── Step 1: Choose ──────────────────────────────────────────

export function StepChoose({
  catalogLoading,
  catalogError,
  categoryTab,
  setCategoryTab,
  categoryCounts,
  searchQuery,
  setSearchQuery,
  filteredProviders,
  onSelect,
}: {
  catalogLoading: boolean;
  catalogError: string | null;
  categoryTab: CategoryTab;
  setCategoryTab: (tab: CategoryTab) => void;
  categoryCounts: Record<string, number>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filteredProviders: ProviderPreset[];
  onSelect: (preset: ProviderPreset) => void;
}) {
  if (catalogLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (catalogError) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <XCircle className="h-8 w-8 text-red-400 mb-2" />
        <p className="text-sm text-red-400">{catalogError}</p>
      </div>
    );
  }

  const TABS: { key: CategoryTab; label: string }[] = [
    { key: "cloud", label: "Cloud" },
    { key: "local", label: "Local" },
    { key: "gateway", label: "Gateway" },
  ];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search providers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex gap-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCategoryTab(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryTab === key
                ? "bg-brand-600 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            <span className="ml-1 text-[10px] opacity-70">
              ({categoryCounts[key] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {filteredProviders.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No providers match your search.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filteredProviders.map((preset) => (
            <ProviderCard
              key={preset.id}
              preset={preset}
              onClick={() => onSelect(preset)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Configure ──────────────────────────────────────

export function StepConfigure({
  preset,
  form,
  updateForm,
}: {
  preset: ProviderPreset;
  form: WizardFormState;
  updateForm: (field: keyof WizardFormState, value: string) => void;
}) {
  const isAzure = preset.sdkType === "azure";
  const isLocal = preset.category === "local";
  const requiresAuth = preset.authMethod !== "none";
  const brandColor = PROVIDER_COLORS[preset.id];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={brandColor ? { backgroundColor: `${brandColor}18` } : { backgroundColor: "rgba(113,113,122,0.15)" }}
        >
          <ProviderIcon providerId={preset.id} size={28} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{preset.name}</p>
          <p className="text-xs text-muted-foreground">{preset.description}</p>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Label</label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => updateForm("label", e.target.value)}
          placeholder="My Provider"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
        />
      </div>

      {isAzure && preset.baseUrlTemplate && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Azure Resource Name</label>
          <input
            type="text"
            value={form.azureResourceName}
            onChange={(e) => updateForm("azureResourceName", e.target.value)}
            placeholder="my-resource"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
          />
          {form.azureResourceName && (
            <p className="mt-1 text-xs text-muted-foreground">
              URL: {preset.defaultBaseUrl.replace("{resource}", form.azureResourceName)}
            </p>
          )}
        </div>
      )}

      {(!preset.baseUrlTemplate || !isAzure) && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Base URL</label>
          <input
            type="text"
            value={form.baseUrl}
            onChange={(e) => updateForm("baseUrl", e.target.value)}
            placeholder={preset.defaultBaseUrl}
            disabled={!preset.baseUrlEditable}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500 disabled:opacity-60"
          />
          {isLocal && (
            <p className="mt-1 text-xs text-muted-foreground">
              Default port: {new URL(preset.defaultBaseUrl).port || "80"}. Make sure the server is running.
            </p>
          )}
        </div>
      )}

      {isAzure && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">API Version</label>
          <input
            type="text"
            value={form.azureApiVersion}
            onChange={(e) => updateForm("azureApiVersion", e.target.value)}
            placeholder="2024-02-15-preview"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
          />
        </div>
      )}

      {requiresAuth && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">API Key</label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => updateForm("apiKey", e.target.value)}
            placeholder={preset.apiKeyPlaceholder ?? "Enter API key"}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
          />
          {preset.apiKeyHelpUrl && (
            <a
              href={preset.apiKeyHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Get API Key
            </a>
          )}
        </div>
      )}

      {!requiresAuth && (
        <div className="rounded-lg border border-border bg-muted p-3">
          <p className="text-xs text-muted-foreground">
            No API key required. This provider runs locally on your machine.
          </p>
        </div>
      )}
    </div>
  );
}

// Re-export extracted steps
export { StepValidate } from "./provider-wizard-steps-validate";
export { StepModels } from "./provider-wizard-steps-validate";
