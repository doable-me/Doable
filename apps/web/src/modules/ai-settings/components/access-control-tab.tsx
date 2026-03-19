"use client";

import { useState, useEffect } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider, ApiWorkspaceAiDefaults } from "@/lib/api";
import { Shield, Loader2, Check, Eye } from "lucide-react";

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

const COPILOT_MODELS = [
  { id: "", label: "Auto (recommended)" },
  { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini" },
  { id: "o3-mini", label: "o3-mini" },
  { id: "o4-mini", label: "o4-mini" },
];

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

  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);

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
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600/15">
            <Shield className="h-4 w-4 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Enforcement Policy</h3>
            <p className="text-xs text-zinc-500">Control which AI model all workspace members must use</p>
          </div>
        </div>

        {/* Enforce toggle */}
        <div className="mb-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              onClick={() => setEnforceAi(!enforceAi)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enforceAi ? "bg-orange-600" : "bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  enforceAi ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm text-zinc-200">Enforce AI configuration for all workspace members</span>
          </label>
          <p className="text-xs text-zinc-500 mt-2 ml-14">
            When enabled, all members will use the model you specify below. Their personal preferences will be overridden.
          </p>
        </div>

        {/* Enforced model configuration (only shown when enforcement is on) */}
        {enforceAi && (
          <div className="border-t border-zinc-800 pt-4 mt-4 space-y-4">
            {/* Source toggle */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">Provider Source</label>
              <div className="flex rounded-lg border border-zinc-700 overflow-hidden w-fit">
                <button
                  onClick={() => { setSource("copilot"); setProviderId(""); }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    source === "copilot"
                      ? "bg-orange-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  GitHub Copilot
                </button>
                <button
                  onClick={() => { setSource("custom"); setCopilotAccountId(""); }}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    source === "custom"
                      ? "bg-orange-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
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
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Account</label>
                    <select
                      value={copilotAccountId}
                      onChange={(e) => setCopilotAccountId(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500"
                    >
                      <option value="">Default (gh CLI)</option>
                      {validAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>
                      ))}
                    </select>
                    {validAccounts.length === 0 && (
                      <p className="text-[10px] text-zinc-600 mt-1">No accounts connected. Add one in Connections tab.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500"
                    >
                      {COPILOT_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Provider</label>
                    <select
                      value={providerId}
                      onChange={(e) => setProviderId(e.target.value)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-orange-500"
                    >
                      <option value="">Select a provider...</option>
                      {validProviders.map((p) => (
                        <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>
                      ))}
                    </select>
                    {validProviders.length === 0 && (
                      <p className="text-[10px] text-zinc-600 mt-1">No providers configured. Add one in Connections tab.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Model</label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder="e.g. gpt-4o"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-orange-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Model Selector Visibility */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/15">
            <Eye className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Model Selector Visibility</h3>
            <p className="text-xs text-zinc-500">Control whether users can see the model selection dropdown</p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <button
            onClick={() => setShowModelSelector(!showModelSelector)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              showModelSelector ? "bg-blue-600" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                showModelSelector ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm text-zinc-200">Allow users to see the model selector</span>
        </label>
        <p className="text-xs text-zinc-500 mt-2 ml-14">
          When disabled, users will not see the model dropdown in the editor. The workspace default or enforced model will be used silently.
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
        {saved ? "Saved!" : "Save Policy"}
      </button>
    </div>
  );
}
