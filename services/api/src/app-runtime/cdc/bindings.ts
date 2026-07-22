/**
 * CDC bindings from `.doable/backend/cdc/bindings.json` + DB rows.
 */

import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { sql } from "../../db/index.js";
import { BACKEND_DIR } from "../config.js";
import { getProjectPath } from "../../projects/file-manager.js";
import { appBus } from "../bus.js";
import type { ChangeEvent } from "../types.js";
import { enqueueWorkflowRun, resolveProjectOwner } from "../workflows/runner.js";

const bindingSchema = z.object({
  id: z.string(),
  table: z.string(),
  ops: z.array(z.enum(["insert", "update", "delete"])).default(["insert", "update", "delete"]),
  topic: z.string().nullable().optional(),
  workflow: z.string().nullable().optional(),
});

const fileSchema = z.object({
  bindings: z.array(bindingSchema).default([]),
});

export async function loadCdcBindings(projectId: string): Promise<
  Array<z.infer<typeof bindingSchema>>
> {
  const p = path.join(getProjectPath(projectId), BACKEND_DIR, "cdc", "bindings.json");
  if (existsSync(p)) {
    try {
      const raw = fileSchema.parse(JSON.parse(await readFile(p, "utf-8")));
      return raw.bindings;
    } catch {
      /* fall through to DB */
    }
  }
  const rows = await sql<
    Array<{
      id: string;
      table_name: string;
      ops: string[];
      topic: string | null;
      workflow_id: string | null;
    }>
  >`
    SELECT id, table_name, ops, topic, workflow_id
    FROM app_runtime_cdc_bindings
    WHERE project_id = ${projectId} AND enabled = true
  `;
  return rows.map((r) => ({
    id: r.id,
    table: r.table_name,
    ops: r.ops as Array<"insert" | "update" | "delete">,
    topic: r.topic,
    workflow: r.workflow_id,
  }));
}

export async function upsertCdcBinding(
  projectId: string,
  binding: z.infer<typeof bindingSchema>,
): Promise<void> {
  const parsed = bindingSchema.parse(binding);
  const dir = path.join(getProjectPath(projectId), BACKEND_DIR, "cdc");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, "bindings.json");
  let existing: z.infer<typeof bindingSchema>[] = [];
  if (existsSync(filePath)) {
    try {
      existing = fileSchema.parse(JSON.parse(await readFile(filePath, "utf-8"))).bindings;
    } catch {
      existing = [];
    }
  }
  const idx = existing.findIndex((b) => b.id === parsed.id);
  if (idx >= 0) existing[idx] = parsed;
  else existing.push(parsed);
  await writeFile(filePath, JSON.stringify({ bindings: existing }, null, 2), "utf-8");

  await sql`
    INSERT INTO app_runtime_cdc_bindings
      (id, project_id, table_name, ops, topic, workflow_id, enabled)
    VALUES (
      ${parsed.id}, ${projectId}, ${parsed.table},
      ${parsed.ops}, ${parsed.topic ?? null}, ${parsed.workflow ?? null}, true
    )
    ON CONFLICT (project_id, id) DO UPDATE SET
      table_name = EXCLUDED.table_name,
      ops = EXCLUDED.ops,
      topic = EXCLUDED.topic,
      workflow_id = EXCLUDED.workflow_id,
      enabled = true
  `;
}

export async function handleCdcEvent(event: ChangeEvent): Promise<void> {
  const bindings = await loadCdcBindings(event.projectId);
  for (const b of bindings) {
    if (b.table !== event.table) continue;
    if (!b.ops.includes(event.op)) continue;
    if (b.topic) {
      appBus.publishTopic(event.projectId, b.topic, event);
    }
    if (b.workflow) {
      const owner = await resolveProjectOwner(event.projectId);
      if (!owner) continue;
      await enqueueWorkflowRun({
        projectId: event.projectId,
        workspaceId: owner.workspaceId,
        userId: owner.userId,
        workflowId: b.workflow,
        triggerType: "cdc",
        payload: {
          table: event.table,
          op: event.op,
          rowPk: event.rowPk,
          payload: event.payload,
        },
      });
    }
  }
}
