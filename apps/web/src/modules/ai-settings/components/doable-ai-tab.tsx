"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Download,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  User,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

type Visibility = "auto" | "always-show" | "hide";

interface WorkspaceExtras {
  defaultThinkingVisibility: Visibility;
  defaultSystemPrompt: string | null;
}

interface PersonalExtras {
  thinkingVisibility: Visibility;
  systemPromptOverride: string | null;
}

interface Usage {
  period: string;
  totals: { tokens: number; requests: number; costUsd: number };
  byMode: Record<string, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
    costUsd: number;
  }>;
  perProject: Array<{ projectId: string | null; requestCount: number; totalTokens: number }>;
}

const MAX_PROMPT = 4_096;

interface Props {
  workspaceId: string;
  isAdmin: boolean;
}

export function DoableAiSettingsTab({ workspaceId, isAdmin }: Props) {
  const [ws, setWs] = useState<WorkspaceExtras | null>(null);
  const [personal, setPersonal] = useState<PersonalExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsDraftVis, setWsDraftVis] = useState<Visibility>("auto");
  const [wsDraftPrompt, setWsDraftPrompt] = useState("");
  const [persDraftVis, setPersDraftVis] = useState<Visibility>("auto");
  const [persDraftPrompt, setPersDraftPrompt] = useState("");

  const [savingWs, setSavingWs] = useState(false);
  const [savingPers, setSavingPers] = useState(false);

  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "all">("30d");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [w, p] = await Promise.all([
        apiFetch<{ data: WorkspaceExtras }>(`/workspaces/${workspaceId}/ai-extras`),
        apiFetch<{ data: PersonalExtras }>(`/workspaces/${workspaceId}/personal-ai-extras`),
      ]);
      setWs(w.data);
      setPersonal(p.data);
      setWsDraftVis(w.data.defaultThinkingVisibility ?? "auto");
      setWsDraftPrompt(w.data.defaultSystemPrompt ?? "");
      setPersDraftVis(p.data.thinkingVisibility ?? "auto");
      setPersDraftPrompt(p.data.systemPromptOverride ?? "");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const refreshUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const r = await apiFetch<{ data: Usage }>(`/workspaces/${workspaceId}/ai-usage?period=${period}`);
      setUsage(r.data);
    } catch {
      setUsage(null);
    } finally {
      setUsageLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { refreshUsage(); }, [refreshUsage]);

  const wsDirty = useMemo(() => {
    if (!ws) return false;
    return wsDraftVis !== (ws.defaultThinkingVisibility ?? "auto") ||
      wsDraftPrompt !== (ws.defaultSystemPrompt ?? "");
  }, [ws, wsDraftVis, wsDraftPrompt]);

  const persDirty = useMemo(() => {
    if (!personal) return false;
    return persDraftVis !== (personal.thinkingVisibility ?? "auto") ||
      persDraftPrompt !== (personal.systemPromptOverride ?? "");
  }, [personal, persDraftVis, persDraftPrompt]);

  const saveWs = useCallback(async () => {
    setSavingWs(true);
    try {
      await apiFetch(`/workspaces/${workspaceId}/ai-extras`, {
        method: "PUT",
        body: JSON.stringify({
          defaultThinkingVisibility: wsDraftVis,
          defaultSystemPrompt: wsDraftPrompt.trim().length === 0 ? null : wsDraftPrompt.trim(),
        }),
      });
      await refresh();
    } finally {
      setSavingWs(false);
    }
  }, [workspaceId, wsDraftVis, wsDraftPrompt, refresh]);

  const savePers = useCallback(async () => {
    setSavingPers(true);
    try {
      await apiFetch(`/workspaces/${workspaceId}/personal-ai-extras`, {
        method: "PUT",
        body: JSON.stringify({
          thinkingVisibility: persDraftVis,
          systemPromptOverride: persDraftPrompt.trim().length === 0 ? null : persDraftPrompt.trim(),
        }),
      });
      await refresh();
    } finally {
      setSavingPers(false);
    }
  }, [workspaceId, persDraftVis, persDraftPrompt, refresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-doable-ai-workspace-tab>
      {/* ── Workspace defaults ── */}
      <section className="rounded-xl border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Workspace defaults</h2>
          {!isAdmin && (
            <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              admin-only — read-only for you
            </span>
          )}
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Applied to new projects in this workspace. Each project can override these from the
          per-project Doable AI tab.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Default thinking visibility</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["auto", "always-show", "hide"] as const).map((v) => (
                <label
                  key={v}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    wsDraftVis === v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                  } ${!isAdmin ? "opacity-50 pointer-events-none" : ""}`}
                >
                  <input
                    type="radio"
                    name="ws-thinking-visibility"
                    value={v}
                    checked={wsDraftVis === v}
                    onChange={() => setWsDraftVis(v)}
                    className="sr-only"
                    disabled={!isAdmin}
                    data-testid={`ws-thinking-visibility-${v}`}
                  />
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4" />
                    {v === "auto" ? "Auto" : v === "always-show" ? "Always show" : "Hide"}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Default system prompt for new projects</label>
            <textarea
              value={wsDraftPrompt}
              onChange={(e) => setWsDraftPrompt(e.target.value.slice(0, MAX_PROMPT))}
              rows={4}
              disabled={!isAdmin}
              placeholder="(none — projects ship with no pinned prompt)"
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm disabled:opacity-50"
              data-testid="ws-default-prompt"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {wsDraftPrompt.length} / {MAX_PROMPT} chars
            </p>
          </div>

          {isAdmin && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveWs}
                disabled={!wsDirty || savingWs}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                data-testid="ws-save-extras"
              >
                {savingWs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save workspace defaults
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Personal override (for projects you own) ── */}
      <section className="rounded-xl border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Personal AI overrides</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          These apply to projects where you are the workspace owner. They override the workspace
          defaults but lose to explicit per-project settings.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">Thinking visibility</label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["auto", "always-show", "hide"] as const).map((v) => (
                <label
                  key={v}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    persDraftVis === v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="pers-thinking-visibility"
                    value={v}
                    checked={persDraftVis === v}
                    onChange={() => setPersDraftVis(v)}
                    className="sr-only"
                    data-testid={`pers-thinking-visibility-${v}`}
                  />
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Brain className="h-4 w-4" />
                    {v === "auto" ? "Auto" : v === "always-show" ? "Always show" : "Hide"}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Personal system prompt (optional)</label>
            <textarea
              value={persDraftPrompt}
              onChange={(e) => setPersDraftPrompt(e.target.value.slice(0, MAX_PROMPT))}
              rows={3}
              placeholder="(none — workspace default applies)"
              className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
              data-testid="pers-default-prompt"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {persDraftPrompt.length} / {MAX_PROMPT} chars
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={savePers}
              disabled={!persDirty || savingPers}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              data-testid="pers-save-extras"
            >
              {savingPers ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save personal overrides
            </button>
          </div>
        </div>
      </section>

      {/* ── Workspace-wide usage rollup ── */}
      <section className="rounded-xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Workspace usage rollup</h2>
          <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            {(["today", "7d", "30d", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "today" ? "Today" : p === "all" ? "All" : p}
              </button>
            ))}
            <button
              onClick={refreshUsage}
              className="rounded px-2 py-1 text-muted-foreground hover:text-foreground"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${usageLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {usage ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Total tokens</p>
                <p className="mt-1 text-2xl font-semibold">{usage.totals.tokens.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Requests</p>
                <p className="mt-1 text-2xl font-semibold">{usage.totals.requests.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Estimated cost</p>
                <p className="mt-1 text-2xl font-semibold">
                  {usage.totals.costUsd > 0 ? `$${usage.totals.costUsd.toFixed(4)}` : (
                    <span className="text-sm font-normal text-muted-foreground">Pricing not configured</span>
                  )}
                </p>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Mode</th>
                    <th className="px-3 py-2 text-right">Prompt</th>
                    <th className="px-3 py-2 text-right">Completion</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(usage.byMode).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">No usage yet.</td></tr>
                  )}
                  {Object.entries(usage.byMode).map(([mode, row]) => (
                    <tr key={mode} className="border-t">
                      <td className="px-3 py-2 font-mono">{mode}</td>
                      <td className="px-3 py-2 text-right">{row.promptTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{row.completionTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{row.totalTokens.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{row.requestCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No usage data.</p>
        )}
      </section>
    </div>
  );
}
