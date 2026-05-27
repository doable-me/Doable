"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ProviderPreset } from "@doable/shared";
import { useProviderCatalog } from "../hooks/use-provider-catalog";
import { useTestConnection } from "../hooks/use-test-connection";
import { Loader2, ChevronLeft, ChevronRight, X, User as UserIcon, Users as UsersIcon, Lock } from "lucide-react";
import type { WizardStep, CategoryTab, ProviderWizardProps, WizardFormState } from "./provider-wizard-types";
import { STEP_LABELS, STEP_ORDER, INITIAL_FORM_STATE } from "./provider-wizard-types";
import { StepChoose, StepConfigure, StepValidate, StepModels } from "./provider-wizard-steps";
import { useProviderWizardModels } from "./use-provider-wizard-models";

// ─── Main Component ──────────────────────────────────────────
export function ProviderWizard({
  open,
  onOpenChange,
  workspaceId,
  onProviderAdded,
  scope: initialScope,
  isWorkspaceAdmin = false,
}: ProviderWizardProps) {
  // Default scope: admins almost always configure AI for the team, so when no
  // explicit scope is requested we default them to 'workspace'. Non-admins are
  // always locked to 'user'. An explicit initialScope (from the Add Personal /
  // Add for workspace buttons) overrides the admin default. Migration 072.
  const defaultScope: "user" | "workspace" = isWorkspaceAdmin
    ? (initialScope ?? "workspace")
    : "user";
  // Live scope — initialized on open, mutable via the toggle when admin.
  const [scope, setScope] = useState<"user" | "workspace">(defaultScope);
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

  // Hooks
  const { catalog, isLoading: catalogLoading, error: catalogError } = useProviderCatalog();
  const {
    testConnection,
    result: testResult,
    isLoading: testing,
    reset: resetTest,
  } = useTestConnection();

  const resolvedBaseUrl = useMemo(() => {
    if (!selectedPreset?.baseUrlTemplate || !form.azureResourceName) return form.baseUrl;
    return selectedPreset.defaultBaseUrl.replace("{resource}", form.azureResourceName);
  }, [selectedPreset, form.baseUrl, form.azureResourceName]);

  const {
    modelSelections,
    defaultModelId,
    setDefaultModelId,
    saving,
    saveError,
    resetModelState,
    initFromPreset,
    toggleModel,
    selectAllModels,
    selectedModelCount,
    displayModels,
    handleTestConnection,
    handleSave,
  } = useProviderWizardModels(
    selectedPreset, form, resolvedBaseUrl, testResult,
    testConnection, workspaceId, onProviderAdded,
    // handleOpenChange defined below — we pass a stable ref via useCallback
    (open: boolean) => handleOpenChangeRef.current(open),
    scope,
  );

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
        resetModelState();
        resetTest();
      }
      onOpenChange(newOpen);
    },
    [onOpenChange, resetTest, resetModelState],
  );

  // Stable ref so the models hook can call handleOpenChange without circular deps
  const handleOpenChangeRef = useRef(handleOpenChange);
  handleOpenChangeRef.current = handleOpenChange;

  // When the wizard opens, snap scope to whatever the parent passed.
  // (The Add Personal / Add for workspace buttons in CustomProvidersTab
  // each pass a different initialScope, and the user can flip it inside
  // the wizard via the toggle when admin.)
  useEffect(() => {
    if (open) {
      setScope(defaultScope);
    }
  }, [open, defaultScope]);

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

    initFromPreset(preset);

    setStep("configure");
  }, []);

  // ─── Step 2: Configure ────────────────────────────────────

  const updateForm = useCallback(
    (field: keyof WizardFormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const canProceedToConfigure =
    form.label.trim() &&
    (form.baseUrl.trim() || (selectedPreset?.baseUrlTemplate && form.azureResourceName.trim()));

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
              <DialogTitle>Add Provider</DialogTitle>
              <DialogDescription>
                {STEP_LABELS[step]}
                {selectedPreset && step !== "choose" && (
                  <> — {selectedPreset.name}</>
                )}
              </DialogDescription>
            </div>
            <button
              onClick={() => handleOpenChange(false)}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </DialogHeader>

        {/* Scope toggle (Personal vs Workspace).
            - Members see a static lock chip explaining personal-only.
            - Admins see two radios; selection lives in component state and
              flows into the POST body via the models hook. Locked once
              past the choose step so a mid-wizard switch doesn't silently
              re-target an in-flight provider creation. */}
        {isWorkspaceAdmin ? (
          <div className="flex items-center gap-2 px-1 pt-1 text-xs">
            <span className="text-muted-foreground">Add as:</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => step === "choose" && setScope("user")}
                disabled={step !== "choose"}
                className={`flex items-center gap-1 px-2.5 py-1 transition-colors ${
                  scope === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-background text-muted-foreground hover:bg-accent disabled:opacity-50"
                }`}
                title={step === "choose" ? "Visible only to you" : "Pick at the start of the wizard"}
              >
                <UserIcon className="h-3 w-3" />
                Personal
              </button>
              <button
                type="button"
                onClick={() => step === "choose" && setScope("workspace")}
                disabled={step !== "choose"}
                className={`flex items-center gap-1 px-2.5 py-1 transition-colors border-l border-border ${
                  scope === "workspace"
                    ? "bg-brand-600 text-white"
                    : "bg-background text-muted-foreground hover:bg-accent disabled:opacity-50"
                }`}
                title={step === "choose" ? "Shared with all workspace members" : "Pick at the start of the wizard"}
              >
                <UsersIcon className="h-3 w-3" />
                Workspace
              </button>
            </div>
            {step !== "choose" && (
              <span className="text-[10px] text-muted-foreground">locked for this run</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-1 pt-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            <span>Adding as personal — visible only to you.</span>
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1 py-2">
          {STEP_ORDER.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= stepIndex ? "bg-brand-500" : "bg-secondary"
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
          <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
            <button
              onClick={goBack}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
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

