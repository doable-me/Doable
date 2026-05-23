"use client";

import { useState, useEffect } from "react";
import { Loader2, FileStack } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import { fetchMigrations, type MigrationRow } from "../api";

interface MigrationsPaneProps {
  projectId: string;
}

export function MigrationsPane({ projectId }: MigrationsPaneProps) {
  const [migrations, setMigrations] = useState<MigrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMigrations(projectId)
      .then((m) => { if (alive) { setMigrations(m); setError(null); } })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : "Failed to load migrations"); });
    return () => { alive = false; };
  }, [projectId]);

  if (!migrations && !error) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <SectionCard title="Migrations">
        <p className="text-sm text-destructive">{error}</p>
      </SectionCard>
    );
  }

  const rows = migrations ?? [];

  return (
    <SectionCard title="Migrations" description="Applied migration history for your database.">
      {rows.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-8 text-center">
          <FileStack className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No migrations yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Migrations appear here once the AI applies schema changes via the built-in database.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-muted-foreground">
                <th className="border-b px-3 py-2 text-left font-medium">Migration</th>
                <th className="border-b px-3 py-2 text-left font-medium">Applied</th>
                <th className="border-b px-3 py-2 text-left font-medium">Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.migration_id} className="border-b border-muted/40 hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-mono">{m.migration_id}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {new Date(m.applied_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{m.sql_hash.slice(0, 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
