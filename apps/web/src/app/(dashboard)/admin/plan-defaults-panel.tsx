"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Save,
  RotateCcw,
  Check,
  AlertTriangle,
  Layers,
  Cpu,
  Globe,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { ApiGitHubCopilotAccount, ApiAiProvider } from "@/lib/api";
import { PLAN_LABELS } from "@doable/shared";
import {
  useCopilotModels,
  useProviderModels,
  CUSTOM_MODEL_SENTINEL,
} from "@/modules/ai-settings/components/model-config-hooks";

// ─── Types ──────────────────────────────────────────────────

interface PlatformAiDefault {
  plan: string;
  source: "copilot" | "custom";
  copilot_account_id: string | null;
  copilot_model: string | null;
  provider_id: string | null;
  provider_model: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields from listAll()
  copilot_account_label?: string | null;
  copilot_github_login?: string | null;
  provider_label?: string | null;
  provider_type?: string | null;
}

interface EditState {
  source: "copilot" | "custom" | "none";
  copilotAccountId: string | null;
  copilotModel: string;
  providerId: string | null;
  providerModel: string;
}

const PLAN_ORDER = ["free", "pro", "business", "enterprise"];
const PLAN_ICONS: Record<string, string> = {
  free: "🆓",
  pro: "⭐",
  business: "🏢",
  enterprise: "🏛️",
};

// ─── Edit Form Sub-Component (uses hooks for dynamic model loading) ─────

function PlanEditForm({
  plan,
  editState,
  setEditState,
  accounts,
  providers,
  adminWorkspaceId,
  onSave,
  onCancel,
  saving,
}: {
  plan: string;
  editState: EditState;
  setEditState: (s: EditState) => void;
  accounts: ApiGitHubCopilotAccount[];
  providers: ApiAiProvider[];
  adminWorkspaceId: string | null;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { models: copilotModels, loadingModels: loadingCopilotModels } = useCopilotModels(
    editState.source === "copilot" && editState.copilotAccountId ? editState.copilotAccountId : undefined,
  );
  const { models: providerModels, loading: loadingProviderModels } = useProviderModels(
    adminWorkspaceId,
    editState.source === "custom" && editState.providerId ? editState.providerId : "",
  );

  const [customCopilotModel, setCustomCopilotModel] = useState("");
  const [customProviderModel, setCustomProviderModel] = useState("");

  // Check if current model value is in the list or needs custom input
  const copilotModelInList = copilotModels.some((m) => m.id === editState.copilotModel);
  const showCopilotCustomInput = editState.copilotModel === CUSTOM_MODEL_SENTINEL || (!copilotModelInList && editState.copilotModel !== "");
  const providerModelInList = providerModels.some((m) => m.id === editState.providerModel);
  const showProviderCustomInput = editState.providerModel === CUSTOM_MODEL_SENTINEL || (!providerModelInList && editState.providerModel !== "" && providerModels.length > 0);

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Source selector */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Source</label>
        <div className="flex gap-2">
          {(["none", "copilot", "custom"] as const).map((src) => (
            <button
              key={src}
              onClick={() => setEditState({ ...editState, source: src })}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                editState.source === src
                  ? "border-brand-500 bg-brand-600/20 text-brand-400"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {src === "none" ? "None" : src === "copilot" ? "GitHub Copilot" : "Custom Provider"}
            </button>
          ))}
        </div>
      </div>

      {/* Copilot fields */}
      {editState.source === "copilot" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Copilot Account
            </label>
            <select
              value={editState.copilotAccountId ?? ""}
              onChange={(e) =>
                setEditState({ ...editState, copilotAccountId: e.target.value || null })
              }
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} (@{a.github_login})
                </option>
              ))}
            </select>
            {accounts.length === 0 && (
              <p className="mt-1 text-xs text-amber-400">
                No Copilot accounts found. Add one in AI Settings first.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Default Model
              {loadingCopilotModels && <Loader2 className="inline h-3 w-3 ml-1 animate-spin text-muted-foreground" />}
            </label>
            <select
              value={showCopilotCustomInput ? CUSTOM_MODEL_SENTINEL : editState.copilotModel}
              onChange={(e) => {
                if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                  setCustomCopilotModel(editState.copilotModel);
                  setEditState({ ...editState, copilotModel: CUSTOM_MODEL_SENTINEL });
                } else {
                  setEditState({ ...editState, copilotModel: e.target.value });
                }
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {copilotModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value={CUSTOM_MODEL_SENTINEL}>— Type custom model ID —</option>
            </select>
            {showCopilotCustomInput && (
              <input
                type="text"
                value={editState.copilotModel === CUSTOM_MODEL_SENTINEL ? customCopilotModel : editState.copilotModel}
                onChange={(e) => {
                  setCustomCopilotModel(e.target.value);
                  setEditState({ ...editState, copilotModel: e.target.value });
                }}
                placeholder="e.g. gpt-4o, claude-sonnet-4"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            )}
          </div>
        </div>
      )}

      {/* Custom provider fields */}
      {editState.source === "custom" && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Provider
            </label>
            <select
              value={editState.providerId ?? ""}
              onChange={(e) =>
                setEditState({ ...editState, providerId: e.target.value || null, providerModel: "" })
              }
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Select provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.provider_type})
                </option>
              ))}
            </select>
            {providers.length === 0 && (
              <p className="mt-1 text-xs text-amber-400">
                No custom providers found. Add one in AI Settings first.
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Default Model
              {loadingProviderModels && <Loader2 className="inline h-3 w-3 ml-1 animate-spin text-muted-foreground" />}
            </label>
            {providerModels.length > 0 ? (
              <>
                <select
                  value={showProviderCustomInput ? CUSTOM_MODEL_SENTINEL : editState.providerModel}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_MODEL_SENTINEL) {
                      setCustomProviderModel(editState.providerModel);
                      setEditState({ ...editState, providerModel: CUSTOM_MODEL_SENTINEL });
                    } else {
                      setEditState({ ...editState, providerModel: e.target.value });
                    }
                  }}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  <option value="">Select model…</option>
                  {providerModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.id}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL_SENTINEL}>— Type custom model ID —</option>
                </select>
                {showProviderCustomInput && (
                  <input
                    type="text"
                    value={editState.providerModel === CUSTOM_MODEL_SENTINEL ? customProviderModel : editState.providerModel}
                    onChange={(e) => {
                      setCustomProviderModel(e.target.value);
                      setEditState({ ...editState, providerModel: e.target.value });
                    }}
                    placeholder="e.g. gpt-4o, claude-sonnet-4"
                    className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                )}
              </>
            ) : (
              <input
                type="text"
                value={editState.providerModel}
                onChange={(e) => setEditState({ ...editState, providerModel: e.target.value })}
                placeholder={editState.providerId ? (loadingProviderModels ? "Discovering models…" : "Type model ID") : "Select a provider first"}
                disabled={!editState.providerId}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
              />
            )}
          </div>
        </div>
      )}

      {/* None explanation */}
      {editState.source === "none" && (
        <p className="text-xs text-muted-foreground bg-secondary/50 rounded-md px-3 py-2">
          No default AI model will be configured for new <strong>{PLAN_LABELS[plan]}</strong> workspaces.
          Users will need to set up their own AI connection.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Save
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function PlanDefaultsPanel() {
  const [defaults, setDefaults] = useState<PlatformAiDefault[]>([]);
  const [accounts, setAccounts] = useState<ApiGitHubCopilotAccount[]>([]);
  const [providers, setProviders] = useState<ApiAiProvider[]>([]);
  const [adminWorkspaceId, setAdminWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [applyingPlan, setApplyingPlan] = useState<string | null>(null);
  const [applyOverwrite, setApplyOverwrite] = useState(false);
  const [applyResult, setApplyResult] = useState<{ plan: string; total: number; updated: number } | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load plan defaults + available accounts/providers in parallel
      const [defaultsRes, allocRes] = await Promise.all([
        apiFetch<{ data: PlatformAiDefault[] }>("/admin/platform-ai-defaults"),
        apiFetch<{
          accounts: ApiGitHubCopilotAccount[];
          providers: ApiAiProvider[];
          workspaceId: string | null;
        }>("/admin/users/ai-allocations"),
      ]);
      setDefaults(defaultsRes.data);
      setAccounts(allocRes.accounts ?? []);
      setProviders(allocRes.providers ?? []);
      setAdminWorkspaceId(allocRes.workspaceId ?? null);
    } catch (err) {
      console.error("Failed to load plan defaults:", err);
      setErrorMsg("Failed to load plan defaults");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function startEdit(row: PlatformAiDefault) {
    const hasConfig = row.copilot_account_id || row.provider_id || row.copilot_model || row.provider_model;
    setEditingPlan(row.plan);
    setEditState({
      source: !hasConfig ? "none" : row.source,
      copilotAccountId: row.copilot_account_id,
      copilotModel: row.copilot_model ?? "",
      providerId: row.provider_id,
      providerModel: row.provider_model ?? "",
    });
  }

  function cancelEdit() {
    setEditingPlan(null);
    setEditState(null);
  }

  async function saveDefaults() {
    if (!editingPlan || !editState) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const isNone = editState.source === "none";
      const body: Record<string, unknown> = {
        source: isNone ? "copilot" : editState.source,
        copilotAccountId: isNone ? null : (editState.source === "copilot" ? editState.copilotAccountId : null),
        copilotModel: isNone ? null : (editState.source === "copilot" ? (editState.copilotModel || null) : null),
        providerId: isNone ? null : (editState.source === "custom" ? editState.providerId : null),
        providerModel: isNone ? null : (editState.source === "custom" ? (editState.providerModel || null) : null),
      };

      await apiFetch(`/admin/platform-ai-defaults/${editingPlan}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      setSuccessMsg(`Saved defaults for ${PLAN_LABELS[editingPlan] ?? editingPlan} plan`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setEditingPlan(null);
      setEditState(null);
      await load();
    } catch (err) {
      console.error("Failed to save defaults:", err);
      setErrorMsg("Failed to save defaults");
    } finally {
      setSaving(false);
    }
  }

  async function applyToExisting(plan: string) {
    setApplyingPlan(plan);
    setErrorMsg(null);
    setApplyResult(null);
    try {
      const res = await apiFetch<{ data: { plan: string; total: number; updated: number } }>(
        "/admin/platform-ai-defaults/apply-to-existing",
        {
          method: "POST",
          body: JSON.stringify({ plan, overwrite: applyOverwrite }),
        },
      );
      setApplyResult(res.data);
      setSuccessMsg(`Applied ${plan} defaults to ${res.data.updated}/${res.data.total} workspaces`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error("Failed to apply defaults:", err);
      setErrorMsg("Failed to apply defaults to existing workspaces");
    } finally {
      setApplyingPlan(null);
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  function getDisplayModel(row: PlatformAiDefault): string {
    if (row.source === "custom" && row.provider_model) return row.provider_model;
    if (row.source === "copilot" && row.copilot_model) return row.copilot_model;
    return "—";
  }

  function getDisplayProvider(row: PlatformAiDefault): string {
    if (row.source === "custom" && row.provider_label) return row.provider_label;
    if (row.source === "copilot" && row.copilot_account_label) return row.copilot_account_label;
    if (row.source === "copilot" && row.copilot_github_login) return `@${row.copilot_github_login}`;
    return "—";
  }

  function isConfigured(row: PlatformAiDefault): boolean {
    return !!(row.copilot_account_id || row.provider_id);
  }

  // ─── Render ─────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
        <span className="ml-2 text-sm text-muted-foreground">Loading plan defaults…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">
            Set the default AI model and provider for each plan tier. New workspaces will automatically inherit these settings.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-green-800/50 bg-green-900/20 px-4 py-2 text-sm text-green-400">
          <Check className="h-4 w-4" /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-2 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4" /> {errorMsg}
        </div>
      )}

      {/* Plan cards */}
      <div className="grid gap-3">
        {PLAN_ORDER.map((plan) => {
          const row = defaults.find((d) => d.plan === plan);
          if (!row) return null;
          const isEditing = editingPlan === plan;
          const configured = isConfigured(row);

          return (
            <div
              key={plan}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{PLAN_ICONS[plan]}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {PLAN_LABELS[plan] ?? plan}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {configured
                        ? `${row.source === "copilot" ? "Copilot" : "Custom"} • ${getDisplayModel(row)}`
                        : "No default configured"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <>
                      <button
                        onClick={() => startEdit(row)}
                        className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                      >
                        Configure
                      </button>
                      {configured && (
                        <button
                          onClick={() => applyToExisting(plan)}
                          disabled={!!applyingPlan}
                          className="rounded-md border border-brand-600/50 bg-brand-600/10 px-3 py-1.5 text-xs font-medium text-brand-400 hover:bg-brand-600/20 transition-colors disabled:opacity-50"
                          title="Apply this default to all existing workspaces on this plan"
                        >
                          {applyingPlan === plan ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Apply to Existing"
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Current config display (when not editing) */}
              {!isEditing && configured && (
                <div className="px-4 py-3 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Source</span>
                    <div className="mt-0.5 flex items-center gap-1.5 text-foreground font-medium">
                      {row.source === "copilot" ? (
                        <><Cpu className="h-3 w-3 text-brand-400" /> Copilot</>
                      ) : (
                        <><Globe className="h-3 w-3 text-purple-400" /> Custom Provider</>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Provider / Account</span>
                    <div className="mt-0.5 text-foreground font-medium">{getDisplayProvider(row)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Model</span>
                    <div className="mt-0.5 text-foreground font-medium">{getDisplayModel(row)}</div>
                  </div>
                </div>
              )}

              {/* Edit form */}
              {isEditing && editState && (
                <PlanEditForm
                  plan={plan}
                  editState={editState}
                  setEditState={setEditState}
                  accounts={accounts}
                  providers={providers}
                  adminWorkspaceId={adminWorkspaceId}
                  onSave={saveDefaults}
                  onCancel={cancelEdit}
                  saving={saving}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Apply to Existing section */}
      {applyResult && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-400" />
            <span className="text-foreground font-medium">
              Applied {PLAN_LABELS[applyResult.plan]} defaults to {applyResult.updated} of {applyResult.total} workspaces
            </span>
          </div>
          {applyResult.total > applyResult.updated && (
            <p className="mt-1 text-muted-foreground ml-6">
              {applyResult.total - applyResult.updated} workspace(s) skipped — already had AI configured.
              Use &ldquo;overwrite&rdquo; to force-apply.
            </p>
          )}
        </div>
      )}

      {/* Overwrite toggle for apply-to-existing */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={applyOverwrite}
            onChange={(e) => setApplyOverwrite(e.target.checked)}
            className="rounded border-border accent-brand-500"
          />
          <span>Overwrite existing workspace AI settings when applying to existing</span>
        </label>
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-border/50 bg-secondary/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Layers className="h-3.5 w-3.5 text-brand-400" />
          How Plan Defaults Work
        </div>
        <ul className="list-disc list-inside space-y-0.5 ml-5">
          <li>When a new user signs up, their workspace inherits the default for their plan tier.</li>
          <li>The Copilot account or provider is cloned into the user&apos;s workspace automatically.</li>
          <li>Users can override the default in their own AI Settings.</li>
          <li>Use &ldquo;Apply to Existing&rdquo; to retroactively push defaults to workspaces that don&apos;t have AI configured yet.</li>
        </ul>
      </div>
    </div>
  );
}
