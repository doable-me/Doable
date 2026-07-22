/**
 * Schedule store: `.doable/backend/schedules/*.json` + platform DB.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { sql } from "../../db/index.js";
import { BACKEND_DIR } from "../config.js";
import { getProjectPath } from "../../projects/file-manager.js";
import { nextCronOccurrence } from "./cron.js";

const scheduleSchema = z.object({
  id: z.string().min(1).max(80),
  cron: z.string().min(1),
  timezone: z.string().default("UTC"),
  workflow: z.string().min(1),
  enabled: z.boolean().default(true),
});

export type ScheduleSpec = z.infer<typeof scheduleSchema>;

function schedulesDir(projectId: string): string {
  return path.join(getProjectPath(projectId), BACKEND_DIR, "schedules");
}

export async function upsertSchedule(
  projectId: string,
  spec: ScheduleSpec,
): Promise<void> {
  const parsed = scheduleSchema.parse(spec);
  const dir = schedulesDir(projectId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${parsed.id}.json`),
    JSON.stringify(parsed, null, 2),
    "utf-8",
  );
  const next = nextCronOccurrence(parsed.cron, parsed.timezone);
  await sql`
    INSERT INTO app_runtime_schedules
      (id, project_id, workflow_id, cron, timezone, enabled, next_run_at, updated_at)
    VALUES (
      ${parsed.id}, ${projectId}, ${parsed.workflow}, ${parsed.cron},
      ${parsed.timezone}, ${parsed.enabled}, ${next}, now()
    )
    ON CONFLICT (project_id, id) DO UPDATE SET
      workflow_id = EXCLUDED.workflow_id,
      cron = EXCLUDED.cron,
      timezone = EXCLUDED.timezone,
      enabled = EXCLUDED.enabled,
      next_run_at = EXCLUDED.next_run_at,
      updated_at = now()
  `;
}

export async function updateSchedule(
  projectId: string,
  id: string,
  patch: Partial<{ cron: string; timezone: string; workflow: string; enabled: boolean }>,
): Promise<void> {
  const existing = await listSchedules(projectId);
  const cur = existing.find((s) => s.id === id);
  if (!cur) throw new Error(`Schedule not found: ${id}`);
  await upsertSchedule(projectId, {
    id,
    cron: patch.cron ?? String(cur.cron),
    timezone: patch.timezone ?? String(cur.timezone ?? "UTC"),
    workflow: patch.workflow ?? String(cur.workflow_id ?? cur.workflow),
    enabled: patch.enabled ?? Boolean(cur.enabled),
  });
}

export async function deleteSchedule(projectId: string, id: string): Promise<void> {
  const file = path.join(schedulesDir(projectId), `${id}.json`);
  if (existsSync(file)) await unlink(file);
  await sql`
    DELETE FROM app_runtime_schedules
    WHERE project_id = ${projectId} AND id = ${id}
  `;
}

export async function listSchedules(
  projectId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT id, workflow_id, cron, timezone, enabled, next_run_at
    FROM app_runtime_schedules
    WHERE project_id = ${projectId}
    ORDER BY id
  `;
  if (rows.length > 0) return rows;

  // Fall back to files if DB empty
  const dir = schedulesDir(projectId);
  if (!existsSync(dir)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const e of await readdir(dir)) {
    if (!e.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await readFile(path.join(dir, e), "utf-8"));
      const parsed = scheduleSchema.parse(raw);
      out.push({
        id: parsed.id,
        workflow_id: parsed.workflow,
        workflow: parsed.workflow,
        cron: parsed.cron,
        timezone: parsed.timezone,
        enabled: parsed.enabled,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Sync all schedule JSON files for a project into the DB. */
export async function syncSchedulesFromDisk(projectId: string): Promise<void> {
  const dir = schedulesDir(projectId);
  if (!existsSync(dir)) return;
  for (const e of await readdir(dir)) {
    if (!e.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(await readFile(path.join(dir, e), "utf-8"));
      await upsertSchedule(projectId, scheduleSchema.parse(raw));
    } catch (err) {
      console.warn(
        `[app-runtime] bad schedule file ${e}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
