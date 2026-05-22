"use client";

import { useState } from "react";
import type { ApiGitHubCopilotAccount, ApiAiProvider, ApiWorkspaceAiDefaults } from "@/lib/api";
import { Bot, Loader2, Check } from "lucide-react";

interface Props {
  workspaceId: string | null;
  defaults: ApiWorkspaceAiDefaults | null;
  loading: boolean;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  onUpdate: (data: {
    defaultCopilotAccountId?: string | null;
    defaultProviderId?: string | null;
    defaultModel?: string | null;
  }) => Promise<void>;
}

const COMMON_MODELS = [
  "claude-sonnet-4",
  "claude-sonnet-4-5",
  "gpt-4o",
  "gpt-4o-mini",
  "o3-mini",
  "o4-mini",
];

export function ModelDefaultsTab({ workspaceId, defaults, loading, accounts, providers, onUpdate }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [model, setModel] = useState(defaults?.default_model ?? "");
  const [copilotAccountId, setCopilotAccountId] = useState(defaults?.default_copilot_account_id ?? "");
  const [providerId, setProviderId] = useState(defaults?.default_provider_id ?? "");

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate({
        defaultModel: model || null,
        defaultCopilotAccountId: copilotAccountId || null,
        defaultProviderId: providerId || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Default Model</h2>
        <p className="text-sm text-muted-foreground">
          Set the workspace-level default model and provider for new sessions.
        </p>
      </div>

      <div className="space-y-4 max-w-lg">
        {/* Default Model */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
          >
            <option value="">Default (auto)</option>
            {COMMON_MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Default Copilot Account */}
        {accounts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">GitHub Copilot Account</label>
            <select
              value={copilotAccountId}
              onChange={(e) => setCopilotAccountId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
            >
              <option value="">Default (gh CLI)</option>
              {accounts.filter((a) => a.is_valid && a.scope === "workspace").map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} (@{a.github_login})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Default Provider */}
        {providers.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Custom Provider</label>
            <select
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
            >
              <option value="">None (use Copilot)</option>
              {providers.filter((p) => p.is_valid && p.scope === "workspace").map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.provider_type})
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
          {saved ? "Saved!" : "Save Defaults"}
        </button>
      </div>
    </div>
  );
}
