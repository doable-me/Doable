"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import type { DataTokenState } from "../hooks/use-data-token";
import type { SchemaResult, QueryResult } from "../api";

const PAGE_SIZE = 50;

interface RowsPaneProps {
  tokenState: DataTokenState;
}

export function RowsPane({ tokenState }: RowsPaneProps) {
  const { client, loading: tokenLoading, error: tokenError } = tokenState;
  const [schema, setSchema] = useState<SchemaResult | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [rows, setRows] = useState<QueryResult | null>(null);
  const [page, setPage] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load schema on mount to populate table picker
  useEffect(() => {
    if (!client) return;
    client
      .schema()
      .then((s) => {
        setSchema(s);
        const first = s.tables[0];
        if (first) setSelectedTable(first.name);
      })
      .catch(() => {});
  }, [client]);

  const fetchRows = useCallback(
    async (table: string, pageNum: number) => {
      if (!client || !table) return;
      setLoadingRows(true);
      setError(null);
      try {
        const offset = pageNum * PAGE_SIZE;
        const result = await client.query(
          `SELECT * FROM "${table}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        );
        setRows(result);
        setPage(pageNum);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Query failed");
      } finally {
        setLoadingRows(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (selectedTable) void fetchRows(selectedTable, 0);
  }, [selectedTable, fetchRows]);

  if (tokenLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <SectionCard title="Rows">
        <p className="text-sm text-destructive">{tokenError}</p>
      </SectionCard>
    );
  }

  const tables = schema?.tables ?? [];
  const columns = rows?.columns ?? [];
  const rowData = rows?.rows ?? [];
  const currentTable = tables.find((t) => t.name === selectedTable);
  const totalRows = currentTable?.rowCount ?? 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  return (
    <SectionCard title="Rows" description="Browse and inspect table data.">
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} ({t.rowCount} rows)
              </option>
            ))}
          </select>
          <button
            onClick={() => void fetchRows(selectedTable, page)}
            disabled={loadingRows}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRows ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {totalRows > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              Page {page + 1} of {Math.max(totalPages, 1)} &middot; {totalRows.toLocaleString()} rows total
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Table */}
        {loadingRows ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : columns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No data.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="border-b px-3 py-2 text-left font-medium text-muted-foreground"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowData.map((row, i) => (
                  <tr key={i} className="border-b border-muted/40 hover:bg-muted/20">
                    {columns.map((col) => (
                      <td key={col} className="px-3 py-1.5 font-mono max-w-xs truncate">
                        {row[col] === null
                          ? <span className="text-muted-foreground italic">null</span>
                          : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchRows(selectedTable, page - 1)}
              disabled={page === 0 || loadingRows}
              className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              Prev
            </button>
            <button
              onClick={() => void fetchRows(selectedTable, page + 1)}
              disabled={page >= totalPages - 1 || loadingRows}
              className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
