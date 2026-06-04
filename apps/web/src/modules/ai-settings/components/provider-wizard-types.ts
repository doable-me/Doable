import type { ProviderPreset } from "@doable/shared";

// ─── Types ───────────────────────────────────────────────────

export type WizardStep = "choose" | "configure" | "validate" | "models";
export type CategoryTab = "cloud" | "local" | "gateway";

export interface ProviderWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  onProviderAdded: () => void;
  /**
   * Initial scope when the wizard opens. The user can flip it via the
   * in-wizard toggle if `isWorkspaceAdmin` is true.
   * Migration 072 / Personal-scope feature.
   */
  scope?: "user" | "workspace";
  /**
   * Whether the caller is owner/admin of the workspace. Controls whether
   * the in-wizard scope toggle exposes the "Workspace" option. When false,
   * the wizard is locked to scope='user'.
   */
  isWorkspaceAdmin?: boolean;
}

export interface WizardFormState {
  label: string;
  baseUrl: string;
  apiKey: string;
  azureResourceName: string;
  azureApiVersion: string;
}

export interface ModelSelection {
  modelId: string;
  selected: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

export function formatContextWindow(ctx?: number): string {
  if (!ctx) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(ctx % 1_000_000 === 0 ? 0 : 1)}M`;
  if (ctx >= 1_000) return `${Math.round(ctx / 1_000)}K`;
  return String(ctx);
}

export const STEP_LABELS: Record<WizardStep, string> = {
  choose: "Choose Provider",
  configure: "Configure",
  validate: "Validate",
  models: "Select Models",
};

export const STEP_ORDER: WizardStep[] = ["choose", "configure", "validate", "models"];

export const INITIAL_FORM_STATE: WizardFormState = {
  label: "",
  baseUrl: "",
  apiKey: "",
  azureResourceName: "",
  azureApiVersion: "2024-02-15-preview",
};

// ─── Synthetic "Custom OpenAI-compatible" provider ───────────
// NOT part of the server catalog (/ai/provider-catalog). The wizard injects
// this as a first-class option so users can add ANY OpenAI-compatible endpoint
// (vLLM, LM Studio, LiteLLM, self-hosted proxies, …) AFTER setup — the same
// capability the setup wizard exposes via its byok-custom tile, which was
// otherwise unreachable once the wizard was skipped/finished. It reuses the
// normal configure→validate→models pipeline: editable base URL + optional API
// key, with model discovery via the endpoint's /v1/models. The backend already
// accepts providerType:"openai" + a custom baseUrl, so no API change is needed.
export const CUSTOM_OPENAI_PROVIDER_ID = "custom-openai-compatible";

export const CUSTOM_OPENAI_PRESET: ProviderPreset = {
  id: CUSTOM_OPENAI_PROVIDER_ID,
  name: "Custom OpenAI-compatible URL",
  category: "gateway",
  subcategory: "infrastructure",
  sdkType: "openai",
  defaultBaseUrl: "https://api.example.com/v1",
  baseUrlEditable: true,
  authMethod: "api-key",
  apiKeyPlaceholder: "sk-… (leave blank for keyless local servers)",
  supportsModelDiscovery: true,
  defaultModels: [],
  icon: "byok",
  description: "Paste any /v1 base URL + key (vLLM, LM Studio, LiteLLM, proxies, …)",
  capabilities: {
    streaming: true,
    toolCalling: true,
    vision: false,
    imageGeneration: false,
    video: false,
    audio: false,
    mcp: false,
  },
  tags: ["custom", "openai-compatible", "byok", "self-hosted"],
};
