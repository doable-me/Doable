import { useState, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { ProviderPreset, ModelPreset } from "@doable/shared";
import type { TestConnectionResult, DiscoveredModel, TestConnectionParams } from "../hooks/use-test-connection";
import type { WizardFormState, ModelSelection } from "./provider-wizard-types";

export function useProviderWizardModels(
  selectedPreset: ProviderPreset | null,
  form: WizardFormState,
  resolvedBaseUrl: string,
  testResult: TestConnectionResult | null,
  testConnection: (params: TestConnectionParams) => Promise<TestConnectionResult | null>,
  workspaceId: string | null,
  onProviderAdded: () => void,
  handleOpenChange: (open: boolean) => void,
  /** Personal vs workspace scope. Migration 072. */
  scope: "user" | "workspace" = "user",
) {
  const [modelSelections, setModelSelections] = useState<ModelSelection[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const resetModelState = useCallback(() => {
    setModelSelections([]);
    setDefaultModelId(null);
    setSaving(false);
    setSaveError(null);
  }, []);

  const initFromPreset = useCallback((preset: ProviderPreset) => {
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
  }, []);

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

  const displayModels = useMemo(() => {
    if (!selectedPreset) return [];

    const presetMap = new Map<string, ModelPreset>();
    for (const m of selectedPreset.defaultModels) {
      presetMap.set(m.id, m);
    }

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
      presetId: selectedPreset.id,
    });

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
          presetId: selectedPreset.id,
          scope,
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
    scope,
  ]);

  return {
    modelSelections,
    setModelSelections,
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
  };
}
