"use client";

import { useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import type { ApiUserAiAllocation, ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";

// ─── Helpers ────────────────────────────────────────────────

type Source = "copilot" | "custom";

export function rowHasAllocation(row: ApiUserAiAllocation): boolean {
  if (row.source === "custom") return !!row.provider_id;
  if (row.source === "copilot") return !!row.copilot_account_id;
  return !!(row.copilot_account_id || row.provider_id);
}

export function rowActiveModel(row: ApiUserAiAllocation): string | null {
  if (row.source === "custom") return row.provider_model;
  if (row.source === "copilot") return row.copilot_model;
  return row.copilot_model ?? row.provider_model;
}

export function AllocationStatus({ row }: { row: ApiUserAiAllocation }) {
  if (!rowHasAllocation(row)) {
    return <span className="text-xs text-muted-foreground">Using workspace defaults</span>;
  }
  if (row.source === "custom" && row.provider_id) {
    return (
      <span className="text-xs text-blue-400">
        {row.provider_type ? row.provider_type.charAt(0).toUpperCase() + row.provider_type.slice(1) : "Provider"}: {row.provider_label ?? "Unknown"}
      </span>
    );
  }
  if (row.copilot_account_id) {
    return (
      <span className="text-xs text-emerald-400">
        Copilot: {row.copilot_account_label ?? "Unknown"}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">--</span>;
}

// ─── Edit Allocation Modal ──────────────────────────────────

export function EditAllocationModal({
  row,
  validAccounts,
  validProviders,
  onSave,
  onCancel,
}: {
  row: ApiUserAiAllocation;
  validAccounts: ApiGitHubCopilotAccount[];
  validProviders: ApiAiProvider[];
  onSave: (userId: string, data: {
    source: Source;
    copilotAccountId: string | null;
    copilotModel: string | null;
    providerId: string | null;
    providerModel: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [editSource, setEditSource] = useState<Source>(row.source ?? (row.provider_id ? "custom" : "copilot"));
  const [editCopilotAccountId, setEditCopilotAccountId] = useState(row.copilot_account_id ?? "");
  const [editCopilotModel, setEditCopilotModel] = useState(row.copilot_model ?? "");
  const [editProviderId, setEditProviderId] = useState(row.provider_id ?? "");
  const [editProviderModel, setEditProviderModel] = useState(row.provider_model ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(row.user_id, {
        source: editSource,
        copilotAccountId: editCopilotAccountId || null,
        copilotModel: editCopilotModel || null,
        providerId: editProviderId || null,
        providerModel: editProviderModel || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-md rounded-xl border border-border bg-popover p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Configure AI for {row.display_name ?? row.email}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              This overrides the workspace defaults for this user only.
            </p>
          </div>
          <button onClick={onCancel} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Source toggle */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Provider Source</label>
          <div className="flex rounded-lg border border-border overflow-hidden w-fit">
            <button
              onClick={() => setEditSource("copilot")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                editSource === "copilot"
                  ? "bg-brand-600 text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              GitHub Copilot
            </button>
            <button
              onClick={() => setEditSource("custom")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                editSource === "custom"
                  ? "bg-brand-600 text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              Custom Provider
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Both configurations are kept. The selected tab is what this user will use.
          </p>
        </div>

        {/* Fields */}
        <div className="space-y-3 mb-5">
          {editSource === "copilot" ? (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Account</label>
                <select
                  value={editCopilotAccountId}
                  onChange={(e) => setEditCopilotAccountId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                >
                  <option value="">Default (gh CLI)</option>
                  {validAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.label} (@{a.github_login})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Model</label>
                <input
                  type="text"
                  value={editCopilotModel}
                  onChange={(e) => setEditCopilotModel(e.target.value)}
                  placeholder="e.g. claude-sonnet-4 (leave blank for auto)"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Provider</label>
                <select
                  value={editProviderId}
                  onChange={(e) => setEditProviderId(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-brand-500"
                >
                  <option value="">Select a provider...</option>
                  {validProviders.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({p.provider_type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Model</label>
                <input
                  type="text"
                  value={editProviderModel}
                  onChange={(e) => setEditProviderModel(e.target.value)}
                  placeholder="e.g. gpt-4o"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-brand-500"
                />
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
