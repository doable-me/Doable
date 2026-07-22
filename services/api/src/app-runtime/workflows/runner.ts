/**
 * Workflow runner — loads `.doable/backend/workflows/<id>.workflow.js`,
 * injects WorkflowContext, persists runs/logs.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sql } from "../../db/index.js";
import { BACKEND_DIR, DOABLE_APP_WF_TIMEOUT_MS, DOABLE_APP_WF_MAX_CONCURRENCY } from "../config.js";
import { getProjectPath } from "../../projects/file-manager.js";
import { pinProject, unpinProject } from "../pin.js";
import { buildWorkflowContext } from "./context.js";
import type { TriggerType } from "../types.js";

let inFlight = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < DOABLE_APP_WF_MAX_CONCURRENCY) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = queue.shift();
  if (next) next();
}

export interface EnqueueOpts {
  projectId: string;
  workspaceId: string;
  userId: string;
  workflowId: string;
  triggerType: TriggerType;
  payload?: Record<string, unknown>;
  callDepth?: number;
  parentRunId?: string;
  dryRun?: boolean;
}

export async function enqueueWorkflowRun(
  opts: EnqueueOpts,
): Promise<{ runId: string }> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO app_runtime_runs (
      project_id, workflow_id, trigger_type, trigger_payload,
      status, attempt, call_depth, parent_run_id
    ) VALUES (
      ${opts.projectId},
      ${opts.workflowId},
      ${opts.triggerType},
      ${sql.json((opts.payload ?? {}) as never)},
      'queued',
      1,
      ${opts.callDepth ?? 0},
      ${opts.parentRunId ?? null}
    )
    RETURNING id
  `;
  const runId = row!.id;
  pinProject(opts.projectId, `run:${runId}`);

  // Fire-and-forget execution (awaited in dryRun for tests)
  const p = executeRun({ ...opts, runId });
  if (opts.dryRun) await p;
  else void p.catch((err) => console.error("[app-runtime] run failed:", err));

  return { runId };
}

async function appendLog(
  runId: string,
  level: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<void> {
  // Redact obvious secrets in logs
  const safeMsg = message.replace(
    /(sk[-_live]*[-_]|Bearer\s+)\S+/gi,
    "$1[REDACTED]",
  );
  await sql`
    INSERT INTO app_runtime_run_logs (run_id, level, message, data)
    VALUES (
      ${runId},
      ${level},
      ${safeMsg},
      ${data ? sql.json(data as never) : null}
    )
  `;
}

async function executeRun(opts: EnqueueOpts & { runId: string }): Promise<void> {
  await acquireSlot();
  try {
    await sql`
      UPDATE app_runtime_runs
      SET status = 'running', started_at = now()
      WHERE id = ${opts.runId}
    `;

    const wfPath = path.join(
      getProjectPath(opts.projectId),
      BACKEND_DIR,
      "workflows",
      `${opts.workflowId}.workflow.js`,
    );
    if (!existsSync(wfPath)) {
      throw new Error(`Workflow not found: ${opts.workflowId}`);
    }

    const ctx = await buildWorkflowContext({
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      runId: opts.runId,
      callDepth: opts.callDepth ?? 0,
      trigger: {
        type: opts.triggerType,
        payload: opts.payload ?? {},
        meta: { dryRun: opts.dryRun === true },
      },
      appendLog: (level, message, data) =>
        appendLog(opts.runId, level, message, data),
      enqueueChild: async (workflowId, payload, depth) =>
        enqueueWorkflowRun({
          projectId: opts.projectId,
          workspaceId: opts.workspaceId,
          userId: opts.userId,
          workflowId,
          triggerType: "call",
          payload,
          callDepth: depth,
          parentRunId: opts.runId,
        }),
    });

    // Load workflow as ESM from a temp file URL (project path).
    // Support both `export async function run` and `export default { run }`.
    const mod = await import(`${pathToFileURL(wfPath).href}?t=${Date.now()}`);
    const runFn =
      typeof mod.run === "function"
        ? mod.run
        : typeof mod.default?.run === "function"
          ? mod.default.run
          : typeof mod.default === "function"
            ? mod.default
            : null;
    if (!runFn) {
      throw new Error("Workflow must export async function run(ctx)");
    }

    const result = await Promise.race([
      Promise.resolve(runFn(ctx)),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Workflow timeout after ${DOABLE_APP_WF_TIMEOUT_MS}ms`)),
          DOABLE_APP_WF_TIMEOUT_MS,
        ),
      ),
    ]);

    await appendLog(opts.runId, "info", "workflow succeeded", {
      result: result ?? null,
    });
    await sql`
      UPDATE app_runtime_runs
      SET status = 'succeeded', finished_at = now()
      WHERE id = ${opts.runId}
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await appendLog(opts.runId, "error", message).catch(() => {});
    await sql`
      UPDATE app_runtime_runs
      SET status = 'failed', error = ${message}, finished_at = now()
      WHERE id = ${opts.runId}
    `.catch(() => {});
  } finally {
    unpinProject(opts.projectId, `run:${opts.runId}`);
    releaseSlot();
  }
}

export async function getRun(
  projectId: string,
  runId: string,
): Promise<Record<string, unknown> | null> {
  const [row] = await sql<Array<Record<string, unknown>>>`
    SELECT id, project_id, workflow_id, trigger_type, trigger_payload,
           status, error, started_at, finished_at, attempt, call_depth, created_at
    FROM app_runtime_runs
    WHERE id = ${runId} AND project_id = ${projectId}
    LIMIT 1
  `;
  if (!row) return null;
  const logs = await sql<Array<Record<string, unknown>>>`
    SELECT ts, level, message, data FROM app_runtime_run_logs
    WHERE run_id = ${runId}
    ORDER BY id ASC
    LIMIT 500
  `;
  return { ...row, logs };
}

export async function writeWorkflowFile(
  projectId: string,
  workflowId: string,
  source: string,
): Promise<void> {
  const dir = path.join(getProjectPath(projectId), BACKEND_DIR, "workflows");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${workflowId}.workflow.js`), source, "utf-8");
}

export async function readWorkflowSource(
  projectId: string,
  workflowId: string,
): Promise<string | null> {
  const p = path.join(
    getProjectPath(projectId),
    BACKEND_DIR,
    "workflows",
    `${workflowId}.workflow.js`,
  );
  if (!existsSync(p)) return null;
  return readFile(p, "utf-8");
}

/** Resolve workspace + owner for a project (for webhook/schedule triggers). */
export async function resolveProjectOwner(
  projectId: string,
): Promise<{ workspaceId: string; userId: string } | null> {
  const [row] = await sql<Array<{ workspace_id: string }>>`
    SELECT workspace_id FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  if (!row) return null;
  const [m] = await sql<Array<{ user_id: string }>>`
    SELECT user_id FROM workspace_members
    WHERE workspace_id = ${row.workspace_id}
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    LIMIT 1
  `;
  return { workspaceId: row.workspace_id, userId: m?.user_id ?? "" };
}
