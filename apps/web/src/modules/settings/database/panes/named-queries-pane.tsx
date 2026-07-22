"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import {
  fetchNamedQueries,
  fetchNamedQuery,
  testNamedQuery,
  type NamedQueryDetail,
  type NamedQuerySummary,
} from "../backend-api";

interface Props {
  projectId: string;
}

export function NamedQueriesPane({ projectId }: Props) {
  const [queries, setQueries] = useState<NamedQuerySummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<NamedQueryDetail | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [appUserId, setAppUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    rows: unknown[];
    rowCount: number;
  } | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchNamedQueries(projectId);
      setQueries(res.data);
      if (!selected && res.data[0]) setSelected(res.data[0].name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queries");
    } finally {
      setLoading(false);
    }
  }, [projectId, selected]);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [projectId]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchNamedQuery(projectId, selected);
        if (cancelled) return;
        setDetail(res.data);
        const next: Record<string, string> = {};
        for (const [key, meta] of Object.entries(res.data.params ?? {})) {
          next[key] =
            meta.default !== undefined && meta.default !== null
              ? String(meta.default)
              : "";
        }
        setParams(next);
        setResult(null);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load query");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, selected]);

  async function run() {
    if (!selected) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const parsed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(params)) {
        if (v === "") continue;
        const meta = detail?.params?.[k];
        if (meta?.type === "number") parsed[k] = Number(v);
        else if (meta?.type === "boolean") parsed[k] = v === "true" || v === "1";
        else if (meta?.type === "object" || meta?.type === "array") {
          try {
            parsed[k] = JSON.parse(v);
          } catch {
            parsed[k] = v;
          }
        } else parsed[k] = v;
      }
      const res = await testNamedQuery(projectId, selected, {
        params: parsed,
        app_user_id: appUserId || undefined,
      });
      if (!res.data.ok) {
        setError(
          typeof res.data.error === "object" && res.data.error && "message" in (res.data.error as object)
            ? String((res.data.error as { message: string }).message)
            : res.data.message ?? "Query failed",
        );
        return;
      }
      setResult({
        rows: (res.data.rows as unknown[]) ?? [],
        rowCount: res.data.rowCount ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const columns =
    result && result.rows[0] && typeof result.rows[0] === "object" && result.rows[0] !== null
      ? Object.keys(result.rows[0] as object)
      : [];

  return (
    <SectionCard
      title="Named Queries"
      description="Test Mustache SQL queries from .doable/backend/queries with fixture params."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          >
            {queries.length === 0 && <option value="">No named queries</option>}
            {queries.map((q) => (
              <option key={q.name} value={q.name}>
                {q.name}
                {q.description ? ` — ${q.description}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadList()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border hover:bg-muted"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {detail && (
          <>
            {detail.sqlPreview && (
              <pre className="max-h-32 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-[11px] text-muted-foreground">
                {detail.sqlPreview}
              </pre>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.keys(detail.params ?? {}).map((key) => (
                <label key={key} className="space-y-1 text-xs">
                  <span className="font-medium text-foreground">
                    {key}
                    {detail.params[key]?.required ? " *" : ""}
                  </span>
                  <input
                    value={params[key] ?? ""}
                    onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
                    placeholder={detail.params[key]?.type ?? "string"}
                  />
                </label>
              ))}
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="font-medium text-foreground">app_user_id (optional RLS)</span>
                <input
                  value={appUserId}
                  onChange={(e) => setAppUserId(e.target.value)}
                  className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
                  placeholder="UUID of end-user to simulate"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void run()}
              disabled={running || !selected}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run test
            </button>
          </>
        )}

        {error && <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>}

        {result && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {result.rowCount} {result.rowCount === 1 ? "row" : "rows"}
            </p>
            {columns.length === 0 ? (
              <p className="text-sm text-muted-foreground">OK — no rows.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {columns.map((col) => (
                        <th key={col} className="border-b px-3 py-2 text-left font-medium text-muted-foreground">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(result.rows as Array<Record<string, unknown>>).slice(0, 100).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {columns.map((col) => (
                          <td key={col} className="px-3 py-1.5 font-mono whitespace-nowrap">
                            {formatCell(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
