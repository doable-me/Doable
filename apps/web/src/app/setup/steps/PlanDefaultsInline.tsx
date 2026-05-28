"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, AlertTriangle, Cpu } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { PLAN_LABELS } from "@doable/shared";

interface PlatformAiDefault {
  plan: string;
  source: "copilot" | "custom";
  copilot_account_id: string | null;
  copilot_model: string | null;
  provider_id: string | null;
  provider_model: string | null;
  provider_label?: string | null;
}

const PLAN_ORDER = ["free", "pro", "business", "enterprise"];

/**
 * Wizard-friendly plan-defaults editor. Lives inline in the Plans & Billing
 * step. Reads + writes the same /admin/platform-ai-defaults endpoints the
 * full /admin panel uses — no new API surface.
 *
 * Pre-populated by Step 3 (AI Provider) when the admin opted to "set as plan
 * default" (default = true). This section lets the admin verify what got
 * written and override per plan before finishing setup.
 */
export function PlanDefaultsInline() {
  const [defaults, setDefaults] = useState<PlatformAiDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: PlatformAiDefault[] }>("/admin/platform-ai-defaults");
      setDefaults(res.data);
      const m: Record<string, string> = {};
      for (const row of res.data) {
        m[row.plan] = row.source === "custom" ? row.provider_model ?? "" : row.copilot_model ?? "";
      }
      setEditing(m);
    } catch (err) {
      console.error("Failed to load plan defaults:", err);
      setError("Could not load plan defaults — you can configure them later in /admin/plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save(plan: string) {
    const row = defaults.find((d) => d.plan === plan);
    if (!row) return;
    setSaving(plan);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        source: row.source,
        copilotAccountId: row.source === "copilot" ? row.copilot_account_id : null,
        copilotModel: row.source === "copilot" ? (editing[plan] || null) : null,
        providerId: row.source === "custom" ? row.provider_id : null,
        providerModel: row.source === "custom" ? (editing[plan] || null) : null,
      };
      await apiFetch(`/admin/platform-ai-defaults/${plan}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setSavedAt({ ...savedAt, [plan]: Date.now() });
      await load();
    } catch (err) {
      console.error(`Failed to save plan defaults for ${plan}:`, err);
      setError(`Could not save ${plan} default — verify in /admin/plans after setup.`);
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-6 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading plan defaults…
      </div>
    );
  }

  if (defaults.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        No plan defaults configured. The provider you set in Step 3 should already be applied to all plans.
        If this list is empty, you can configure them later from <strong>/admin/plans</strong>.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Cpu className="h-4 w-4 text-brand-400" /> AI model defaults per plan
        </h3>
        <p className="text-xs text-muted-foreground">
          The provider+model you chose in Step 3 was applied to all plans automatically.
          Optionally override the model for individual plans (e.g. a cheaper model on Free,
          a more capable one on Enterprise). You can change these any time in <strong>/admin/plans</strong>.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-amber-800/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Plan</th>
              <th className="text-left px-3 py-2 font-medium">Provider</th>
              <th className="text-left px-3 py-2 font-medium">Default model</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {PLAN_ORDER.map((plan) => {
              const row = defaults.find((d) => d.plan === plan);
              if (!row) return null;
              const providerLabel =
                row.source === "custom"
                  ? row.provider_label ?? "Custom provider"
                  : "GitHub Copilot";
              const recentlySaved =
                savedAt[plan] !== undefined && Date.now() - savedAt[plan] < 3000;
              return (
                <tr key={plan} className="border-t border-border/50">
                  <td className="px-3 py-2 text-foreground font-medium">
                    {PLAN_LABELS[plan] ?? plan}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{providerLabel}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={editing[plan] ?? ""}
                      onChange={(e) => setEditing({ ...editing, [plan]: e.target.value })}
                      placeholder="e.g. MiniMax-M2.7, gpt-4o, claude-sonnet-4"
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => save(plan)}
                      disabled={saving === plan}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-1 text-xs font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {saving === plan ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : recentlySaved ? (
                        <><Check className="h-3 w-3 text-green-400" /> Saved</>
                      ) : (
                        "Save"
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
