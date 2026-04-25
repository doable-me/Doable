"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Activity,
  Loader2,
  RotateCcw,
  Trash2,
  Zap,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

// ─── Thumbnails Panel ────────────────────────────────────────

interface ThumbnailLog {
  id: string;
  project_id: string;
  project_name: string | null;
  current_project_name: string | null;
  status: string;
  preview_url: string | null;
  error_message: string | null;
  duration_ms: number | null;
  triggered_by: string;
  created_at: string;
}

interface GenerateResult {
  total: number;
  missing: number;
  queued: number;
  message: string;
}

export function ThumbnailsPanel() {
  const [logs, setLogs] = useState<ThumbnailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: ThumbnailLog[] }>("/admin/thumbnail-logs?limit=100");
      setLogs(res.data);
    } catch (e) {
      console.error("Failed to fetch thumbnail logs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleGenerateMissing = useCallback(async () => {
    setGenerating(true);
    setResult(null);
    try {
      const res = await apiFetch<{ data: GenerateResult }>("/admin/thumbnails/generate-missing", { method: "POST" });
      setResult(res.data);
      setTimeout(() => fetchLogs(), 3000);
    } catch (e) {
      console.error("Failed to generate thumbnails:", e);
    } finally {
      setGenerating(false);
    }
  }, [fetchLogs]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case "skipped": return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
      default: return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Generate missing project thumbnails and view the generation log.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleGenerateMissing} disabled={generating} className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm">
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</> : <><Play className="h-4 w-4" /> Generate Missing Thumbnails</>}
          </Button>
          <Button onClick={fetchLogs} variant="outline" className="gap-2 text-sm">
            <RotateCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>
      {result && (
        <div className="rounded-lg border border-brand-800/50 bg-brand-900/20 px-4 py-3 text-sm">
          <p className="text-brand-300 font-medium">{result.message}</p>
          <p className="text-muted-foreground text-xs mt-1">Total projects: {result.total} | Missing: {result.missing} | Queued: {result.queued}</p>
        </div>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-card px-4 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Generation Log</h3>
          <span className="text-xs text-muted-foreground">{logs.length} entries</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">No thumbnail generation logs yet. Click &quot;Generate Missing Thumbnails&quot; to start.</div>
        ) : (
          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-accent">
                {statusIcon(log.status)}
                <div className="flex-1 min-w-0">
                  <span className="text-foreground font-medium truncate block">{log.current_project_name ?? log.project_name ?? log.project_id.slice(0, 8)}</span>
                  {log.error_message && <span className="text-xs text-red-400 truncate block">{log.error_message}</span>}
                </div>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${log.triggered_by === "admin" ? "bg-purple-900/30 text-purple-400" : log.triggered_by === "regenerate" ? "bg-blue-900/30 text-blue-400" : "bg-secondary text-muted-foreground"}`}>{log.triggered_by}</span>
                {log.duration_ms != null && <span className="text-xs text-muted-foreground">{log.duration_ms}ms</span>}
                <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Copilot Sessions Panel ─────────────────────────────────

interface CopilotChatSession {
  sessionKey: string;
  projectId: string;
  sessionId: string;
  isVisualEdit: boolean;
  active: boolean;
  mode: string | null;
  startedAt: number | null;
}

interface CopilotEngineEntry {
  projectId: string;
  projectName: string | null;
  sessionCount: number;
  activeRequests: number;
  createdAt: number;
  lastUsed: number;
  idleMs: number;
  ageMs: number;
  chatSessions: CopilotChatSession[];
}

interface CopilotSessionsData {
  engines: CopilotEngineEntry[];
  poolSize: number;
  maxEngines: number;
  processMemory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  uptime: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function CopilotSessionsPanel() {
  const [data, setData] = useState<CopilotSessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [terminating, setTerminating] = useState<Set<string>>(new Set());
  const [terminatingAll, setTerminatingAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch<{ data: CopilotSessionsData }>("/admin/copilot-sessions");
      setData(res.data);
      setError(null);
    } catch (e) {
      console.error("Failed to fetch copilot sessions:", e);
      if (!data) setError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const handleTerminate = useCallback(async (projectId: string) => {
    setTerminating((prev) => new Set(prev).add(projectId));
    try {
      await apiFetch(`/admin/copilot-sessions/${projectId}`, { method: "DELETE" });
      await fetchSessions();
    } catch (e) {
      console.error("Failed to terminate session:", e);
    } finally {
      setTerminating((prev) => { const next = new Set(prev); next.delete(projectId); return next; });
    }
  }, [fetchSessions]);

  const handleTerminateAll = useCallback(async () => {
    setTerminatingAll(true);
    try {
      await apiFetch("/admin/copilot-sessions", { method: "DELETE" });
      await fetchSessions();
    } catch (e) {
      console.error("Failed to terminate all sessions:", e);
    } finally {
      setTerminatingAll(false);
    }
  }, [fetchSessions]);

  if (loading && !data) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
        <p className="text-sm text-muted-foreground">{error ?? "No session data available"}</p>
        <Button onClick={() => { setLoading(true); setError(null); fetchSessions(); }} variant="outline" className="gap-2 text-sm">
          <RotateCcw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-brand-400" /><span className="text-foreground font-medium">{data.poolSize}</span>/{data.maxEngines} engines</span>
          <span>RSS <span className="text-foreground font-medium">{formatBytes(data.processMemory.rss)}</span></span>
          <span>Heap <span className="text-foreground font-medium">{formatBytes(data.processMemory.heapUsed)}</span> / {formatBytes(data.processMemory.heapTotal)}</span>
          <span>Uptime <span className="text-foreground font-medium">{formatUptime(data.uptime)}</span></span>
        </div>
        <div className="flex items-center gap-2">
          {data.poolSize > 0 && (
            <Button onClick={handleTerminateAll} disabled={terminatingAll} variant="outline" className="gap-2 text-sm border-red-800/50 text-red-400 hover:bg-red-900/20 hover:text-red-300">
              {terminatingAll ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stopping...</> : <><Square className="h-3.5 w-3.5" /> Stop All Engines</>}
            </Button>
          )}
          <Button onClick={fetchSessions} variant="outline" className="gap-2 text-sm">
            <RotateCcw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Auto-refreshes every 5 seconds. Each engine is a per-project Copilot CLI subprocess.</p>
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-card px-4 py-2.5 border-b border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Engines</h3>
        </div>
        {data.engines.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">No active Copilot engines. Sessions start when users interact with AI in the editor.</div>
        ) : (
          <div className="divide-y divide-border">
            {data.engines.map((engine) => (
              <div key={engine.projectId} className="px-4 py-3 hover:bg-accent">
                <div className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${engine.activeRequests > 0 ? "bg-green-500 animate-pulse" : "bg-muted"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground font-medium truncate">{engine.projectName ?? "Unknown Project"}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{engine.projectId.slice(0, 8)}</span>
                    </div>
                    {engine.chatSessions.length > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        {engine.chatSessions.map((cs) => (
                          <span key={cs.sessionKey} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${cs.active ? "bg-green-900/30 text-green-400" : "bg-secondary text-muted-foreground"}`}>
                            {cs.isVisualEdit ? "visual-edit" : cs.mode ?? "idle"}
                            {cs.active && cs.startedAt ? ` (${formatDuration(Date.now() - cs.startedAt)})` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span title="Active requests">{engine.activeRequests > 0 ? <span className="text-green-400 font-medium">{engine.activeRequests} active</span> : <span className="text-muted-foreground">idle</span>}</span>
                    <span title="Sessions">{engine.sessionCount} sess</span>
                    <span title="Engine age">age {formatDuration(engine.ageMs)}</span>
                    <span title="Time since last use">idle {formatDuration(engine.idleMs)}</span>
                  </div>
                  <Button onClick={() => handleTerminate(engine.projectId)} disabled={terminating.has(engine.projectId)} variant="outline" className="gap-1.5 text-xs border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-300 h-7 px-2">
                    {terminating.has(engine.projectId) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Kill
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
