"use client";

import { useState } from "react";
import { Loader2, Play } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import type { DataTokenState } from "../hooks/use-data-token";
import type { QueryResult } from "../api";

interface QueriesPaneProps {
  tokenState: DataTokenState;
}

const SAMPLE = "SELECT * FROM information_schema.tables WHERE table_schema = 'public';";

export function QueriesPane({ tokenState }: QueriesPaneProps) {
  const { client, loading: tokenLoading, error: tokenError } = tokenState;
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!client || !sql.trim()) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await client.query(sql));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }

  if (tokenLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (tokenError) {
    return (
      <SectionCard title="Queries">
        <p className="text-sm text-destructive">{tokenError}</p>
      </SectionCard>
    );
  }

  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];

  return (
    <SectionCard
      title="Queries"
      description="Run SELECT / INSERT / UPDATE / DELETE against your database. Queries respect row-level security."
    >
      <div className="space-y-3">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void run();
          }}
          placeholder={SAMPLE}
          spellCheck={false}
          rows={5}
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => void run()}
            disabled={running || !sql.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run
          </button>
          <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter</span>
          {result && !error && (
            <span className="ml-auto text-xs text-muted-foreground">
              {result.rowCount} {result.rowCount === 1 ? "row" : "rows"}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>}

        {result && !error && (
          columns.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">Query OK — no rows returned.</p>
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
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-muted/40 hover:bg-muted/20">
                      {columns.map((col) => (
                        <td key={col} className="max-w-xs truncate px-3 py-1.5 font-mono">
                          {row[col] === null
                            ? <span className="italic text-muted-foreground">null</span>
                            : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </SectionCard>
  );
}
