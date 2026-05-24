"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Download,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { SectionCard } from "./project-settings-shared";
import { ProjectChatModelPicker } from "./project-chat-model-picker";

type Visibility = "auto" | "always-show" | "hide";

interface DoableAiSettings {
  enabled: boolean;
  systemPrompt: string | null;
  systemPromptOverride: string | null;
  thinkingVisibility: Visibility;
  chatModelOverride: string | null;
  embeddingModelOverride: string | null;
  defaultModel: string | null;
  embeddingModel: string | null;
  embeddingProviderId: string | null;
}

interface AiUsage {
  period: string;
  totals: { tokens: number; requests: number; costUsd: number };
  byMode: Record<string, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
    costUsd: number;
  }>;
  topModels: Array<{ model: string; requestCount: number; totalTokens: number }>;
}

interface EmbeddingsStats {
  mode: string;
  tables: Array<{ table: string; column: string; rows: number }>;
  totalRows: number;
}

const SYSTEM_PROMPT_MAX = 4_096;

interface Props {
  projectId: string;
  workspaceId: string;
  addToast: (kind: "success" | "error", msg: string) => void;
}

export function DoableAiTab({ projectId, workspaceId, addToast }: Props) {
  const [settings, setSettings] = useState<DoableAiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState("");
  const [pendingChatModel, setPendingChatModel] = useState<string | null>(null);
  const [pendingVisibility, setPendingVisibility] = useState<Visibility>("auto");
  const [pendingEnabled, setPendingEnabled] = useState(true);

  // ── Usage card ──
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "all">("30d");
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  // ── Destructive embedding modal ──
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [embedStats, setEmbedStats] = useState<EmbeddingsStats | null>(null);
  const [embedConfirm, setEmbedConfirm] = useState("");
  const [embedNewModel, setEmbedNewModel] = useState("");
  const [embedBusy, setEmbedBusy] = useState(false);

  const refreshSettings = useCallback(() => {
    setLoading(true);
    apiFetch<{ data: DoableAiSettings }>(`/projects/${projectId}/ai-settings`)
      .then(({ data }) => {
        setSettings(data);
        setPendingPrompt(data.systemPromptOverride ?? "");
        setPendingChatModel(data.chatModelOverride);
        setPendingVisibility(data.thinkingVisibility ?? "auto");
        setPendingEnabled(data.enabled);
      })
      .catch((err) => addToast("error", err instanceof Error ? err.message : "Failed to load AI settings"))
      .finally(() => setLoading(false));
  }, [projectId, addToast]);

  const refreshUsage = useCallback(() => {
    setUsageLoading(true);
    apiFetch<{ data: AiUsage }>(`/projects/${projectId}/ai-usage?period=${period}`)
      .then(({ data }) => setUsage(data))
      .catch(() => setUsage(null))
      .finally(() => setUsageLoading(false));
  }, [projectId, period]);

  useEffect(() => { refreshSettings(); }, [refreshSettings]);
  useEffect(() => { refreshUsage(); }, [refreshUsage]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return (
      pendingPrompt !== (settings.systemPromptOverride ?? "") ||
      pendingChatModel !== settings.chatModelOverride ||
      pendingVisibility !== (settings.thinkingVisibility ?? "auto") ||
      pendingEnabled !== settings.enabled
    );
  }, [settings, pendingPrompt, pendingChatModel, pendingVisibility, pendingEnabled]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch(`/projects/${projectId}/ai-settings`, {
        method: "PUT",
        body: JSON.stringify({
          enabled: pendingEnabled,
          thinkingVisibility: pendingVisibility,
          systemPromptOverride: pendingPrompt.trim().length === 0 ? null : pendingPrompt.trim(),
          chatModelOverride: pendingChatModel,
        }),
      });
      addToast("success", "Doable AI settings saved.");
      refreshSettings();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [projectId, pendingEnabled, pendingVisibility, pendingPrompt, pendingChatModel, addToast, refreshSettings]);

  const openEmbedModal = useCallback(async () => {
    setEmbedModalOpen(true);
    setEmbedConfirm("");
    setEmbedNewModel(settings?.embeddingModelOverride ?? settings?.embeddingModel ?? "");
    try {
      const r = await apiFetch<{ data: EmbeddingsStats }>(`/projects/${projectId}/embeddings/stats`);
      setEmbedStats(r.data);
    } catch {
      setEmbedStats({ mode: "unknown", tables: [], totalRows: 0 });
    }
  }, [projectId, settings]);

  const eraseEmbeddings = useCallback(async () => {
    if (embedConfirm !== "ERASE") {
      addToast("error", 'Type "ERASE" exactly to confirm.');
      return;
    }
    setEmbedBusy(true);
    try {
      const r = await apiFetch<{ ok: boolean; mode: string; tables: Array<{ table: string; deleted: number }> }>(
        `/projects/${projectId}/embeddings`,
        { method: "DELETE", body: JSON.stringify({ confirm: "ERASE" }) },
      );
      // After erasing, also persist the new embedding model override.
      if (embedNewModel.trim().length > 0) {
        await apiFetch(`/projects/${projectId}/ai-settings`, {
          method: "PUT",
          body: JSON.stringify({
            embeddingModelOverride: embedNewModel.trim(),
            // Required because PUT replaces NULL-able fields too.
            thinkingVisibility: pendingVisibility,
            systemPromptOverride: pendingPrompt.trim().length === 0 ? null : pendingPrompt.trim(),
            chatModelOverride: pendingChatModel,
            enabled: pendingEnabled,
          }),
        });
      }
      const deleted = r.tables.reduce((acc, t) => acc + t.deleted, 0);
      addToast("success", `Erased ${deleted} rows across ${r.tables.length} table(s). Mode: ${r.mode}.`);
      setEmbedModalOpen(false);
      setEmbedConfirm("");
      refreshSettings();
    } catch (err) {
      addToast("error", err instanceof Error ? err.message : "Erase failed.");
    } finally {
      setEmbedBusy(false);
    }
  }, [projectId, embedConfirm, embedNewModel, addToast, refreshSettings, pendingVisibility, pendingPrompt, pendingChatModel, pendingEnabled]);

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const effectivePrompt = (pendingPrompt ?? "").length;
  const promptPct = Math.min(100, Math.round((effectivePrompt / SYSTEM_PROMPT_MAX) * 100));

  return (
    <div className="space-y-6" data-doable-ai-tab>
      {/* ── Master toggle ── */}
      <SectionCard
        title="Doable AI for this project"
        description="When disabled, /__doable/ai/* returns 503 AI_DISABLED_FOR_PROJECT. Useful for paused projects or quota lockouts."
      >
        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={pendingEnabled}
              onChange={(e) => setPendingEnabled(e.target.checked)}
              className="h-4 w-4"
              data-testid="ai-enabled-toggle"
            />
            <span className="text-sm font-medium">
              {pendingEnabled ? "Enabled" : "Disabled"}
            </span>
          </label>
        </div>
      </SectionCard>

      {/* ── Thinking visibility ── */}
      <SectionCard
        title="Thinking content visibility"
        description="How reasoning blocks (<think>, <reasoning>, <plan>…) are rendered in the generated chatbot UI."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {(["auto", "always-show", "hide"] as const).map((v) => (
            <label
              key={v}
              className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                pendingVisibility === v
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              <input
                type="radio"
                name="thinking-visibility"
                value={v}
                checked={pendingVisibility === v}
                onChange={() => setPendingVisibility(v)}
                className="sr-only"
                data-testid={`thinking-visibility-${v}`}
              />
              <div className="flex items-center gap-2 text-sm font-medium">
                <Brain className="h-4 w-4" />
                {v === "auto" && "Auto (collapsed)"}
                {v === "always-show" && "Always show"}
                {v === "hide" && "Hide entirely"}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {v === "auto" && "Render inside a 💭 Thinking disclosure, collapsed by default."}
                {v === "always-show" && "Render reasoning inline above the answer."}
                {v === "hide" && "Strip <think> blocks server-side. The app never sees them."}
              </p>
            </label>
          ))}
        </div>
      </SectionCard>

      {/* ── System prompt override ── */}
      <SectionCard
        title="System prompt override"
        description="Prepended to every runtime chat call. Visible to the model only — never echoed to the client. Up to 4 KB."
      >
        <div className="space-y-2">
          <textarea
            value={pendingPrompt}
            onChange={(e) => setPendingPrompt(e.target.value.slice(0, SYSTEM_PROMPT_MAX))}
            rows={6}
            placeholder="e.g. You always answer in haiku."
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            data-testid="system-prompt-override"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {effectivePrompt} / {SYSTEM_PROMPT_MAX} chars ({promptPct}%) — extra content beyond the cap is truncated client-side.
            </span>
            <button
              type="button"
              onClick={() => setPendingPrompt("")}
              className="text-xs underline-offset-2 hover:underline"
            >
              Reset to default
            </button>
          </div>
        </div>
      </SectionCard>

      {/* ── Chat model override ── */}
      <SectionCard
        title="Chat model override"
        description="Overrides the workspace-resolved chat model for runtime chat in this project's generated app."
      >
        <ProjectChatModelPicker
          workspaceId={workspaceId}
          value={pendingChatModel}
          defaultModel={settings.defaultModel}
          onChange={setPendingChatModel}
        />
      </SectionCard>

      {/* ── Embedding model override (destructive) ── */}
      <SectionCard
        title="Embedding model override (destructive)"
        description="Changing the embedding model permanently erases all existing embeddings for this project because pgvector column dimensions are fixed per model."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm">
              Current: <span className="font-mono">{settings.embeddingModelOverride ?? settings.embeddingModel ?? "(workspace/platform default)"}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Click below to walk through the destructive confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={openEmbedModal}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-950"
            data-testid="open-embed-modal"
          >
            <Trash2 className="h-4 w-4" />
            Change embedding model…
          </button>
        </div>
      </SectionCard>

      {/* ── Token usage ── */}
      <SectionCard
        title="Runtime token usage"
        description="Aggregates of ai_usage_log rows for this project, grouped by mode."
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
            {(["today", "7d", "30d", "all"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  period === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`usage-period-${p}`}
              >
                {p === "today" ? "Today" : p === "all" ? "All time" : p}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refreshUsage}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${usageLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <a
              href={`/api/projects/${projectId}/ai-usage.csv?period=${period}`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              data-testid="usage-csv-link"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          </div>
        </div>

        {usage ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" data-testid="usage-totals">
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

            {usage.topModels.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Top models</p>
                <ul className="space-y-1 text-sm">
                  {usage.topModels.map((m) => (
                    <li key={m.model} className="flex justify-between gap-2 text-muted-foreground">
                      <span className="font-mono truncate">{m.model}</span>
                      <span>{m.requestCount} req · {m.totalTokens.toLocaleString()} tok</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No usage data.</p>
        )}
      </SectionCard>

      {/* ── Sticky save bar ── */}
      <div className="flex items-center justify-end gap-3 rounded-xl border bg-card p-3">
        {dirty && (
          <p className="mr-auto text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            Unsaved changes
          </p>
        )}
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => {
            refreshSettings();
          }}
          className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          data-testid="save-doable-ai"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>

      {/* ── Embedding erase modal ── */}
      {embedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" data-testid="embed-erase-modal">
          <div className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" /> Erase embeddings for this project?
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Changing the embedding model will permanently <strong>DELETE</strong> all existing
              embedding rows for this project (current model:{" "}
              <span className="font-mono">
                {settings.embeddingModelOverride ?? settings.embeddingModel ?? "(default)"}
              </span>
              , {embedStats?.totalRows.toLocaleString() ?? "?"} rows across{" "}
              {embedStats?.tables.length ?? 0} table(s)).
            </p>
            {embedStats && embedStats.tables.length > 0 && (
              <ul className="mt-2 max-h-32 overflow-auto rounded border bg-muted/30 p-2 text-xs font-mono">
                {embedStats.tables.map((t) => (
                  <li key={t.table}>
                    {t.table} — {t.rows.toLocaleString()} rows
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 space-y-2">
              <label className="block text-sm font-medium">New embedding model</label>
              <input
                type="text"
                value={embedNewModel}
                onChange={(e) => setEmbedNewModel(e.target.value)}
                placeholder="e.g. text-embedding-3-small or gemini-embedding-001"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                data-testid="embed-new-model"
              />
              <label className="block text-sm font-medium">
                Type <code className="font-mono">ERASE</code> to confirm
              </label>
              <input
                type="text"
                value={embedConfirm}
                onChange={(e) => setEmbedConfirm(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
                placeholder="ERASE"
                data-testid="embed-confirm-input"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmbedModalOpen(false)}
                disabled={embedBusy}
                className="rounded-md border px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={eraseEmbeddings}
                disabled={embedConfirm !== "ERASE" || embedBusy}
                className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                data-testid="embed-erase-confirm"
              >
                {embedBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Erase embeddings & switch model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
