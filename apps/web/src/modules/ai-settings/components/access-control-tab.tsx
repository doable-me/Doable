"use client";

import { useState, useEffect } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider, ApiWorkspaceAiDefaults } from "@/lib/api";
import { Shield, Loader2, Check, Eye } from "lucide-react";
import { useCopilotModels } from "./model-config-hooks";

interface AccessControlTabProps {
  defaults: ApiWorkspaceAiDefaults | null;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  onUpdate: (data: {
    enforceAi?: boolean;
    enforcedCopilotAccountId?: string | null;
    enforcedProviderId?: string | null;
    enforcedModel?: string | null;
    showModelSelector?: boolean;
  }) => Promise<void>;
}

type Source = "copilot" | "custom";

export function AccessControlTab({ defaults, accounts, providers, onUpdate }: AccessControlTabProps) {
  const [enforceAi, setEnforceAi] = useState(false);
  const [source, setSource] = useState<Source>("copilot");
  const [copilotAccountId, setCopilotAccountId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Dynamic model list — replaces former static COPILOT_MODELS
  const activeCopilotId = source === "copilot" ? copilotAccountId : "";
  const { models: copilotModels } = useCopilotModels(activeCopilotId || undefined);

  // Sync from defaults
  useEffect(() => {
    if (defaults) {
      setEnforceAi(defaults.enforce_ai);
      setShowModelSelector(defaults.show_model_selector);
      const hasProvider = !!defaults.enforced_provider_id;
      setSource(hasProvider ? "custom" : "copilot");
      setCopilotAccountId(defaults.enforced_copilot_account_id ?? "");
      setProviderId(defaults.enforced_provider_id ?? "");
      setModel(defaults.enforced_model ?? "");
    }
  }, [defaults]);

  // Workspace enforcement can only target workspace-scoped rows. Personal
  // accounts/providers are filtered out so admins can't try to point a
  // workspace-wide enforcement at one (the DB trigger would reject the
  // INSERT/UPDATE, but the option shouldn't appear in the dropdown).
  // Migration 072.
  const validAccounts = accounts.filter((a) => a.is_valid && a.scope === "workspace");
  const validProviders = providers.filter((p) => p.is_valid && p.scope === "workspace");

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        enforceAi,
        enforcedCopilotAccountId: enforceAi && source === "copilot" ? (copilotAccountId || null) : null,
        enforcedProviderId: enforceAi && source === "custom" ? (providerId || null) : null,
        enforcedModel: enforceAi ? (model || null) : null,
        showModelSelector,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600/15">
            <Shield className="h-4 w-4 text-brand-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">AI Rules for Your Team</h3>
            <p className="text-xs text-muted-foreground">Lock everyone in your workspace to a specific AI model — no one can change it</p>
          </div>
        </div>

        {/* Enforce toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              onClick={() => setEnforceAi(!enforceAi)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enforceAi ? "bg-brand-600" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  enforceAi ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-foreground">Require everyone to use the same AI model</span>
          </label>
          <p className="text-xs text-muted-foreground mt-2 ml-14">
            When turned on, every workspace member uses the model you pick below. They won&apos;t be able to change it.
          </p>
        </div>

        {/* Enforced model configuration (only shown when enforcement is on) */}
        {enforceAi && (
          <div className="border-t border-border pt-4 mt-4 space-y-4">
            {/* Source toggle */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Provider Source</label>
              <div className="flex rounded-lg border border-border overflow-hidden w-fit">
                <button
                  onClick={() => { setSource("copilot"); setProviderId(""); }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    source === "copilot"
                      ? "bg-brand-600 text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  GitHub Copilot
                </button>
                <button
                  onClick={() => { setSource("custom"); setCopilotAccountId(""); }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    source === "custom"
                      ? "bg-brand-600 text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Custom Provider
                </button>
              </div>
            </div>

            {/* Source-specific config */}
            <div className="grid grid-cols-2 gap-3">
              {source === "copilot" ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account</label>
                    <select
                      value={copilotAccountId}
                      onChange={(e) => setCopilotAccountId(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                    >
                      <option value="">Server Default</option>
                      {validAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>
                      ))}
                    </select>
                    {copilotAccountId === "" && (
                      <p className="text-[10px] text-muted-foreground mt-1">Uses the server&apos;s built-in GitHub authentication.</p>
                    )}
                    {validAccounts.length === 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">No accounts connected yet. Go to the Connections tab to add one.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                    >
                      {copilotModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Provider</label>
                    <select
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                    >
                      <option value="">Select a provider...</option>
                      {validProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>
                      ))}
                    </select>
                    {validProviders.length === 0 && (
                      <p className="text-[10px] text-muted-foreground mt-1">No providers set up yet. Go to the Connections tab to add one.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. gpt-4o"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Model Selector Visibility */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/15">
            <Eye className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Let Members Choose Their Model</h3>
            <p className="text-xs text-muted-foreground">Show or hide the model picker in the editor for workspace members</p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <button
            onClick={() => setShowModelSelector(!showModelSelector)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showModelSelector ? "bg-blue-600" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                showModelSelector ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-foreground">Show model picker to workspace members</span>
        </label>
        <p className="text-xs text-muted-foreground mt-2 ml-14">
          When turned off, members won&apos;t see which model they&apos;re using. The workspace default (or enforced model) runs automatically in the background.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
        {saved ? "Saved!" : "Save Policy"}
      </button>
    </div>
  );
}
