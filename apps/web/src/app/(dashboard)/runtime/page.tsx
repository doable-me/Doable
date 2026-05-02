"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Server } from "lucide-react";
import {
  apiListWorkspaceInstances,
  type ApiWorkspaceInstance,
} from "@/lib/api";

const POLL_MS = 8000;

function formatUptime(ms: number | null): string {
  if (ms === null) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function formatBytes(b: number | null): string {
  if (b === null) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatLastActive(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  return `${formatUptime(ms)} ago`;
}

const STATE_STYLES: Record<string, string> = {
  running: "bg-green-500/10 text-green-400 border-green-500/30",
  stopped: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
  unknown: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

export default function RuntimeInstancesPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [instances, setInstances] = useState<ApiWorkspaceInstance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWorkspaceId(localStorage.getItem("doable_active_workspace_id"));
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiListWorkspaceInstances(workspaceId);
        if (!cancelled) {
          setInstances(res.data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load instances");
          setLoading(false);
        }
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [workspaceId]);

  const allMetricsUnavailable =
    instances !== null && instances.length > 0 && instances.every((i) => i.source === "none");

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 py-8">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
          <Server className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Running instances</h1>
          <p className="text-xs text-muted-foreground">
            Live runtime state across every published project in this workspace · poll {POLL_MS / 1000}s
          </p>
        </div>
      </header>

      {!workspaceId && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Select a workspace from the sidebar to see its running instances.
        </div>
      )}

      {workspaceId && loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-sm text-muted-foreground">Loading instances…</p>
        </div>
      )}

      {workspaceId && error && (
        <div className="mb-6 rounded-lg border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {workspaceId && !loading && !error && instances && instances.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <Server className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            No running instances yet. Publish a project to see it here.
          </p>
        </div>
      )}

      {workspaceId && !loading && !error && instances && instances.length > 0 && (
        <>
          {allMetricsUnavailable && (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300/90">
              Runtime metrics are collected on the production server (systemd + cgroup). In dev they show as
              &quot;unknown&quot; with empty memory/CPU values.
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">Project</th>
                  <th className="px-4 py-3 text-left font-medium">State</th>
                  <th className="px-4 py-3 text-right font-medium">Uptime</th>
                  <th className="px-4 py-3 text-right font-medium">Memory</th>
                  <th className="px-4 py-3 text-right font-medium">CPU</th>
                  <th className="px-4 py-3 text-right font-medium">Last active</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => {
                  const stateClass =
                    STATE_STYLES[inst.state] ?? STATE_STYLES.unknown;
                  return (
                    <tr key={inst.projectId} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{inst.projectName}</div>
                        <div className="text-xs text-muted-foreground">{inst.projectSlug}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${stateClass}`}
                        >
                          {inst.state}
                        </span>
                        {inst.failCount > 0 && (
                          <span className="ml-2 text-[11px] text-red-400">
                            {inst.failCount} fail{inst.failCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-foreground">{formatUptime(inst.uptimeMs)}</td>
                      <td className="px-4 py-3 text-right text-foreground">{formatBytes(inst.memoryBytes)}</td>
                      <td className="px-4 py-3 text-right text-foreground">
                        {inst.cpuPct === null ? "—" : `${inst.cpuPct.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatLastActive(inst.lastActiveAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
