"use client";

import { useState, useEffect } from "react";
import { Loader2, Table2, Rows3, FileStack, ShieldCheck } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import type { DataTokenState } from "../hooks/use-data-token";
import type { SchemaResult } from "../api";

interface OverviewPaneProps {
  projectId: string;
  tokenState: DataTokenState;
  onNavigate: (pane: string) => void;
}

export function OverviewPane({ tokenState, onNavigate }: OverviewPaneProps) {
  const { client, loading: tokenLoading, error: tokenError } = tokenState;
  const [schema, setSchema] = useState<SchemaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client) return;
    setLoading(true);
    client
      .schema()
      .then((s) => { setSchema(s); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load schema"))
      .finally(() => setLoading(false));
  }, [client]);

  if (tokenLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <SectionCard title="Database Overview">
        <p className="text-sm text-destructive">{tokenError}</p>
      </SectionCard>
    );
  }

  const tables = schema?.tables ?? [];
  const totalRows = tables.reduce((s, t) => s + (t.rowCount ?? 0), 0);
  const totalIndexes = tables.reduce((s, t) => s + (t.indexes?.length ?? 0), 0);
  const totalPolicies = tables.reduce((s, t) => s + (t.policies?.length ?? 0), 0);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Database Overview"
        description="A snapshot of your project database."
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !schema || tables.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-8 text-center">
            <Table2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No tables yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ask the AI to add some — it will create your schema automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={Table2} label="Tables" value={tables.length} />
            <StatCard icon={Rows3} label="Total rows" value={totalRows.toLocaleString()} />
            <StatCard icon={FileStack} label="Indexes" value={totalIndexes} />
            <StatCard icon={ShieldCheck} label="Policies" value={totalPolicies} />
          </div>
        )}
      </SectionCard>

      {tables.length > 0 && (
        <SectionCard title="Quick actions">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => onNavigate("schema")}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Open Schema
            </button>
            <button
              onClick={() => onNavigate("rows")}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Browse Rows
            </button>
            <button
              onClick={() => onNavigate("queries")}
              className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Run Query
            </button>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 p-4">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
