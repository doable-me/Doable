"use client";

/**
 * /admin/trace/[traceId] — trace detail page.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ header (trace meta + linked chat_trace link) │
 *   ├──────────────────────────────────────────────┤
 *   │ flame graph (full width)                     │
 *   ├──────────────────────────┬───────────────────┤
 *   │ logs (left, scrollable)  │ span detail panel │
 *   └──────────────────────────┴───────────────────┘
 */
import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Activity, Loader2, ShieldCheck, MessageSquare } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { usePlatformAdmin } from "@/hooks/use-platform-admin";
import { Button } from "@/components/ui/button";
import { FlameGraph, type Span } from "../_components/flame-graph";
import { SpanDetail, type TraceLog } from "../_components/span-detail";

interface TraceHeader {
  trace_id: string;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  workspace_id: string | null;
  user_id: string | null;
  project_id: string | null;
  root_span_name: string | null;
  status: string;
  error_count: number;
  span_count: number;
  services: string[];
}

interface ChatTraceLink {
  id: string;
  project_id: string | null;
  user_id: string | null;
  session_id: string | null;
  created_at: string;
  otel_trace_id: string | null;
  otel_root_span_id: string | null;
}

interface Bundle {
  trace: TraceHeader;
  spans: Span[];
  logs: TraceLog[];
  chat_trace: ChatTraceLink | null;
}

export default function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = use(params);
  const router = useRouter();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<Bundle>(`/admin/traces/${traceId}`);
        if (!cancelled) {
          setBundle(res);
          // auto-select root or first errored span
          const firstError = res.spans.find((s) => s.status_code === "ERROR");
          const root = res.spans.find((s) => !s.parent_span_id);
          setSelectedSpanId(firstError?.span_id ?? root?.span_id ?? res.spans[0]?.span_id ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trace");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [isPlatformAdmin, traceId]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isPlatformAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <ShieldCheck className="h-12 w-12" />
        <p className="font-medium text-foreground">Platform admin access required</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !bundle) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-8">
        <Link
          href="/admin/trace"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to search
        </Link>
        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error ?? "Trace not found"}
        </div>
      </div>
    );
  }

  const { trace, spans, logs, chat_trace: chatTrace } = bundle;
  const totalMs = trace.duration_ms ?? maxSpanDuration(spans);
  const selectedSpan = spans.find((s) => s.span_id === selectedSpanId) ?? null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-2 flex items-center gap-3">
          <Link
            href="/admin/trace"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Trace search
          </Link>
        </div>
        <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-foreground">
          <Activity className="h-5 w-5 text-brand-400" />
          {trace.root_span_name ?? trace.trace_id}
        </h1>
        <p className="mb-4 font-mono text-xs text-muted-foreground">trace_id: {trace.trace_id}</p>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Status" value={trace.status} highlight={trace.status === "error"} />
          <Stat label="Duration" value={trace.duration_ms != null ? `${trace.duration_ms}ms` : "—"} />
          <Stat label="Spans" value={String(trace.span_count)} />
          <Stat label="Errors" value={String(trace.error_count)} highlight={trace.error_count > 0} />
          <Stat label="Started" value={new Date(trace.started_at).toLocaleString()} />
          <Stat label="Services" value={(trace.services ?? []).join(", ") || "—"} />
          <Stat label="User" value={trace.user_id ? short(trace.user_id) : "—"} />
          <Stat label="Workspace" value={trace.workspace_id ? short(trace.workspace_id) : "—"} />
        </div>

        {chatTrace && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-brand-500/40 bg-brand-500/10 px-4 py-2 text-sm text-brand-200">
            <MessageSquare className="h-4 w-4" />
            <span>Linked chat trace:</span>
            <Link
              href={`/admin/chat-trace/${chatTrace.id}`}
              className="font-mono text-xs underline hover:text-brand-100"
            >
              {chatTrace.id}
            </Link>
            {chatTrace.session_id && (
              <span className="font-mono text-[11px] text-brand-300/80">
                session: {short(chatTrace.session_id)}
              </span>
            )}
          </div>
        )}

        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Flame graph</h2>
          <FlameGraph
            spans={spans}
            traceStartedAt={trace.started_at}
            totalMs={Math.max(totalMs, 1)}
            selectedSpanId={selectedSpanId}
            onSelect={setSelectedSpanId}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">All logs</h2>
            <LogsPanel logs={logs} />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold text-foreground">Span detail</h2>
            {selectedSpan ? (
              <SpanDetail span={selectedSpan} logs={logs} />
            ) : (
              <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                Click a span in the flame graph to inspect.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-red-400" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function LogsPanel({ logs }: { logs: TraceLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        No correlated logs.
      </p>
    );
  }
  return (
    <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card">
      <ul className="divide-y divide-border/40">
        {logs.map((l) => (
          <li key={l.id} className="px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
              <span className={levelColor(l.level)}>{l.level}</span>
              <span className="text-muted-foreground">{l.service}</span>
              <span className="text-muted-foreground">{new Date(l.ts).toISOString().slice(11, 23)}</span>
              {l.span_id && (
                <span className="font-mono text-muted-foreground">{short(l.span_id)}</span>
              )}
            </div>
            <p className="mt-0.5 break-words font-mono text-xs text-foreground">{l.message}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case "error":
    case "fatal":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "info":
      return "text-blue-400";
    case "debug":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

function short(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function maxSpanDuration(spans: Span[]): number {
  let m = 0;
  for (const s of spans) {
    if (s.duration_ms != null && s.duration_ms > m) m = s.duration_ms;
  }
  return m;
}
