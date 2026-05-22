"use client";

import { useEffect, useState } from "react";
import { apiGetRuntimeMetrics, type ApiInstanceMetrics } from "@/lib/api";

const POLL_MS = 5000;

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

const STATE_STYLES: Record<string, string> = {
  running: "bg-green-500/10 text-green-400 border-green-500/30",
  stopped: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
  failed: "bg-red-500/10 text-red-400 border-red-500/30",
  unknown: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

export function RuntimePanel({ projectId }: { projectId: string }) {
  const [metrics, setMetrics] = useState<ApiInstanceMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiGetRuntimeMetrics(projectId);
        if (!cancelled) {
          setMetrics(res.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load metrics");
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
        Metrics unavailable: {error}
      </div>
    );
  }
  if (!metrics) {
    return (
      <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
        Loading runtime metrics…
      </div>
    );
  }
  if (metrics.source === "none") {
    // No runtime metrics available (dev environment) — render nothing.
    return null;
  }
  const stateClass = STATE_STYLES[metrics.state] ?? STATE_STYLES.unknown;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${stateClass}`}
        >
          {metrics.state}
        </span>
        <span className="text-[10px] text-muted-foreground">poll {POLL_MS / 1000}s</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Uptime</div>
          <div className="font-medium text-foreground">{formatUptime(metrics.uptimeMs)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Memory</div>
          <div className="font-medium text-foreground">{formatBytes(metrics.memoryBytes)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CPU</div>
          <div className="font-medium text-foreground">
            {metrics.cpuPct === null ? "—" : `${metrics.cpuPct.toFixed(1)}%`}
          </div>
        </div>
      </div>
    </div>
  );
}
