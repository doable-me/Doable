"use client";
import { useUiText } from "@/i18n/use-ui-text";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";

export interface TraceRow {
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

export function ResultsTable({
  traces,
  loading,
}: {
  traces: TraceRow[];
  loading: boolean;
}) {
  const ui = useUiText();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (traces.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        {" "}
        {ui("No traces match these filters.")}{" "}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <Th>{ui("Started")}</Th>
            <Th>{ui("Status")}</Th>
            <Th>{ui("Root span")}</Th>
            <Th>{ui("Duration")}</Th>
            <Th>{ui("Spans")}</Th>
            <Th>{ui("Services")}</Th>
            <Th>{ui("Trace ID")}</Th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t) => (
            <tr
              key={t.trace_id}
              className="border-b border-border/40 hover:bg-muted/30"
            >
              <Td>
                <Link
                  href={`/admin/trace/${t.trace_id}`}
                  className="text-brand-300 hover:text-brand-200"
                >
                  {new Date(t.started_at).toLocaleString(ui.locale)}
                </Link>
              </Td>
              <Td>
                <StatusBadge status={t.status} errorCount={t.error_count} />
              </Td>
              <Td className="font-mono text-xs">{t.root_span_name ?? "—"}</Td>
              <Td>
                {t.duration_ms != null
                  ? ui("{v0}ms", { v0: t.duration_ms })
                  : "—"}
              </Td>
              <Td>{t.span_count}</Td>
              <Td className="text-xs">{(t.services ?? []).join(", ")}</Td>
              <Td className="font-mono text-[10px] text-muted-foreground">
                {t.trace_id.slice(0, 12)}…
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

function StatusBadge({
  status,
  errorCount,
}: {
  status: string;
  errorCount: number;
}) {
  const ui = useUiText();

  if (status === "error" || errorCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">
        <AlertCircle className="h-3 w-3" /> {ui("error")}
        {errorCount > 1 ? `s (${errorCount})` : ""}
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
        <Loader2 className="h-3 w-3 animate-spin" /> {ui("running")}{" "}
      </span>
    );
  }
  if (status === "timeout") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
        <Clock className="h-3 w-3" /> {ui("timeout")}{" "}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
      <CheckCircle2 className="h-3 w-3" /> {ui("ok")}{" "}
    </span>
  );
}
