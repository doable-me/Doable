"use client";

import { useState, useEffect, useRef } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import {
  HelpCircle,
  Github,
  Plus,
  Eye,
  Wrench,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  CUSTOM_MODEL_SENTINEL,
  type ModelSectionState,
  type ProviderModelInfo,
} from "./model-config-hooks";

// ─── HelpTooltip ────────────────────────────────────────────

export function HelpTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Help"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 rounded-lg border border-border bg-popover px-4 py-3 text-xs text-popover-foreground leading-relaxed shadow-xl">
          <div className="absolute left-1/2 -translate-x-1/2 -top-1.5 h-3 w-3 rotate-45 border-l border-t border-border bg-popover" />
          {text}
        </div>
      )}
    </div>
  );
}

// ─── ModelCapabilityBadges ──────────────────────────────────

export function ModelCapabilityBadges({ model }: { model?: ProviderModelInfo }) {
  if (!model) return null;
  const badges: { label: string; icon: React.ElementType }[] = [];
  if (model.supportsVision) badges.push({ label: "Vision", icon: Eye });
  if (model.supportsTools) badges.push({ label: "Tool calling", icon: Wrench });
  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {badges.map((b) => (
        <span
          key={b.label}
          className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground"
        >
          <b.icon className="h-2.5 w-2.5" />
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ─── InlineConfigFields ────────────────────────────────────

export function InlineConfigFields({
  state,
  onChange,
  accounts,
  providers,
  copilotModels,
  workspaceId,
  providerModels,
  providerModelsLoading,
  onRefreshModels,
  onAddProviderClick,
  scopeFilter,
}: {
  state: ModelSectionState;
  onChange: (state: ModelSectionState) => void;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  copilotModels: { id: string; label: string }[];
  workspaceId: string | null;
  providerModels: ProviderModelInfo[];
  providerModelsLoading: boolean;
  onRefreshModels?: () => void;
  onAddProviderClick?: () => void;
  // "workspace" hides personal providers — required for the workspace-defaults
  // sections, which the DB rejects from referencing scope='user' rows. Default
  // "all" applies to personal overrides where personal providers are valid.
  scopeFilter?: "all" | "workspace";
}) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const validAccounts = accounts.filter(
    (a) => a.is_valid && (scopeFilter === "workspace" ? a.scope === "workspace" : true),
  );
  const validProviders = providers.filter(
    (p) => p.is_valid && (scopeFilter === "workspace" ? p.scope === "workspace" : true),
  );

  const [customModelMode, setCustomModelMode] = useState(false);

  useEffect(() => {
    setCustomModelMode(false);
  }, [state.providerId]);

  const modelInList = providerModels.some((m) => m.id === state.providerModel);
  const showModelDropdown =
    state.source === "custom" &&
    state.providerId &&
    providerModels.length > 0 &&
    !customModelMode;

  return (
    <>
      {/* Source toggle */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
          Provider Source
        </label>
        <div className="flex rounded-lg border border-border overflow-hidden w-fit">
          <button
            onClick={() => onChange({ ...state, source: "copilot" })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              state.source === "copilot"
                ? "bg-brand-600 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            GitHub Copilot
          </button>
          <button
            onClick={() => onChange({ ...state, source: "custom" })}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              state.source === "custom"
                ? "bg-brand-600 text-white"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            Custom Provider
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">
          Both configurations are saved. Switching tabs only changes which one is active —
          your other tab&apos;s selection is kept.
        </p>
      </div>

      {/* Source-specific config */}
      <div className="grid grid-cols-2 gap-3">
        {state.source === "copilot" ? (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account</label>
              <div className="flex gap-2">
                <select
                  value={state.copilotAccountId}
                  onChange={(e) => onChange({ ...state, copilotAccountId: e.target.value })}
                  className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                >
                  <option value="">Server Default</option>
                  {validAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} (@{a.github_login})
                    </option>
                  ))}
                </select>
                <a
                  href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
                  className="flex items-center gap-1 shrink-0 rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                  title="Connect GitHub Account"
                >
                  <Plus className="h-3 w-3" />
                  <Github className="h-3.5 w-3.5" />
                </a>
              </div>
              {state.copilotAccountId === "" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Uses the server&apos;s built-in GitHub authentication. Connect your own account for more control.
                </p>
              )}
              {validAccounts.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  No accounts connected.{" "}
                  <a
                    href={`${API_URL}/auth/github/copilot${workspaceId ? `?workspaceId=${workspaceId}` : ""}`}
                    className="text-brand-400 hover:text-brand-300 underline"
                  >
                    Connect one
                  </a>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Model</label>
              <select
                value={state.copilotModel}
                onChange={(e) => onChange({ ...state, copilotModel: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
              >
                {copilotModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Provider</label>
              <div className="flex gap-2">
                <select
                  value={state.providerId}
                  onChange={(e) => onChange({ ...state, providerId: e.target.value, providerModel: "" })}
                  className="flex-1 min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                >
                  <option value="">Select a provider...</option>
                  {validProviders.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.provider_type})
                    </option>
                  ))}
                </select>
                {onAddProviderClick && (
                  <button
                    onClick={onAddProviderClick}
                    className="flex items-center gap-1 shrink-0 rounded-lg border border-input bg-background px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
                    title="Add Provider"
                  >
                    <Plus className="h-3 w-3" />
                    Add
                  </button>
                )}
              </div>
              {validProviders.length === 0 && onAddProviderClick && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  No providers configured.{" "}
                  <button
                    onClick={onAddProviderClick}
                    className="text-brand-400 hover:text-brand-300 underline"
                  >
                    Add your first provider
                  </button>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Model</label>
              {providerModelsLoading && state.providerId ? (
                <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading models...
                </div>
              ) : showModelDropdown ? (
                <>
                  <select
                    value={modelInList ? state.providerModel : CUSTOM_MODEL_SENTINEL}
                    onChange={(e) => {
                      if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                        setCustomModelMode(true);
                        onChange({ ...state, providerModel: "" });
                      } else {
                        onChange({ ...state, providerModel: e.target.value });
                      }
                    }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                  >
                    <option value="">Select a model...</option>
                    {providerModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                        {m.supportsVision ? " [vision]" : ""}
                        {m.supportsTools ? " [tools]" : ""}
                      </option>
                    ))}
                    <option value={CUSTOM_MODEL_SENTINEL}>Type custom model ID...</option>
                  </select>
                  {state.providerModel && modelInList && (
                    <ModelCapabilityBadges model={providerModels.find((m) => m.id === state.providerModel)} />
                  )}
                </>
              ) : (
                <>
                  <input
                    type="text"
                    value={state.providerModel}
                    onChange={(e) => onChange({ ...state, providerModel: e.target.value })}
                    placeholder={state.providerId ? "e.g. gpt-4o" : "Select a provider first"}
                    disabled={!state.providerId}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500 disabled:opacity-50"
                  />
                  {customModelMode && providerModels.length > 0 && (
                    <button
                      onClick={() => setCustomModelMode(false)}
                      className="text-[10px] text-brand-400 hover:text-brand-300 mt-1"
                    >
                      Back to model list
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── ModelSection Card ──────────────────────────────────────

export function ModelSection({
  title,
  description,
  icon: Icon,
  state,
  onChange,
  accounts,
  providers,
  copilotModels,
  helpText,
  workspaceId,
  providerModels,
  providerModelsLoading,
  onRefreshModels,
  onAddProviderClick,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  state: ModelSectionState;
  onChange: (state: ModelSectionState) => void;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  copilotModels: { id: string; label: string }[];
  helpText?: string;
  workspaceId: string | null;
  providerModels: ProviderModelInfo[];
  providerModelsLoading: boolean;
  onRefreshModels?: () => void;
  onAddProviderClick?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
          <Icon className="h-4 w-4 text-brand-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {helpText && <HelpTooltip text={helpText} />}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <InlineConfigFields
        state={state}
        onChange={onChange}
        accounts={accounts}
        providers={providers}
        copilotModels={copilotModels}
        workspaceId={workspaceId}
        providerModels={providerModels}
        providerModelsLoading={providerModelsLoading}
        onRefreshModels={onRefreshModels}
        onAddProviderClick={onAddProviderClick}
        scopeFilter="workspace"
      />
    </div>
  );
}
