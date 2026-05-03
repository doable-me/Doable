"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Loader2,
  RefreshCw,
  RotateCw,
  Cpu,
  HardDrive,
  Clock,
  Server,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";

interface Instance {
  projectId: string;
  projectName: string;
  projectSlug: string;
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string | null;
  frameworkId: string;
  runtimeKind: "static" | "process";
  listenKind: "unix-socket" | "tcp-port" | null;
  listenAddr: string | null;
  systemdUnit: string | null;
  sandboxUser: string;
  dbState: string;
  failCount: number;
  lastActiveAt: string | null;
  lastStartedAt: string | null;
  state: "running" | "stopped" | "failed" | "unknown";
  uptimeMs: number | null;
  memoryBytes: number | null;
  cpuPct: number | null;
  source: "cgroup" | "ps" | "none";
}

interface Summary {
  total: number;
  running: number;
  failed: number;
  stopped: number;
  totalMemoryBytes: number;
}

const REFRESH_MS = 5_000;

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtUptime(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function fmtAge(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

function StateBadge({ state }: { state: string }) {
  const cls =
    state === "running"
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : state === "failed"
      ? "bg-red-500/15 text-red-300 border-red-500/30"
      : state === "stopped"
      ? "bg-zinc-500/15 text-zinc-300 border-zinc-500/30"
      : "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {state}
    </span>
  );
}

export default function RuntimeAdminPage() {
  const router = useRouter();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [restarting, setRestarting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ data: { instances: Instance[]; summary: Summary } }>(
        "/admin/runtime/instances",
      );
      setInstances(r.data.instances);
      setSummary(r.data.summary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runtime instances");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    load();
  }, [isPlatformAdmin, load]);

  useEffect(() => {
    if (!autoRefresh || !isPlatformAdmin) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [autoRefresh, isPlatformAdmin, load]);

  const restart = async (projectId: string) => {
    setRestarting(projectId);
    try {
      await apiFetch(`/projects/${projectId}/runtime/restart`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restart failed");
    } finally {
      setRestarting(null);
    }
  };

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-3" />
        <h1 className="text-xl font-semibold mb-2">Platform admin required</h1>
        <p className="text-sm text-muted-foreground mb-4">
          This page lists runtime state for every project on the host.
        </p>
        <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  const filtered = instances.filter((r) => {
    if (stateFilter !== "all" && r.state !== stateFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.projectName.toLowerCase().includes(q) ||
        r.workspaceName.toLowerCase().includes(q) ||
        (r.ownerEmail ?? "").toLowerCase().includes(q) ||
        r.frameworkId.toLowerCase().includes(q) ||
        (r.listenAddr ?? "").includes(q) ||
        r.sandboxUser.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <Server className="h-5 w-5 text-brand-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Runtime Instances</h1>
            <p className="text-sm text-muted-foreground">
              Every running project across the platform: framework, owner, port, CPU, memory, uptime, sandbox user.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "text-emerald-400" : "text-muted-foreground"}`} />
            {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <SummaryCard icon={<Activity className="h-4 w-4" />} label="Total" value={summary.total} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} label="Running" value={summary.running} />
          <SummaryCard icon={<AlertTriangle className="h-4 w-4 text-red-400" />} label="Failed" value={summary.failed} />
          <SummaryCard icon={<Server className="h-4 w-4 text-zinc-400" />} label="Stopped" value={summary.stopped} />
          <SummaryCard icon={<HardDrive className="h-4 w-4" />} label="Total RAM" value={fmtBytes(summary.totalMemoryBytes)} />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Filter by project, owner, framework, port…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          <option value="all">All states</option>
          <option value="running">Running</option>
          <option value="failed">Failed</option>
          <option value="stopped">Stopped</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Owner / Workspace</th>
              <th className="px-3 py-2 font-medium">Framework</th>
              <th className="px-3 py-2 font-medium">Listen</th>
              <th className="px-3 py-2 font-medium">Sandbox user</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium text-right">CPU</th>
              <th className="px-3 py-2 font-medium text-right">Memory</th>
              <th className="px-3 py-2 font-medium text-right">Uptime</th>
              <th className="px-3 py-2 font-medium">Last active</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && instances.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                No instances match your filter.
              </td></tr>
            ) : filtered.map((r) => (
              <tr key={r.projectId} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link href={`/editor/${r.projectId}`} className="text-foreground hover:text-brand-400 font-medium">
                    {r.projectName}
                  </Link>
                  <div className="text-[10px] text-muted-foreground font-mono">{r.projectSlug}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="text-foreground">{r.ownerEmail ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{r.workspaceName}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.frameworkId}</td>
                <td className="px-3 py-2 font-mono text-[11px]">
                  {r.listenAddr ?? <span className="text-muted-foreground">static</span>}
                  {r.listenKind && <div className="text-[10px] text-muted-foreground">{r.listenKind}</div>}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-zinc-300">{r.sandboxUser}</td>
                <td className="px-3 py-2"><StateBadge state={r.state} /></td>
                <td className="px-3 py-2 text-right font-mono">
                  {r.cpuPct != null ? `${r.cpuPct.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtBytes(r.memoryBytes)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtUptime(r.uptimeMs)}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtAge(r.lastActiveAt)}</td>
                <td className="px-3 py-2 text-right">
                  {r.runtimeKind === "process" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restart(r.projectId)}
                      disabled={restarting === r.projectId}
                      className="h-6 px-2 text-[10px]"
                    >
                      {restarting === r.projectId ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Restart"
                      )}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">
        Metrics source: systemd cgroups via <code>/sys/fs/cgroup/system.slice/doable-app@&lt;slug&gt;.service</code>.
        Sandbox user is the per-project Linux UID created by Wave 27 (<code>useradd doable-&lt;slug&gt;</code>).
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase tracking-wide mb-1">
        {icon} {label}
      </div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
