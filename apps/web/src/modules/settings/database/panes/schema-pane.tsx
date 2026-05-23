"use client";

import { useState, useEffect } from "react";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import type { DataTokenState } from "../hooks/use-data-token";
import type { SchemaResult, TableSchema } from "../api";

interface SchemaPaneProps {
  tokenState: DataTokenState;
}

export function SchemaPane({ tokenState }: SchemaPaneProps) {
  const { client, loading: tokenLoading, error: tokenError } = tokenState;
  const [schema, setSchema] = useState<SchemaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TableSchema | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!client) return;
    setLoading(true);
    client
      .schema()
      .then((s) => {
        setSchema(s);
        setError(null);
        if (s.tables.length > 0) setSelected(s.tables[0] ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load schema"))
      .finally(() => setLoading(false));
  }, [client]);

  if (tokenLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tokenError ?? error) {
    return (
      <SectionCard title="Schema">
        <p className="text-sm text-destructive">{tokenError ?? error}</p>
      </SectionCard>
    );
  }

  const tables = schema?.tables ?? [];

  if (tables.length === 0) {
    return (
      <SectionCard title="Schema" description="Tables, columns, indexes, and policies.">
        <p className="text-sm text-muted-foreground">No tables found. Ask the AI to create your schema.</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Schema" description="Tables, columns, indexes, and policies.">
      <div className="flex gap-4">
        {/* Table list */}
        <div className="w-48 shrink-0 space-y-1 border-r pr-4">
          {tables.map((t) => {
            const open = expandedTables.has(t.name);
            return (
              <button
                key={t.name}
                onClick={() => {
                  setSelected(t);
                  setExpandedTables((prev) => {
                    const next = new Set(prev);
                    if (open) next.delete(t.name); else next.add(t.name);
                    return next;
                  });
                }}
                className={`flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                  selected?.name === t.name ? "bg-muted font-medium" : "hover:bg-muted/50"
                }`}
              >
                {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                <span className="truncate">{t.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{t.rowCount}</span>
              </button>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="flex-1 min-w-0 space-y-4">
            <h3 className="text-sm font-semibold">{selected.name}</h3>

            {/* Columns */}
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Columns</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-1 text-left font-medium">Name</th>
                    <th className="pb-1 text-left font-medium">Type</th>
                    <th className="pb-1 text-left font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.columns.map((col) => (
                    <tr key={col.name} className="border-b border-muted/40">
                      <td className="py-1 font-mono">{col.name}</td>
                      <td className="py-1 text-muted-foreground">{col.type}</td>
                      <td className="py-1 space-x-1">
                        {!col.nullable && <span className="rounded bg-muted px-1">NOT NULL</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Indexes */}
            {selected.indexes.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Indexes ({selected.indexes.length})
                </p>
                <ul className="space-y-0.5">
                  {selected.indexes.map((indexdef) => {
                    // indexes are raw CREATE INDEX statements (pg_indexes.indexdef)
                    const name = indexdef.match(/INDEX (\w+)/i)?.[1] ?? indexdef;
                    const unique = /UNIQUE INDEX/i.test(indexdef);
                    return (
                      <li key={indexdef} className="flex items-center gap-2 text-xs">
                        <span className="font-mono">{name}</span>
                        {unique && <span className="rounded bg-muted px-1 text-muted-foreground">UNIQUE</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Policies */}
            {selected.policies.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Policies ({selected.policies.length})
                </p>
                <ul className="space-y-0.5">
                  {selected.policies.map((pol) => (
                    <li key={pol.name} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                      <span className="font-mono">{pol.name}</span>
                      <span className="text-muted-foreground">{pol.command}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
