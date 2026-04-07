"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import type { ProviderPreset, ModelPreset } from "@doable/shared";
import { useProviderCatalog } from "../hooks/use-provider-catalog";
import {
  useTestConnection,
  type TestConnectionResult,
  type DiscoveredModel,
} from "../hooks/use-test-connection";
import { ProviderCard } from "./provider-card";
import { ProviderIcon, PROVIDER_COLORS } from "./provider-icons";
import {
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Zap,
  Eye,
  Wrench,
  X,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

type WizardStep = "choose" | "configure" | "validate" | "models";
type CategoryTab = "cloud" | "local" | "gateway";

interface ProviderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  onProviderAdded: () => void;
}

interface WizardFormState {
  label: string;
  baseUrl: string;
  apiKey: string;
  azureResourceName: string;
  azureApiVersion: string;
}

interface ModelSelection {
  modelId: string;
  selected: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatContextWindow(ctx?: number): string {
  if (!ctx) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(ctx % 1_000_000 === 0 ? 0 : 1)}M`;
  if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}K`;
  return String(ctx);
}

const STEP_LABELS: Record<WizardStep, string> = {
  choose: "Choose Provider",
  configure: "Configure",
  validate: "Validate",
  models: "Select Models",
};

const STEP_ORDER: WizardStep[] = ["choose", "configure", "validate", "models"];

// ─── Main Component ──────────────────────────────────────────

export function ProviderWizard({
  open,
  onOpenChange,
  workspaceId,
  onProviderAdded,
}: ProviderWizardProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>("choose");
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null);
  const [categoryTab, setCategoryTab] = useState<CategoryTab>("cloud");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [form, setForm] = useState<WizardFormState>({
    label: "",
    baseUrl: "",
    apiKey: "",
    azureResourceName: "",
    azureApiVersion: "2024-02-15-preview",
  });

  // Model selection state
  const [modelSelections, setModelSelections] = useState<ModelSelection[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hooks
  const { catalog, isLoading: catalogLoading, error: catalogError } = useProviderCatalog();
  const {
    testConnection,
    result: testResult,
    isLoading: testing,
    reset: resetTest,
  } = useTestConnection();

  // ─── Reset wizard when closed ──────────────────────────────

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        setStep("choose");
        setSelectedPreset(null);
        setCategoryTab("cloud");
        setSearchQuery("");
        setForm({
          label: "",
          baseUrl: "",
          apiKey: "",
          azureResourceName: "",
          azureApiVersion: "2024-02-15-preview",
        });
        setModelSelections([]);
        setDefaultModelId(null);
        setSaving(false);
        setSaveError(null);
        resetTest();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetTest],
  );

  // ─── Filtered catalog ──────────────────────────────────────

  const filteredProviders = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return catalog.filter((p) => {
      if (p.category !== categoryTab) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some((t) => t.toLowerCase().includes(query))
      );
    });
  }, [catalog, categoryTab, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts = { cloud: 0, local: 0, gateway: 0 };
    for (const p of catalog) {
      counts[p.category]++;
    }
    return counts;
  }, [catalog]);

  // ─── Step 1: Choose Provider ───────────────────────────────

  const handleSelectPreset = useCallback((preset: ProviderPreset) => {
    setSelectedPreset(preset);

    // Pre-fill form
    let baseUrl = preset.defaultBaseUrl;
    if (preset.id === "azure-openai" && preset.baseUrlTemplate) {
      baseUrl = "";
    }

    setForm({
      label: preset.name,
      baseUrl,
      apiKey: "",
      azureResourceName: "",
      azureApiVersion: "2024-02-15-preview",
    });

    // Pre-fill model selections from default models
    if (preset.defaultModels.length > 0) {
      setModelSelections(
        preset.defaultModels.map((m) => ({ modelId: m.id, selected: true })),
      );
      const powerful = preset.defaultModels.find((m) => m.tier === "balanced");
      const first = preset.defaultModels[0];
      setDefaultModelId((powerful ?? first)?.id ?? null);
    } else {
      setModelSelections([]);
      setDefaultModelId(null);
    }

    setStep("configure");
  }, []);

  // ─── Step 2: Configure ────────────────────────────────────

  const updateForm = useCallback(
    (field: keyof WizardFormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const resolvedBaseUrl = useMemo(() => {
    if (!selectedPreset?.baseUrlTemplate || !form.azureResourceName) return form.baseUrl;
    return selectedPreset.defaultBaseUrl.replace("{resource}", form.azureResourceName);
  }, [selectedPreset, form.baseUrl, form.azureResourceName]);

  const canProceedToConfigure =
    form.label.trim() &&
    (form.baseUrl.trim() || (selectedPreset?.baseUrlTemplate && form.azureResourceName.trim()));

  // ─── Step 3: Validate ─────────────────────────────────────

  const handleTestConnection = useCallback(async () => {
    if (!selectedPreset) return;
    const baseUrl = selectedPreset.baseUrlTemplate ? resolvedBaseUrl : form.baseUrl;

    const result = await testConnection({
      type: selectedPreset.sdkType,
      baseUrl,
      apiKey: form.apiKey || undefined,
      bearerToken:
        selectedPreset.authMethod === "bearer" ? form.apiKey || undefined : undefined,
      azure:
        selectedPreset.sdkType === "azure"
          ? { apiVersion: form.azureApiVersion }
          : undefined,
    });

    // If models were discovered, update model selections
    if (result?.ok && result.models && result.models.length > 0) {
      const newSelections = result.models.map((m) => ({
        modelId: m.id,
        selected: true,
      }));
      setModelSelections(newSelections);
      if (!defaultModelId || !result.models.some((m) => m.id === defaultModelId)) {
        setDefaultModelId(result.models[0]?.id ?? null);
      }
    }
  }, [selectedPreset, form, resolvedBaseUrl, testConnection, defaultModelId]);

  // ─── Step 4: Select Models & Save ─────────────────────────

  const toggleModel = useCallback((modelId: string) => {
    setModelSelections((prev) =>
      prev.map((m) =>
        m.modelId === modelId ? { ...m, selected: !m.selected } : m,
      ),
    );
  }, []);

  const selectAllModels = useCallback((selected: boolean) => {
    setModelSelections((prev) => prev.map((m) => ({ ...m, selected })));
  }, []);

  const selectedModelCount = modelSelections.filter((m) => m.selected).length;

  // Merge discovered models with preset defaults for display
  const displayModels = useMemo(() => {
    if (!selectedPreset) return [];

    // Build a map of preset model data for enrichment
    const presetMap = new Map<string, ModelPreset>();
    for (const m of selectedPreset.defaultModels) {
      presetMap.set(m.id, m);
    }

    // Build from discovered models if available, else from selections
    const discoveredModels = testResult?.models ?? [];
    const discoveredMap = new Map<string, DiscoveredModel>();
    for (const m of discoveredModels) {
      discoveredMap.set(m.id, m);
    }

    return modelSelections.map((sel) => {
      const discovered = discoveredMap.get(sel.modelId);
      const preset = presetMap.get(sel.modelId);
      return {
        id: sel.modelId,
        name: discovered?.name ?? preset?.name ?? sel.modelId,
        contextWindow: discovered?.contextWindow ?? preset?.contextWindow,
        supportsVision: discovered?.capabilities?.vision ?? preset?.supportsVision ?? false,
        supportsTools: discovered?.capabilities?.tools ?? preset?.supportsTools ?? false,
        tier: preset?.tier,
        selected: sel.selected,
      };
    });
  }, [modelSelections, testResult, selectedPreset]);

  const handleSave = useCallback(async () => {
    if (!workspaceId || !selectedPreset) return;
    setSaving(true);
    setSaveError(null);

    try {
      const baseUrl = selectedPreset.baseUrlTemplate ? resolvedBaseUrl : form.baseUrl;

      await apiFetch(`/workspaces/${workspaceId}/ai-settings/providers`, {
        method: "POST",
        body: JSON.stringify({
          label: form.label.trim(),
          providerType: selectedPreset.sdkType,
          baseUrl,
          apiKey: form.apiKey || undefined,
          azureApiVersion:
            selectedPreset.sdkType === "azure" ? form.azureApiVersion : undefined,
        }),
      });

      onProviderAdded();
      handleOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save provider");
    } finally {
      setSaving(false);
    }
  }, [
    workspaceId,
    selectedPreset,
    form,
    resolvedBaseUrl,
    onProviderAdded,
    handleOpenChange,
  ]);

  // ─── Navigation ────────────────────────────────────────────

  const goBack = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    const prev = idx > 0 ? STEP_ORDER[idx - 1] : undefined;
    if (prev) setStep(prev);
  }, [step]);

  const goNext = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (step === "configure") {
      setStep("validate");
      return;
    }
    const next = idx < STEP_ORDER.length - 1 ? STEP_ORDER[idx + 1] : undefined;
    if (next) setStep(next);
  }, [step]);

  const stepIndex = STEP_ORDER.indexOf(step);

  // ─── Render ────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with step indicator + close button */}
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-zinc-100">Add Provider</DialogTitle>
              <DialogDescription className="text-zinc-500">
                {STEP_LABELS[step]}
                {selectedPreset && step !== "choose" && (
                  <> — {selectedPreset.name}</>
                )}
              </DialogDescription>
            </div>
            <button
              onClick={() => handleOpenChange(false)}
              className="rounded-md p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1 py-2">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? "bg-brand-500" : "bg-zinc-800"
                }`}
              />
            </div>
          ))}
        </div>

        {/* Step content — scrollable area */}
        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {step === "choose" && (
            <StepChoose
              catalogLoading={catalogLoading}
              catalogError={catalogError}
              categoryTab={categoryTab}
              setCategoryTab={setCategoryTab}
              categoryCounts={categoryCounts}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              filteredProviders={filteredProviders}
              onSelect={handleSelectPreset}
            />
          )}

          {step === "configure" && selectedPreset && (
            <StepConfigure
              preset={selectedPreset}
              form={form}
              updateForm={updateForm}
            />
          )}

          {step === "validate" && selectedPreset && (
            <StepValidate
              preset={selectedPreset}
              testing={testing}
              result={testResult}
              onTest={handleTestConnection}
            />
          )}

          {step === "models" && selectedPreset && (
            <StepModels
              displayModels={displayModels}
              defaultModelId={defaultModelId}
              onToggle={toggleModel}
              onSelectAll={selectAllModels}
              onSetDefault={setDefaultModelId}
              selectedCount={selectedModelCount}
              saveError={saveError}
            />
          )}
        </div>

        {/* Footer navigation */}
        {step !== "choose" && (
          <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-2">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <div className="flex items-center gap-2">
              {step === "configure" && (
                <button
                  onClick={goNext}
                  disabled={!canProceedToConfigure}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
                >
                  Test Connection
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
              {step === "validate" && (
                <button
                  onClick={() => setStep("models")}
                  disabled={!testResult?.ok}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
                >
                  Select Models
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
              {step === "models" && (
                <button
                  onClick={handleSave}
                  disabled={saving || selectedModelCount === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Provider
                </button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// Step Sub-Components
// ═══════════════════════════════════════════════════════════════

// ─── Step 1: Choose ──────────────────────────────────────────

function StepChoose({
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
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
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
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search providers..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCategoryTab(key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              categoryTab === key
                ? "bg-brand-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {label}
            <span className="ml-1 text-[10px] opacity-70">
              ({categoryCounts[key] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* Provider grid */}
      {filteredProviders.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-zinc-500">
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

function StepConfigure({
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
      {/* Provider header with icon */}
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/40 p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={brandColor ? { backgroundColor: `${brandColor}18` } : { backgroundColor: "rgba(113,113,122,0.15)" }}
        >
          <ProviderIcon providerId={preset.id} size={28} />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-200">{preset.name}</p>
          <p className="text-xs text-zinc-500">{preset.description}</p>
        </div>
      </div>

      {/* Label */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">
          Label
        </label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => updateForm("label", e.target.value)}
          placeholder="My Provider"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
        />
      </div>

      {/* Azure resource name (template URL) */}
      {isAzure && preset.baseUrlTemplate && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            Azure Resource Name
          </label>
          <input
            type="text"
            value={form.azureResourceName}
            onChange={(e) => updateForm("azureResourceName", e.target.value)}
            placeholder="my-resource"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
          />
          {form.azureResourceName && (
            <p className="mt-1 text-xs text-zinc-500">
              URL: {preset.defaultBaseUrl.replace("{resource}", form.azureResourceName)}
            </p>
          )}
        </div>
      )}

      {/* Base URL */}
      {(!preset.baseUrlTemplate || !isAzure) && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            Base URL
          </label>
          <input
            type="text"
            value={form.baseUrl}
            onChange={(e) => updateForm("baseUrl", e.target.value)}
            placeholder={preset.defaultBaseUrl}
            disabled={!preset.baseUrlEditable}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500 disabled:opacity-60"
          />
          {isLocal && (
            <p className="mt-1 text-xs text-zinc-500">
              Default port: {new URL(preset.defaultBaseUrl).port || "80"}. Make sure the server is running.
            </p>
          )}
        </div>
      )}

      {/* Azure API version */}
      {isAzure && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            API Version
          </label>
          <input
            type="text"
            value={form.azureApiVersion}
            onChange={(e) => updateForm("azureApiVersion", e.target.value)}
            placeholder="2024-02-15-preview"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
          />
        </div>
      )}

      {/* API Key */}
      {requiresAuth && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            API Key
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => updateForm("apiKey", e.target.value)}
            placeholder={preset.apiKeyPlaceholder ?? "Enter API key"}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-brand-500"
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

      {/* No auth hint for local */}
      {!requiresAuth && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/50 p-3">
          <p className="text-xs text-zinc-400">
            No API key required. This provider runs locally on your machine.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Validate ───────────────────────────────────────

function StepValidate({
  preset,
  testing,
  result,
  onTest,
}: {
  preset: ProviderPreset;
  testing: boolean;
  result: TestConnectionResult | null;
  onTest: () => void;
}) {
  const brandColor = PROVIDER_COLORS[preset.id];

  return (
    <div className="space-y-4">
      {/* Provider header with icon */}
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/40 p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={brandColor ? { backgroundColor: `${brandColor}18` } : { backgroundColor: "rgba(113,113,122,0.15)" }}
        >
          <ProviderIcon providerId={preset.id} size={28} />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-200">{preset.name}</p>
          <p className="text-xs text-zinc-500">Validate connection</p>
        </div>
      </div>

      {/* Test button */}
      <div className="flex flex-col items-center py-6">
        {!result && !testing && (
          <>
            <p className="mb-4 text-sm text-zinc-400 text-center">
              Test the connection to {preset.name} to verify your configuration.
            </p>
            <button
              onClick={onTest}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Test Connection
            </button>
          </>
        )}

        {testing && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            <p className="text-sm text-zinc-400">Testing connection...</p>
          </div>
        )}

        {result && !testing && (
          <div className="w-full space-y-4">
            {result.ok ? (
              <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <CheckCircle className="h-6 w-6 shrink-0 text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-300">
                    Connection successful
                  </p>
                  <p className="mt-0.5 text-xs text-green-400/80">
                    Latency: {result.latencyMs}ms
                    {result.models && result.models.length > 0 && (
                      <> — {result.models.length} model{result.models.length !== 1 ? "s" : ""} discovered</>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <XCircle className="h-6 w-6 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">
                    Connection failed
                  </p>
                  <p className="mt-0.5 text-xs text-red-400/80">
                    {result.error || "Unknown error"}
                  </p>
                </div>
              </div>
            )}

            {/* Retry button */}
            <div className="flex justify-center">
              <button
                onClick={onTest}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Zap className="h-3 w-3" />
                Test Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Warnings from preset */}
      {preset.warnings && preset.warnings.length > 0 && (
        <div className="space-y-2">
          {preset.warnings.map((warning, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
              <p className="text-xs text-yellow-300/80">{warning}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 4: Select Models ──────────────────────────────────

function StepModels({
  displayModels,
  defaultModelId,
  onToggle,
  onSelectAll,
  onSetDefault,
  selectedCount,
  saveError,
}: {
  displayModels: {
    id: string;
    name: string;
    contextWindow?: number;
    supportsVision: boolean;
    supportsTools: boolean;
    tier?: string;
    selected: boolean;
  }[];
  defaultModelId: string | null;
  onToggle: (id: string) => void;
  onSelectAll: (selected: boolean) => void;
  onSetDefault: (id: string) => void;
  selectedCount: number;
  saveError: string | null;
}) {
  if (displayModels.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-zinc-400">
          No models available. The provider will be saved without model selections.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-400">
          {selectedCount} of {displayModels.length} models selected
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => onSelectAll(true)}
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={() => onSelectAll(false)}
            className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Model list */}
      <div className="space-y-1.5">
        {displayModels.map((model, index) => (
          <div
            key={`${model.id}-${index}`}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              model.selected
                ? "border-zinc-700 bg-zinc-800/80"
                : "border-zinc-800/50 bg-zinc-900/30 opacity-60"
            }`}
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={model.selected}
              onChange={() => onToggle(model.id)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-0 accent-brand-500"
            />

            {/* Model info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-200 truncate">
                  {model.name}
                </span>
                {model.contextWindow && (
                  <span className="shrink-0 rounded bg-zinc-700/50 px-1.5 py-0.5 text-[10px] text-zinc-400 tabular-nums">
                    {formatContextWindow(model.contextWindow)}
                  </span>
                )}
                {model.supportsVision && (
                  <span title="Vision">
                    <Eye className="h-3 w-3 shrink-0 text-zinc-500" />
                  </span>
                )}
                {model.supportsTools && (
                  <span title="Tool calling">
                    <Wrench className="h-3 w-3 shrink-0 text-zinc-500" />
                  </span>
                )}
                {model.tier && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      model.tier === "powerful"
                        ? "bg-purple-500/15 text-purple-400"
                        : model.tier === "balanced"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-green-500/15 text-green-400"
                    }`}
                  >
                    {model.tier}
                  </span>
                )}
              </div>
            </div>

            {/* Default radio */}
            {model.selected && (
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                <input
                  type="radio"
                  name="defaultModel"
                  checked={defaultModelId === model.id}
                  onChange={() => onSetDefault(model.id)}
                  className="h-3.5 w-3.5 border-zinc-600 bg-zinc-800 text-brand-500 focus:ring-brand-500 focus:ring-offset-0 accent-brand-500"
                />
                <span className="text-[10px] text-zinc-500">Default</span>
              </label>
            )}
          </div>
        ))}
      </div>

      {/* Save error */}
      {saveError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-xs text-red-400">{saveError}</p>
        </div>
      )}
    </div>
  );
}
