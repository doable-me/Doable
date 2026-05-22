"use client";

/**
 * Side panel for the selected span. Tabs:
 *   Attributes / Events / Exception / Logs (logs filtered to this span_id)
 */
import { useState } from "react";
import type { Span } from "./flame-graph";

export interface TraceLog {
  id: string;
  ts: string;
  trace_id: string | null;
  span_id: string | null;
  service: string;
  level: string;
  message: string;
  attributes: Record<string, unknown> | null;
}

interface Props {
  span: Span;
  logs: TraceLog[];
}

type Tab = "attrs" | "events" | "exception" | "logs";

export function SpanDetail({ span, logs }: Props) {
  const [tab, setTab] = useState<Tab>("attrs");

  const spanLogs = logs.filter((l) => l.span_id === span.span_id);
  const tabs: { id: Tab; label: string; badge?: number | null }[] = [
    { id: "attrs", label: "Attributes" },
    { id: "events", label: "Events", badge: Array.isArray(span.events) ? span.events.length : 0 },
    { id: "exception", label: "Exception", badge: span.exception ? 1 : 0 },
    { id: "logs", label: "Logs", badge: spanLogs.length },
  ];

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{span.service}</p>
        <h3 className="mt-1 break-all font-mono text-sm font-semibold text-foreground">{span.name}</h3>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>span_id: <code className="text-foreground">{span.span_id.slice(0, 16)}</code></span>
          <span>kind: <code className="text-foreground">{span.kind ?? "—"}</code></span>
          <span>
            status:{" "}
            <code className={span.status_code === "ERROR" ? "text-red-400" : "text-foreground"}>
              {span.status_code}
            </code>
          </span>
          <span>duration: <code className="text-foreground">{span.duration_ms ?? "?"}ms</code></span>
        </div>
        {span.status_message && (
          <p className="mt-2 text-xs text-red-400">{span.status_message}</p>
        )}
      </div>

      <div className="flex gap-1 border-b border-border p-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === t.id
                ? "bg-secondary text-secondary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1 rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {tab === "attrs" && <JsonBlock value={span.attributes} empty="No attributes" />}
        {tab === "events" && <JsonBlock value={span.events} empty="No events" />}
        {tab === "exception" && <JsonBlock value={span.exception} empty="No exception" />}
        {tab === "logs" && (
          spanLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No logs for this span</p>
          ) : (
            <ul className="space-y-2">
              {spanLogs.map((l) => (
                <li key={l.id} className="rounded border border-border bg-muted/30 p-2">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide">
                    <span className={levelColor(l.level)}>{l.level}</span>
                    <span className="text-muted-foreground">{l.service}</span>
                    <span className="text-muted-foreground">{new Date(l.ts).toISOString()}</span>
                  </div>
                  <p className="mt-1 break-words font-mono text-xs text-foreground">{l.message}</p>
                  {l.attributes && Object.keys(l.attributes).length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                        attributes
                      </summary>
                      <JsonBlock value={l.attributes} empty="" />
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}

function JsonBlock({ value, empty }: { value: unknown; empty: string }) {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    return empty ? <p className="text-xs text-muted-foreground">{empty}</p> : null;
  }
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
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
