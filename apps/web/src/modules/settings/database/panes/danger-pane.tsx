"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import type { DataTokenState } from "../hooks/use-data-token";
import { dropTable, resetDatabase, type TableSchema } from "../api";

interface DangerPaneProps {
  projectId: string;
  tokenState: DataTokenState;
}

export function DangerPane({ projectId, tokenState }: DangerPaneProps) {
  const { client, loading: tokenLoading, error: tokenError } = tokenState;
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Typed-confirmation: the exact string the user must type to arm an action.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const refresh = useCallback(() => {
    if (!client) return;
    setLoading(true);
    client
      .schema()
      .then((s) => { setTables(s.tables); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load schema"))
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => { refresh(); }, [refresh]);

  function arm(key: string) {
    setConfirmFor(key);
    setConfirmText("");
    setError(null);
  }

  async function doDrop(table: string) {
    setBusy(table);
    setError(null);
    try {
      await dropTable(projectId, table);
      setConfirmFor(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to drop table");
    } finally {
      setBusy(null);
    }
  }

  async function doReset() {
    setBusy("__reset__");
    setError(null);
    try {
      await resetDatabase(projectId);
      setConfirmFor(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset database");
    } finally {
      setBusy(null);
    }
  }

  if (tokenLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (tokenError) {
    return (
      <SectionCard title="Danger Zone">
        <p className="text-sm text-destructive">{tokenError}</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Drop tables" description="Permanently delete a table and all its data. This cannot be undone.">
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {tables.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tables to drop.</p>
        ) : (
          <ul className="space-y-2">
            {tables.map((t) => {
              const key = `drop:${t.name}`;
              const arming = confirmFor === key;
              return (
                <li key={t.name} className="rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.rowCount} rows</span>
                    {!arming && (
                      <button
                        onClick={() => arm(key)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Drop
                      </button>
                    )}
                  </div>
                  {arming && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Type <span className="font-mono font-semibold text-foreground">{t.name}</span> to confirm:
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          className="rounded-md border bg-background px-2 py-1 font-mono text-xs"
                        />
                        <button
                          onClick={() => void doDrop(t.name)}
                          disabled={confirmText !== t.name || busy === t.name}
                          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
                        >
                          {busy === t.name && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Drop table
                        </button>
                        <button onClick={() => setConfirmFor(null)} className="rounded-md border px-3 py-1 text-xs hover:bg-muted">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Reset database" description="Drop ALL tables and start from an empty database. This cannot be undone.">
        {confirmFor === "reset" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Type <span className="font-mono font-semibold text-foreground">reset</span> to drop every table:
            </p>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 font-mono text-xs"
              />
              <button
                onClick={() => void doReset()}
                disabled={confirmText !== "reset" || busy === "__reset__"}
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {busy === "__reset__" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Reset database
              </button>
              <button onClick={() => setConfirmFor(null)} className="rounded-md border px-3 py-1 text-xs hover:bg-muted">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => arm("reset")}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <AlertTriangle className="h-4 w-4" /> Reset database
          </button>
        )}
      </SectionCard>
    </div>
  );
}
