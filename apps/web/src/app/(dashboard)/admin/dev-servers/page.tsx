"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  RotateCw,
  HardDrive,
  Code2,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Square,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";

interface DevServer {
  projectId: string;
  projectName: string;
  projectSlug: string;
  workspaceName: string;
  ownerEmail: string | null;
  frameworkId: string;
  port: number;
  pid: number | undefined;
  url: string;
  listenAddr: string;
  startedAt: string;
  uptimeMs: number;
  ready: boolean;
  alive: boolean;
  memoryBytes: number | null;
}

interface Summary {
  total: number;
  alive: number;
  ready: number;
  totalMemoryBytes: number;
}

const REFRESH_MS = 5_000;

function fmtBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function DevServersAdminPage() {
  const router = useRouter();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [servers, setServers] = useState<DevServer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [killing, setKilling] = useState<string | null>(null);

  const kill = async (projectId: string, projectName: string) => {
    if (!confirm(`Kill dev server for "${projectName}"?\n\nThe Vite process will be terminated. The user can restart it from their editor.`)) return;
    setKilling(projectId);
    try {
      await apiFetch(`/admin/dev-servers/${projectId}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kill failed");
    } finally {
      setKilling(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ data: { servers: DevServer[]; summary: Summary } }>(
        "/admin/dev-servers",
      );
      setServers(r.data.servers);
      setSummary(r.data.summary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dev servers");
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
        <Button onClick={() => router.push("/dashboard")}>Back to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Back to Admin
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/20">
            <Code2 className="h-5 w-5 text-brand-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Dev Servers (Editor Previews)</h1>
            <p className="text-sm text-muted-foreground">
              In-memory Vite/dev-server processes serving live editor previews. Ports allocated from <code className="text-[11px]">3100-3200</code>.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAutoRefresh((v) => !v)} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${autoRefresh ? "text-emerald-400" : "text-muted-foreground"}`} />
            {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RotateCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryCard icon={<Code2 className="h-4 w-4" />} label="Total servers" value={summary.total} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} label="Alive" value={summary.alive} />
          <SummaryCard icon={<CheckCircle2 className="h-4 w-4 text-brand-400" />} label="Ready" value={summary.ready} />
          <SummaryCard icon={<HardDrive className="h-4 w-4" />} label="Total RAM" value={fmtBytes(summary.totalMemoryBytes)} />
        </div>
      )}

      {error && (
        <div className="mb-3 p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-border">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Owner / Workspace</th>
              <th className="px-3 py-2 font-medium">Framework</th>
              <th className="px-3 py-2 font-medium">Listen</th>
              <th className="px-3 py-2 font-medium text-right">PID</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Memory</th>
              <th className="px-3 py-2 font-medium text-right">Uptime</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && servers.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </td></tr>
            ) : servers.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                <div className="space-y-2">
                  <div>No active dev servers.</div>
                  <div className="text-[11px]">
                    Vite/Next dev servers spawn when a user opens the editor preview, and exit when the API restarts or the user idles out.
                    To see ALL projects, open <Link href="/admin/projects" className="text-brand-400 hover:underline">Projects</Link>.
                  </div>
                </div>
              </td></tr>
            ) : servers.map((s) => (
              <tr key={s.projectId} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                <td className="px-3 py-2">
                  <Link href={`/editor/${s.projectId}`} className="text-foreground hover:text-brand-400 font-medium">
                    {s.projectName}
                  </Link>
                  <div className="text-[10px] text-muted-foreground font-mono">{s.projectSlug}</div>
                </td>
                <td className="px-3 py-2">
                  <div>{s.ownerEmail ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground">{s.workspaceName}</div>
                </td>
                <td className="px-3 py-2 font-mono text-[11px]">{s.frameworkId}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{s.listenAddr}</td>
                <td className="px-3 py-2 text-right font-mono">{s.pid ?? "—"}</td>
                <td className="px-3 py-2">
                  {!s.alive ? (
                    <span className="inline-flex items-center gap-1 text-red-400 text-[10px]">
                      <Circle className="h-2.5 w-2.5 fill-red-400" /> dead
                    </span>
                  ) : s.ready ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400 text-[10px]">
                      <Circle className="h-2.5 w-2.5 fill-emerald-400" /> ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-400 text-[10px]">
                      <Circle className="h-2.5 w-2.5 fill-amber-400" /> starting
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmtBytes(s.memoryBytes)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmtUptime(s.uptimeMs)}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => kill(s.projectId, s.projectName)}
                    disabled={killing === s.projectId || !s.alive}
                    className="h-6 px-2 text-[10px] text-red-300 hover:bg-red-500/10 hover:text-red-200 border-red-500/30"
                    title="Terminate this Vite process"
                  >
                    {killing === s.projectId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Square className="h-3 w-3" />
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-[11px] text-muted-foreground">
        Source: in-memory <code>servers</code> map in <code>services/api/src/projects/dev-server-core.ts</code>.
        Memory is RSS from <code>/proc/&lt;pid&gt;/status</code>. Each Vite process is jailed by dovault (FS jail + cgroup + Node permission model).
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
