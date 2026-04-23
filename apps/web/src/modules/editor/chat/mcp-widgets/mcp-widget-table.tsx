"use client";

import { useState } from "react";
import { Loader2, AlertCircle, ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { McpUiWidget } from "../../hooks/use-editor-store";
import { useMcpAction } from "./use-mcp-action";
import { useEditorStore } from "../../hooks/use-editor-store";

interface McpTableWidgetProps {
  widget: McpUiWidget;
  messageId: string;
}

export function McpTableWidget({ widget, messageId }: McpTableWidgetProps) {
  const projectId = useEditorStore((s) => s.projectId);
  const { submitAction, loading } = useMcpAction(projectId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = widget.schema.columns ?? [];
  const actions = widget.schema.actions ?? [];
  const rows = (widget.state.rows as Record<string, unknown>[] | undefined) ?? [];
  const widgetError = widget.state.__error as string | undefined;

  const sortedRows = sortKey
    ? [...rows].sort((a, b) => {
        const av = String(a[sortKey] ?? "");
        const bv = String(b[sortKey] ?? "");
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : rows;

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAction = async (actionId: string) => {
    setActionError(null);
    const result = await submitAction({
      toolCallId: widget.toolCallId,
      connectorId: widget.connectorId,
      action: actionId,
      payload: { selectedRowIds: Array.from(selectedIds) },
    });
    if (!result.success) setActionError(result.error ?? "Action failed");
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs font-semibold text-foreground">{widget.title}</span>
        <span className="text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""}</span>
      </div>

      {widgetError && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-b border-border">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {widgetError}
        </div>
      )}

      {actionError && (
        <div className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-b border-border">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {actionError}
        </div>
      )}

      {columns.length > 0 && rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {actions.length > 0 && (
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedIds.size === rows.length && rows.length > 0}
                      onChange={(e) =>
                        setSelectedIds(
                          e.target.checked
                            ? new Set(rows.map((r) => String(r.id ?? r._id ?? "")))
                            : new Set(),
                        )
                      }
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const rowId = String(row.id ?? row._id ?? idx);
                const isSelected = selectedIds.has(rowId);
                return (
                  <tr
                    key={rowId}
                    className={cn(
                      "border-b border-border/50 last:border-0 transition-colors",
                      isSelected ? "bg-brand-50 dark:bg-brand-950/20" : "hover:bg-muted/30",
                    )}
                  >
                    {actions.length > 0 && (
                      <td className="w-8 px-2 py-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={isSelected}
                          onChange={() => toggleRow(rowId)}
                        />
                      </td>
                    )}
                    {columns.map((col) => {
                      const val = row[col.key];
                      return (
                        <td key={col.key} className="px-3 py-2 text-foreground">
                          <CellValue value={val} type={col.type} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-3 py-4 text-xs text-muted-foreground text-center">No data</p>
      )}

      {actions.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20 flex-wrap">
          {actions.map((action) => {
            const disabled =
              loading ||
              (action.requiresSelection && selectedIds.size === 0);
            return (
              <button
                key={action.id}
                disabled={disabled}
                onClick={() => handleAction(action.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                  action.variant === "destructive"
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : action.variant === "outline"
                      ? "border border-border hover:bg-accent"
                      : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                {action.label}
                {action.requiresSelection && selectedIds.size > 0 && (
                  <span className="ml-0.5 opacity-70">({selectedIds.size})</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CellValue({
  value,
  type,
}: {
  value: unknown;
  type?: string;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  if (type === "boolean") {
    return (
      <span className={cn("font-medium", value ? "text-green-600" : "text-red-500")}>
        {value ? "Yes" : "No"}
      </span>
    );
  }
  if (type === "badge") {
    return (
      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium">
        {String(value)}
      </span>
    );
  }
  if (type === "date") {
    try {
      return <span>{new Date(String(value)).toLocaleDateString()}</span>;
    } catch {
      return <span>{String(value)}</span>;
    }
  }
  return <span>{String(value)}</span>;
}
