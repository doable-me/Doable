"use client";

/**
 * Workspace Settings → Doable AI tab.
 *
 * Workspace-wide defaults for the runtime AI plane. Projects in this
 * workspace inherit these silently unless they have a per-project override
 * configured in their own Project Settings → Doable AI tab.
 *
 * Surface:
 *   - Default system prompt (applies to every project that doesn't pin one)
 *   - Default thinking visibility (auto | always-show | hide)
 *   - Workspace-wide token usage card (sum across every project)
 *
 * Embedding provider / chat provider live on /ai-settings (workspace AI
 * Providers + Models) — we link there to avoid duplicating the BYOK key
 * UI. The platform-default embedding model is set once in /admin.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Brain,
  ExternalLink,
  Loader2,
  Save,
  Sparkles,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";

type ThinkingVisibility = "auto" | "always-show" | "hide";
type Period = "today" | "7d" | "30d" | "all";

interface WorkspaceAiExtras {
  defaultThinkingVisibility: ThinkingVisibility;
  defaultSystemPrompt: string | null;
  defaultEmbeddingProviderId: string | null;
  defaultEmbeddingModel: string | null;
}

interface WorkspaceUsage {
  period: Period;
  totals: { tokens: number; requests: number; costUsd: number };
  byMode: Record<
    string,
    {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      requestCount: number;
      costUsd: number;
    }
  >;
  perProject: { projectId: string | null; requestCount: number; totalTokens: number }[];
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function fmtCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
function modeLabel(m: string): string {
  switch (m) {
    case "runtime-chat":  return "Runtime chat";
    case "runtime-embed": return "Runtime embeddings";
    case "agent":         return "Editor / builder";
    default:              return m;
  }
}

interface Props {
  workspaceId: string;
  isAdmin: boolean;
  addToast: (variant: "success" | "error", msg: string) => void;
}

export function DoableAiWorkspaceTab({ workspaceId, isAdmin, addToast }: Props) {
  const [extras, setExtras] = useState<WorkspaceAiExtras | null>(null);
  const [form, setForm] = useState({
    defaultThinkingVisibility: "auto" as ThinkingVisibility,
    defaultSystemPrompt: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Usage
  const [period, setPeriod] = useState<Period>("30d");
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);

  const loadExtras = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: WorkspaceAiExtras }>(
        `/workspaces/${workspaceId}/ai-extras`,
      );
      setExtras(res.data);
      setForm({
        defaultThinkingVisibility: res.data.defaultThinkingVisibility ?? "auto",
        defaultSystemPrompt: res.data.defaultSystemPrompt ?? "",
      });
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load workspace AI extras");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const loadUsage = useCallback(
    async (p: Period) => {
      setUsageLoading(true);
      try {
        const res = await apiFetch<{ data: WorkspaceUsage }>(
          `/workspaces/${workspaceId}/ai-usage?period=${encodeURIComponent(p)}`,
        );
        setUsage(res.data);
      } catch (e) {
        addToast("error", e instanceof Error ? e.message : "Failed to load workspace usage");
      } finally {
        setUsageLoading(false);
      }
    },
    [workspaceId, addToast],
  );

  useEffect(() => { void loadExtras(); }, [loadExtras]);
  useEffect(() => { void loadUsage(period); }, [loadUsage, period]);

  const save = useCallback(async () => {
    if (!isAdmin) {
      addToast("error", "Only workspace owners / admins can change workspace defaults.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ data: WorkspaceAiExtras }>(
        `/workspaces/${workspaceId}/ai-extras`,
        {
          method: "PUT",
          body: JSON.stringify({
            defaultThinkingVisibility: form.defaultThinkingVisibility,
            defaultSystemPrompt: form.defaultSystemPrompt.trim() || null,
          }),
        },
      );
      setExtras((prev) => ({
        ...(prev ?? {} as WorkspaceAiExtras),
        defaultThinkingVisibility: res.data.defaultThinkingVisibility,
        defaultSystemPrompt: res.data.defaultSystemPrompt,
      }));
      addToast("success", "Workspace AI defaults saved.");
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [form, workspaceId, isAdmin, addToast]);

  const totals = usage?.totals ?? { tokens: 0, requests: 0, costUsd: 0 };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex gap-3 items-start">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>{loadError}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/20 shrink-0">
              <Sparkles className="h-5 w-5 text-brand-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">Doable AI defaults</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Workspace-wide runtime AI defaults for apps generated in this workspace.
                Projects inherit these unless they pin their own values in
                <span className="px-1">Project&nbsp;Settings → Doable AI</span>.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <Link href="/ai-settings?tab=connections" className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1">
                  Configure chat provider <ExternalLink className="h-3 w-3" />
                </Link>
                <Link href="/admin?tab=plans&plansSub=embedding" className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-1">
                  Platform embedding model <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
                Default system prompt
              </div>
              <div className="mt-1 text-sm truncate" title={extras?.defaultSystemPrompt ?? "(none)"}>
                {extras?.defaultSystemPrompt
                  ? extras.defaultSystemPrompt.slice(0, 80) + (extras.defaultSystemPrompt.length > 80 ? "…" : "")
                  : <span className="text-muted-foreground">none set</span>}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Brain className="h-3.5 w-3.5" />
                Default embedding model
              </div>
              <div className="mt-1 text-sm font-mono truncate">
                {extras?.defaultEmbeddingModel ?? <span className="font-sans text-muted-foreground">platform default</span>}
              </div>
            </div>
          </div>

          {/* Default system prompt editor */}
          <div>
            <label className="text-xs font-medium text-foreground">Default system prompt</label>
            <textarea
              value={form.defaultSystemPrompt}
              onChange={(e) => setForm((f) => ({ ...f, defaultSystemPrompt: e.target.value }))}
              placeholder="e.g. Always answer in concise bullet points. Never reveal internal pricing. If you don't know, say so."
              rows={5}
              maxLength={4096}
              disabled={!isAdmin}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Prepended to every chat call for projects in this workspace that don't have their own
              system prompt override. {form.defaultSystemPrompt.length} / 4096 characters.
            </p>
          </div>

          {/* Thinking visibility */}
          <div>
            <p className="text-xs font-medium text-foreground mb-2">Default thinking visibility</p>
            <div className="space-y-2">
              {([
                {
                  id: "auto" as const,
                  title: "Auto",
                  body: "Apps receive the raw model output and decide rendering via stripThinking().",
                },
                {
                  id: "always-show" as const,
                  title: "Always show",
                  body: "Apps render the thinking disclosure expanded by default.",
                },
                {
                  id: "hide" as const,
                  title: "Hide (server-side strip)",
                  body: "Server strips all 17 thinking-tag families before any app sees them.",
                },
              ] as const).map((opt) => {
                const active = form.defaultThinkingVisibility === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${active ? "border-brand-500 bg-brand-600/10" : "border-border bg-background hover:border-brand-500/40"} ${!isAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="radio"
                      name="default-thinking"
                      value={opt.id}
                      checked={active}
                      disabled={!isAdmin}
                      onChange={() => setForm((f) => ({ ...f, defaultThinkingVisibility: opt.id }))}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{opt.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{opt.body}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {!isAdmin && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-500">
              You're a member of this workspace but not an admin — these defaults are read-only for you.
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void save()} disabled={saving || !isAdmin} size="sm" className="gap-1.5">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save defaults
            </Button>
          </div>
        </div>
      </div>

      {/* ── Usage ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-6 border-b border-border flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">Workspace AI usage</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Aggregate of every project's runtime AI calls in this workspace (editor / builder
              calls are shown separately under <code>agent</code> mode).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["today", "7d", "30d", "all"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${period === p ? "bg-brand-600 text-white" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`}
              >
                {p === "today" ? "Today" : p === "7d" ? "7d" : p === "30d" ? "30d" : "All"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Total tokens</div>
              <div className="mt-1 text-xl font-semibold">
                {usageLoading ? "…" : fmtTokens(totals.tokens)}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Requests</div>
              <div className="mt-1 text-xl font-semibold">
                {usageLoading ? "…" : totals.requests.toLocaleString()}
              </div>
            </div>
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Estimated cost</div>
              <div className="mt-1 text-xl font-semibold">
                {usageLoading ? "…" : fmtCost(totals.costUsd)}
              </div>
            </div>
          </div>

          {usage && Object.keys(usage.byMode).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">By mode</p>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Mode</th>
                      <th className="px-3 py-2 text-right font-medium">Requests</th>
                      <th className="px-3 py-2 text-right font-medium">Total tokens</th>
                      <th className="px-3 py-2 text-right font-medium">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(usage.byMode).map(([mode, v]) => (
                      <tr key={mode} className="border-t">
                        <td className="px-3 py-2">{modeLabel(mode)}</td>
                        <td className="px-3 py-2 text-right">{v.requestCount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{fmtTokens(v.totalTokens)}</td>
                        <td className="px-3 py-2 text-right">{fmtCost(v.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {usage && usage.perProject.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Top projects</p>
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Project</th>
                      <th className="px-3 py-2 text-right font-medium">Requests</th>
                      <th className="px-3 py-2 text-right font-medium">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usage.perProject.map((row) => (
                      <tr key={row.projectId ?? "(orphan)"} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.projectId ? (
                            <Link href={`/projects/${row.projectId}/settings?tab=doable-ai`} className="text-brand-400 hover:text-brand-300 underline underline-offset-2">
                              {row.projectId.slice(0, 8)}…
                            </Link>
                          ) : (
                            "(orphan)"
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{row.requestCount.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">{fmtTokens(row.totalTokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
