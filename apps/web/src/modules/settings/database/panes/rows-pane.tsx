"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, Pencil, Trash2, Check, X, Download } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import type { DataTokenState } from "../hooks/use-data-token";
import type { SchemaResult, QueryResult, TableSchema } from "../api";

const PAGE_SIZE = 50;
const EXPORT_CAP = 10000;

interface RowsPaneProps {
  tokenState: DataTokenState;
}

/** Detect a single-column primary key: parse the UNIQUE pkey index, else a column named "id". */
function detectPrimaryKey(table: TableSchema | undefined): string | null {
  if (!table) return null;
  for (const indexdef of table.indexes) {
    if (!/UNIQUE INDEX/i.test(indexdef)) continue;
    const cols = indexdef.match(/\(([^)]+)\)/)?.[1];
    if (!cols) continue;
    const parts = cols.split(",").map((s) => s.trim().replace(/"/g, ""));
    if (parts.length === 1 && table.columns.some((c) => c.name === parts[0])) return parts[0]!;
  }
  return table.columns.some((c) => c.name === "id") ? "id" : null;
}

function downloadBlob(filename: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(esc).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function RowsPane({ tokenState }: RowsPaneProps) {
  const { client, loading: tokenLoading, error: tokenError } = tokenState;
  const [schema, setSchema] = useState<SchemaResult | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [rows, setRows] = useState<QueryResult | null>(null);
  const [page, setPage] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Edit state: the pk value of the row being edited + its draft cell values.
  const [editingPk, setEditingPk] = useState<unknown>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  // Delete confirmation: the pk value of the row pending delete.
  const [confirmDeletePk, setConfirmDeletePk] = useState<unknown>(null);

  const loadSchema = useCallback(() => {
    if (!client) return;
    client
      .schema()
      .then((s) => {
        setSchema(s);
        setSelectedTable((cur) => cur || s.tables[0]?.name || "");
      })
      .catch(() => {});
  }, [client]);

  useEffect(() => { loadSchema(); }, [loadSchema]);

  const fetchRows = useCallback(
    async (table: string, pageNum: number) => {
      if (!client || !table) return;
      setLoadingRows(true);
      setError(null);
      setEditingPk(null);
      setConfirmDeletePk(null);
      try {
        const offset = pageNum * PAGE_SIZE;
        const result = await client.query(`SELECT * FROM "${table}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`);
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

  const tables = schema?.tables ?? [];
  const columns = rows?.columns ?? [];
  const rowData = rows?.rows ?? [];
  const currentTable = tables.find((t) => t.name === selectedTable);
  const totalRows = currentTable?.rowCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const pk = detectPrimaryKey(currentTable);
  const canMutate = pk !== null && columns.includes(pk);

  function startEdit(row: Record<string, unknown>): void {
    setConfirmDeletePk(null);
    setEditingPk(row[pk!]);
    const draft: Record<string, string> = {};
    for (const c of columns) draft[c] = row[c] === null || row[c] === undefined ? "" : String(row[c]);
    setEditDraft(draft);
  }

  async function saveEdit(): Promise<void> {
    if (!client || !canMutate) return;
    const editable = columns.filter((c) => c !== pk);
    if (editable.length === 0) { setEditingPk(null); return; }
    setBusy(true);
    setError(null);
    try {
      const setClause = editable.map((c, i) => `"${c}"=$${i + 1}`).join(", ");
      // Cast the pk to text so the string-bound param matches uuid/int/text pks alike.
      const params = [...editable.map((c) => editDraft[c] ?? ""), String(editingPk)];
      await client.query(`UPDATE "${selectedTable}" SET ${setClause} WHERE "${pk}"::text=$${editable.length + 1}`, params);
      setEditingPk(null);
      await fetchRows(selectedTable, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRow(pkValue: unknown): Promise<void> {
    if (!client || !canMutate) return;
    setBusy(true);
    setError(null);
    try {
      await client.query(`DELETE FROM "${selectedTable}" WHERE "${pk}"::text=$1`, [String(pkValue)]);
      setConfirmDeletePk(null);
      await fetchRows(selectedTable, page);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function exportData(format: "csv" | "json"): Promise<void> {
    if (!client || !selectedTable) return;
    setBusy(true);
    setError(null);
    try {
      const all = await client.query(`SELECT * FROM "${selectedTable}" LIMIT ${EXPORT_CAP}`);
      if (format === "json") {
        downloadBlob(`${selectedTable}.json`, "application/json", JSON.stringify(all.rows, null, 2));
      } else {
        downloadBlob(`${selectedTable}.csv`, "text/csv", toCsv(all.columns, all.rows));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
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
      <SectionCard title="Rows">
        <p className="text-sm text-destructive">{tokenError}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Rows" description="Browse, edit, delete, and export table data.">
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            {tables.map((t) => (
              <option key={t.name} value={t.name}>{t.name} ({t.rowCount} rows)</option>
            ))}
          </select>
          <button
            onClick={() => void fetchRows(selectedTable, page)}
            disabled={loadingRows}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRows ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => void exportData("csv")}
            disabled={busy || !selectedTable}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
          <button
            onClick={() => void exportData("json")}
            disabled={busy || !selectedTable}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
          {totalRows > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              Page {page + 1} of {totalPages} &middot; {totalRows.toLocaleString()} rows total
            </span>
          )}
        </div>

        {!canMutate && columns.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Editing and deleting are disabled — this table has no single-column primary key to target rows by.
          </p>
        )}
        {error && <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>}

        {/* Table */}
        {loadingRows ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : columns.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No data.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="border-b px-3 py-2 text-left font-medium text-muted-foreground">{col}</th>
                  ))}
                  {canMutate && <th className="border-b px-3 py-2 text-right font-medium text-muted-foreground">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rowData.map((row, i) => {
                  const rowPk = canMutate ? row[pk!] : i;
                  const isEditing = canMutate && editingPk === row[pk!];
                  const isConfirming = canMutate && confirmDeletePk === row[pk!];
                  return (
                    <tr key={String(rowPk) + i} className="border-b border-muted/40 hover:bg-muted/20">
                      {columns.map((col) => (
                        <td key={col} className="max-w-xs truncate px-3 py-1.5 font-mono">
                          {isEditing && col !== pk ? (
                            <input
                              value={editDraft[col] ?? ""}
                              onChange={(e) => setEditDraft((d) => ({ ...d, [col]: e.target.value }))}
                              className="w-full rounded border bg-background px-1 py-0.5 font-mono text-xs"
                            />
                          ) : row[col] === null ? (
                            <span className="italic text-muted-foreground">null</span>
                          ) : (
                            String(row[col])
                          )}
                        </td>
                      ))}
                      {canMutate && (
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">
                          {isEditing ? (
                            <span className="inline-flex gap-1">
                              <button onClick={() => void saveEdit()} disabled={busy} title="Save"
                                className="rounded p-1 text-green-600 hover:bg-muted disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingPk(null)} title="Cancel"
                                className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                            </span>
                          ) : isConfirming ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-[11px] text-muted-foreground">Delete?</span>
                              <button onClick={() => void deleteRow(row[pk!])} disabled={busy} title="Confirm delete"
                                className="rounded p-1 text-destructive hover:bg-destructive/10 disabled:opacity-50"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setConfirmDeletePk(null)} title="Cancel"
                                className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              <button onClick={() => startEdit(row)} title="Edit"
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setConfirmDeletePk(row[pk!])} title="Delete"
                                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => void fetchRows(selectedTable, page - 1)} disabled={page === 0 || loadingRows}
              className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50">Prev</button>
            <button onClick={() => void fetchRows(selectedTable, page + 1)} disabled={page >= totalPages - 1 || loadingRows}
              className="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-50">Next</button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
