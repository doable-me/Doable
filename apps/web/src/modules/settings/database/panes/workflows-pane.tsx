"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, RefreshCw, Bug } from "lucide-react";
import { SectionCard } from "@/modules/settings/components/project-settings-shared";
import {
  fetchWorkflows,
  testWorkflow,
  fetchRun,
  type WorkflowSummary,
  type RunRecord,
} from "../backend-api";
import { cn } from "@/lib/utils";

interface Props {
  projectId: string;
}

export function WorkflowsPane({ projectId }: Props) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [payloadText, setPayloadText] = useState("{\n  \n}");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunRecord | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWorkflows(projectId);
      setWorkflows(res.data);
      if (!selected && res.data[0]) setSelected(res.data[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflows");
    } finally {
      setLoading(false);
    }
  }, [projectId, selected]);

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!run?.id) return;
    if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
      return;
    }
    const t = setInterval(() => {
      void (async () => {
        try {
          const res = await fetchRun(projectId, run.id);
          setRun(res.data);
        } catch {
          /* ignore poll errors */
        }
      })();
    }, 1200);
    return () => clearInterval(t);
  }, [projectId, run?.id, run?.status]);

  async function runTest(dryRun: boolean) {
    if (!selected) return;
    setRunning(true);
    setError(null);
    setRun(null);
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(payloadText || "{}") as Record<string, unknown>;
    } catch {
      setError("Payload must be valid JSON");
      setRunning(false);
      return;
    }
    try {
      const res = await testWorkflow(projectId, selected, { payload, dryRun });
      if (!res.data.ok || !res.data.runId) {
        setError(res.data.message ?? "Workflow test failed");
        return;
      }
      const runRes = await fetchRun(projectId, res.data.runId);
      setRun(runRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow test failed");
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

  return (
    <SectionCard
      title="Workflow Debugger"
      description="Dry-run or execute workflows from .doable/backend/workflows and inspect run logs."
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          >
            {workflows.length === 0 && <option value="">No workflows</option>}
            {workflows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id}
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

        <label className="block space-y-1 text-xs">
          <span className="font-medium text-foreground">Payload (JSON)</span>
          <textarea
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
            rows={6}
            spellCheck={false}
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runTest(true)}
            disabled={running || !selected}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bug className="h-3.5 w-3.5" />}
            Dry run
          </button>
          <button
            type="button"
            onClick={() => void runTest(false)}
            disabled={running || !selected}
            className="inline-flex items-center gap-1.5 rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </button>
        </div>

        {error && <p className="text-sm text-destructive whitespace-pre-wrap">{error}</p>}

        {run && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-muted-foreground">{run.id}</span>
              <StatusPill status={String(run.status)} />
              {run.error && <span className="text-destructive">{String(run.error)}</span>}
            </div>
            <div className="max-h-64 overflow-auto rounded-md bg-muted/30 p-2 font-mono text-[11px] space-y-1">
              {(run.logs ?? []).length === 0 && (
                <p className="text-muted-foreground">No log lines yet…</p>
              )}
              {(run.logs ?? []).map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 uppercase",
                      log.level === "error" ? "text-destructive" : "text-brand-500",
                    )}
                  >
                    {log.level}
                  </span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "succeeded"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "failed"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-medium capitalize", color)}>
      {status}
    </span>
  );
}
