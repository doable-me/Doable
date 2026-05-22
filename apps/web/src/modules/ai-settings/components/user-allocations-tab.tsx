"use client";

import { useState } from "react";
import type { ApiUserAiAllocation, ApiGitHubCopilotAccount, ApiAiProvider, ApiEnforcementStatus } from "@/lib/api";
import { Bot, Copy, Loader2, Check, RotateCcw, Pencil, X, HelpCircle, AlertTriangle } from "lucide-react";

interface Props {
  allocations: ApiUserAiAllocation[];
  loading: boolean;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  enforcement: ApiEnforcementStatus | null;
  onUpdate: (targetUserId: string, data: {
    source?: "copilot" | "custom";
    copilotAccountId?: string | null;
    copilotModel?: string | null;
    providerId?: string | null;
    providerModel?: string | null;
  }) => Promise<void>;
  onCopyMySettings: (targetUserIds: string[]) => Promise<number>;
  onReset: (targetUserId: string) => Promise<void>;
}

type Source = "copilot" | "custom";

import { rowHasAllocation, rowActiveModel, AllocationStatus } from "./user-allocation-edit-modal";

export function UserAllocationsTab({ allocations, loading, accounts, providers, enforcement, onUpdate, onCopyMySettings, onReset }: Props) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  // Both sides are tracked simultaneously; `editSource` selects active.
  const [editSource, setEditSource] = useState<Source>("copilot");
  const [editCopilotAccountId, setEditCopilotAccountId] = useState("");
  const [editCopilotModel, setEditCopilotModel] = useState("");
  const [editProviderId, setEditProviderId] = useState("");
  const [editProviderModel, setEditProviderModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCopying, setBulkCopying] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const isEnforced = enforcement?.enforce_ai === true;
  const validAccounts = accounts.filter((a) => a.is_valid);
  const validProviders = providers.filter((p) => p.is_valid);

  function startEdit(row: ApiUserAiAllocation) {
    setEditingUserId(row.user_id);
    // Preload BOTH sides so the admin can edit either tab without losing
    // the other one. Source defaults to whatever the row currently uses.
    setEditSource(row.source ?? (row.provider_id ? "custom" : "copilot"));
    setEditCopilotAccountId(row.copilot_account_id ?? "");
    setEditCopilotModel(row.copilot_model ?? "");
    setEditProviderId(row.provider_id ?? "");
    setEditProviderModel(row.provider_model ?? "");
  }

  function cancelEdit() {
    setEditingUserId(null);
  }

  async function saveEdit() {
    if (!editingUserId) return;
    setSaving(true);
    try {
      // Persist BOTH sides + the active source. No more null wipes.
      await onUpdate(editingUserId, {
        source: editSource,
        copilotAccountId: editCopilotAccountId || null,
        copilotModel: editCopilotModel || null,
        providerId: editProviderId || null,
        providerModel: editProviderModel || null,
      });
      setEditingUserId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkCopy() {
    if (selectedIds.size === 0) return;
    setBulkCopying(true);
    setBulkResult(null);
    try {
      const count = await onCopyMySettings(Array.from(selectedIds));
      setBulkResult(`Settings copied to ${count} user${count !== 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setTimeout(() => setBulkResult(null), 3000);
    } finally {
      setBulkCopying(false);
    }
  }

  function toggleSelect(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === allocations.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allocations.map((a) => a.user_id)));
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Help text */}
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Assign AI settings to individual workspace members. You can configure each user with a specific copilot account or custom provider,
            or use <strong className="text-foreground">"Copy My Settings"</strong> to give selected users the same configuration you use.
            Users without a custom allocation will use the workspace defaults.
          </p>
        </div>
      </div>

      {/* Enforcement warning */}
      {isEnforced && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-600/30 bg-amber-600/5 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            An enforcement policy is active. These per-user allocations will only take effect when enforcement is turned off (see Access Control tab).
          </p>
        </div>
      )}

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-600/30 bg-brand-600/5 px-4 py-3">
          <span className="text-sm text-foreground">{selectedIds.size} user{selectedIds.size !== 1 ? "s" : ""} selected</span>
          <button
            onClick={handleBulkCopy}
            disabled={bulkCopying}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
          >
            {bulkCopying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Copy My Settings to Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Success message */}
      {bulkResult && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-4 py-2.5">
          <Check className="h-4 w-4 text-emerald-400" />
          <span className="text-sm text-emerald-300">{bulkResult}</span>
        </div>
      )}

      {/* User table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selectedIds.size === allocations.length && allocations.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-input bg-background text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
                />
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Configuration</th>
              <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Model</th>
              <th className="w-28 px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((row) => (
              <tr key={row.user_id} className="border-b border-border last:border-0 hover:bg-card">
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.user_id)}
                    onChange={() => toggleSelect(row.user_id)}
                    className="rounded border-input bg-background text-brand-500 focus:ring-brand-500 focus:ring-offset-0"
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    {row.avatar_url ? (
                      <img src={row.avatar_url} alt="" className="h-7 w-7 rounded-full" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-foreground">
                        {(row.display_name ?? row.email)?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div>
                      <div className="text-sm text-foreground">{row.display_name ?? row.email}</div>
                      {row.display_name && (
                        <div className="text-[11px] text-muted-foreground">{row.email}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    row.role === "owner" ? "bg-amber-600/15 text-amber-400" :
                    row.role === "admin" ? "bg-brand-600/15 text-brand-400" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {row.role}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${
                      rowHasAllocation(row) ? "bg-emerald-400" : "bg-muted-foreground/40"
                    }`} />
                    <AllocationStatus row={row} />
                  </div>
                </td>
                <td className="px-3 py-3">
                  <span className="text-xs text-muted-foreground">{rowActiveModel(row) || "--"}</span>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => startEdit(row)}
                      className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Edit AI settings for this user"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {rowHasAllocation(row) && (
                      <button
                        onClick={() => onReset(row.user_id)}
                        className="rounded p-1.5 text-muted-foreground hover:text-amber-400 hover:bg-secondary transition-colors"
                        title="Reset to workspace defaults"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {allocations.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No workspace members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal / slide-over */}
      {editingUserId && (() => {
        const editRow = allocations.find((a) => a.user_id === editingUserId);
        if (!editRow) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 backdrop-blur-sm" onClick={cancelEdit}>
            <div className="w-full max-w-md rounded-xl border border-border bg-popover p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Configure AI for {editRow.display_name ?? editRow.email}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This overrides the workspace defaults for this user only.
                  </p>
                </div>
                <button onClick={cancelEdit} className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Source toggle — both sides are kept; only `editSource` flips */}
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
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
