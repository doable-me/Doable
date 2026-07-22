/**
 * Scheduler ticker — lease due schedules and enqueue workflows.
 */

import { randomUUID } from "node:crypto";
import { sql } from "../../db/index.js";
import { DOABLE_APP_SCHEDULER_TICK_MS, DOABLE_APP_RUNTIME_ENABLED } from "../config.js";
import { nextCronOccurrence } from "./cron.js";
import { enqueueWorkflowRun, resolveProjectOwner } from "../workflows/runner.js";

let timer: NodeJS.Timeout | null = null;
const ownerId = `sched-${randomUUID().slice(0, 8)}`;

export async function tickSchedules(now: Date = new Date()): Promise<number> {
  if (!DOABLE_APP_RUNTIME_ENABLED) return 0;
  const leaseUntil = new Date(now.getTime() + DOABLE_APP_SCHEDULER_TICK_MS * 2);

  const due = await sql<
    Array<{
      id: string;
      project_id: string;
      workflow_id: string;
      cron: string;
      timezone: string;
    }>
  >`
    UPDATE app_runtime_schedules
    SET lease_owner = ${ownerId}, lease_until = ${leaseUntil}
    WHERE enabled = true
      AND next_run_at IS NOT NULL
      AND next_run_at <= ${now}
      AND (lease_until IS NULL OR lease_until < ${now})
    RETURNING id, project_id, workflow_id, cron, timezone
  `;

  let fired = 0;
  for (const row of due) {
    try {
      const owner = await resolveProjectOwner(row.project_id);
      if (owner) {
        await enqueueWorkflowRun({
          projectId: row.project_id,
          workspaceId: owner.workspaceId,
          userId: owner.userId,
          workflowId: row.workflow_id,
          triggerType: "cron",
          payload: { scheduleId: row.id },
        });
        fired++;
      }
      const next = nextCronOccurrence(row.cron, row.timezone, now);
      await sql`
        UPDATE app_runtime_schedules
        SET next_run_at = ${next}, lease_owner = NULL, lease_until = NULL, updated_at = now()
        WHERE project_id = ${row.project_id} AND id = ${row.id}
      `;
    } catch (err) {
      console.warn(
        `[app-runtime/scheduler] failed ${row.project_id}/${row.id}:`,
        err instanceof Error ? err.message : err,
      );
      await sql`
        UPDATE app_runtime_schedules
        SET lease_owner = NULL, lease_until = NULL
        WHERE project_id = ${row.project_id} AND id = ${row.id}
      `.catch(() => {});
    }
  }
  return fired;
}

export function startScheduler(): void {
  if (timer || !DOABLE_APP_RUNTIME_ENABLED) return;
  timer = setInterval(() => {
    void tickSchedules().catch((err) =>
      console.warn("[app-runtime/scheduler]", err instanceof Error ? err.message : err),
    );
  }, DOABLE_APP_SCHEDULER_TICK_MS);
  timer.unref();
  console.log(`[app-runtime] scheduler started (tick=${DOABLE_APP_SCHEDULER_TICK_MS}ms)`);
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
