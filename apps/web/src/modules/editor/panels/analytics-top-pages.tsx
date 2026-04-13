"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import type { PageData, SortColumn, SortDirection } from "./analytics-types";
import { formatDuration } from "./analytics-types";

// ─── Top Pages Table ────────────────────────────────────────

export function TopPagesTable({ pages }: { pages: PageData[] }) {
  const [sortCol, setSortCol] = useState<SortColumn>("views");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir("desc");
      }
    },
    [sortCol]
  );

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortCol) {
        case "path":
          aVal = a.path;
          bVal = b.path;
          break;
        case "views":
          aVal = a.views;
          bVal = b.views;
          break;
        case "visitors":
          aVal = a.visitors;
          bVal = b.visitors;
          break;
        case "avgDuration":
          aVal = a.avgDuration;
          bVal = b.avgDuration;
          break;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [pages, sortCol, sortDir]);

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortCol !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  if (pages.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Top Pages</h3>
        </div>
        <p className="p-4 text-center text-xs text-muted-foreground">No page data available yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Top Pages</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              {[
                { key: "path" as SortColumn, label: "Page" },
                { key: "views" as SortColumn, label: "Views" },
                { key: "visitors" as SortColumn, label: "Unique Visitors" },
                { key: "avgDuration" as SortColumn, label: "Avg. Time" },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  className="cursor-pointer select-none px-4 py-2 font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => handleSort(key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <SortIcon col={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 10).map((page) => (
              <tr
                key={page.path}
                className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-foreground">{page.path}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{page.views.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{page.visitors.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{formatDuration(page.avgDuration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
