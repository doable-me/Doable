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
