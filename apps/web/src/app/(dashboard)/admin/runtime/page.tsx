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
  HardDrive,
  Server,
  AlertTriangle,
  CheckCircle2,
  Network,
  X,
  Square,
  FileText,
  Shield,
  Search,
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
  const [stopping, setStopping] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [egressFor, setEgressFor] = useState<Instance | null>(null);
  const [logsFor, setLogsFor] = useState<Instance | null>(null);

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

  const stop = async (projectId: string, projectName: string) => {
    if (!confirm(`Stop "${projectName}"?\n\nThe app's systemd unit will be terminated. The user can restart it from their editor.`)) return;
    setStopping(projectId);
    try {
      await apiFetch(`/admin/runtime/${projectId}/stop`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stop failed");
    } finally {
      setStopping(null);
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
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLogsFor(r)}
                      className="h-6 px-2 text-[10px]"
                      title="View systemd journal logs (secrets auto-redacted)"
                    >
                      <FileText className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEgressFor(r)}
                      className="h-6 px-2 text-[10px]"
                      title="Egress policy + recent build-proxy activity"
                    >
                      <Network className="h-3 w-3" />
                    </Button>
                    {r.runtimeKind === "process" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => restart(r.projectId)}
                          disabled={restarting === r.projectId || stopping === r.projectId}
                          className="h-6 px-2 text-[10px]"
                          title="systemctl restart"
                        >
                          {restarting === r.projectId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCw className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => stop(r.projectId, r.projectName)}
                          disabled={stopping === r.projectId || restarting === r.projectId || r.state === "stopped"}
                          className="h-6 px-2 text-[10px] text-red-300 hover:bg-red-500/10 hover:text-red-200 border-red-500/30"
                          title="systemctl stop — terminate the running process"
                        >
                          {stopping === r.projectId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Square className="h-3 w-3" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
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

      {egressFor && <EgressDrawer instance={egressFor} onClose={() => setEgressFor(null)} />}
      {logsFor && <LogsDrawer instance={logsFor} onClose={() => setLogsFor(null)} />}
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

interface EgressData {
  projectSlug: string;
  systemdUnit: string | null;
  egressHosts: string[];
  buildProxy: {
    enabled: string | null;
    recentEntries: { timestamp: string; action: string; method: string; url: string; bytes: number }[];
    note: string | null;
  };
  egressDenials: {
    recentEvents: string[];
    note: string | null;
  };
}

function EgressDrawer({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [data, setData] = useState<EgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{ data: EgressData }>(`/admin/runtime/${instance.projectId}/egress`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load egress data"))
      .finally(() => setLoading(false));
  }, [instance.projectId]);

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[640px] max-w-full bg-background border-l border-border overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-muted-foreground">Egress for</div>
            <div className="text-base font-semibold">{instance.projectName}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{instance.projectSlug}</div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading egress data…
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-5">
            {/* Allow-list */}
            <section>
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Egress allow-list (systemd <code>IPAddressAllow</code>)
              </h2>
              {data.egressHosts.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 rounded-md border border-border bg-muted/30">
                  None configured. App can reach <code>localhost</code> only — all other outbound TCP is blocked by <code>IPAddressDeny=any</code>.
                </div>
              ) : (
                <ul className="text-xs font-mono rounded-md border border-border divide-y divide-border">
                  {data.egressHosts.map((h, i) => (
                    <li key={i} className="px-3 py-1.5">{h}</li>
                  ))}
                </ul>
              )}
            </section>

            {/* Build proxy */}
            <section>
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Build-time proxy (Squid){" "}
                <span className="text-[10px] normal-case text-muted-foreground">
                  {data.buildProxy.enabled ? `→ ${data.buildProxy.enabled}` : "(disabled)"}
                </span>
              </h2>
              {data.buildProxy.note && (
                <div className="text-[11px] text-muted-foreground mb-2">{data.buildProxy.note}</div>
              )}
              {data.buildProxy.recentEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 rounded-md border border-border bg-muted/30">
                  No recent build-proxy activity captured.
                </div>
              ) : (
                <div className="rounded-md border border-border max-h-[300px] overflow-y-auto">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr className="text-left text-muted-foreground">
                        <th className="px-2 py-1">Time</th>
                        <th className="px-2 py-1">Action</th>
                        <th className="px-2 py-1">Method</th>
                        <th className="px-2 py-1">URL</th>
                        <th className="px-2 py-1 text-right">Bytes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.buildProxy.recentEntries.slice().reverse().map((e, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1">{e.timestamp.slice(11, 19)}</td>
                          <td className="px-2 py-1">{e.action}</td>
                          <td className="px-2 py-1">{e.method}</td>
                          <td className="px-2 py-1 truncate max-w-[280px]" title={e.url}>{e.url}</td>
                          <td className="px-2 py-1 text-right">{e.bytes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Denials */}
            <section>
              <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Recent egress denials (journal, last hour)
              </h2>
              {data.egressDenials.note && (
                <div className="text-[11px] text-muted-foreground mb-2">{data.egressDenials.note}</div>
              )}
              {data.egressDenials.recentEvents.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 rounded-md border border-border bg-muted/30">
                  No deny events. (No outbound attempts blocked, or systemd's BPF firewall isn't logging at this level.)
                </div>
              ) : (
                <pre className="text-[11px] font-mono rounded-md border border-border bg-black/40 p-2 max-h-[200px] overflow-auto">
                  {data.egressDenials.recentEvents.join("\n")}
                </pre>
              )}
            </section>

            <div className="text-[11px] text-muted-foreground pt-2 border-t border-border">
              Systemd unit: <code>{data.systemdUnit ?? "—"}</code>. Egress policy is
              enforced at the cgroup level by systemd's <code>IPAddressDeny=any</code> +
              per-project <code>IPAddressAllow=...</code>.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface LogsData {
  lines: string[];
  systemdUnit?: string;
  totalLines?: number;
  filteredLines?: number;
  redacted?: boolean;
  note?: string;
}

const LOG_LINE_RE = /^(\S+)\s+\S+\s+\S+\s+(.*)$/;

function classifyLogLine(line: string): "error" | "warn" | "info" | "debug" {
  const lower = line.toLowerCase();
  if (/\b(error|err|fatal|panic|exception|failed|failure)\b/.test(lower)) return "error";
  if (/\b(warn|warning|deprecated)\b/.test(lower)) return "warn";
  if (/\bdebug\b/.test(lower)) return "debug";
  return "info";
}

function LogsDrawer({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [data, setData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState(200);
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ lines: String(lines) });
      if (search) params.set("search", search);
      const r = await apiFetch<{ data: LogsData }>(
        `/admin/runtime/${instance.projectId}/logs?${params.toString()}`,
      );
      setData(r.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [instance.projectId, lines, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [autoRefresh, load]);

  const copyAll = () => {
    if (data?.lines) {
      navigator.clipboard.writeText(data.lines.join("\n")).catch(() => {});
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[800px] max-w-full bg-background border-l border-border flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Logs for
            </div>
            <div className="text-base font-semibold mt-0.5">{instance.projectName}</div>
            <div className="text-[11px] text-muted-foreground font-mono">
              {data?.systemdUnit ?? `doable-app@${instance.projectSlug}.service`}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Redaction notice */}
        {data?.redacted && (
          <div className="px-5 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-1.5">
            <Shield className="h-3 w-3" />
            Secrets auto-redacted (passwords, JWTs, API keys, hex blobs, DB URLs). Every view is recorded in the admin audit log.
          </div>
        )}

        {/* Toolbar */}
        <div className="px-5 py-2 border-b border-border flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter lines…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              className="w-full pl-7 pr-2 py-1 text-xs rounded-md border border-border bg-background"
            />
          </div>
          <select
            value={lines}
            onChange={(e) => setLines(parseInt(e.target.value, 10))}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="100">Last 100</option>
            <option value="200">Last 200</option>
            <option value="500">Last 500</option>
            <option value="1000">Last 1000</option>
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="h-7 gap-1">
            <RotateCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            <span className="text-[10px]">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh((v) => !v)}
            className="h-7 gap-1"
          >
            <RefreshCw className={`h-3 w-3 ${autoRefresh ? "text-emerald-400" : "text-muted-foreground"}`} />
            <span className="text-[10px]">{autoRefresh ? "Live" : "Off"}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={copyAll} className="h-7" title="Copy all visible lines">
            <span className="text-[10px]">Copy</span>
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-black/40 font-mono text-[11px]">
          {error && (
            <div className="m-3 p-3 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
              {error}
            </div>
          )}
          {loading && !data && (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading logs…
            </div>
          )}
          {data && data.lines.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {data.note ?? "No log lines found."}
            </div>
          )}
          {data && data.lines.length > 0 && (
            <div>
              {data.lines.map((line, i) => {
                const level = classifyLogLine(line);
                const colorCls =
                  level === "error" ? "text-red-300" :
                  level === "warn" ? "text-amber-300" :
                  level === "debug" ? "text-zinc-500" :
                  "text-zinc-200";
                const m = LOG_LINE_RE.exec(line);
                const ts = m?.[1] ?? "";
                const msg = m?.[2] ?? line;
                return (
                  <div
                    key={i}
                    className={`px-4 py-0.5 leading-relaxed border-l-2 ${level === "error" ? "border-red-500/40 bg-red-500/5" : level === "warn" ? "border-amber-500/40 bg-amber-500/5" : "border-transparent"} hover:bg-muted/20`}
                  >
                    <span className="text-zinc-600 mr-2">{ts}</span>
                    <span className={colorCls}>{msg}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {data && (
          <div className="px-5 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between">
            <span>
              {data.filteredLines ?? data.lines.length} lines
              {data.totalLines && data.filteredLines !== data.totalLines && (
                <span className="text-muted-foreground/70"> of {data.totalLines} fetched</span>
              )}
            </span>
            <span>journalctl -u {data.systemdUnit ?? "…"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
