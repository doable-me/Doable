/**
 * Workflow invoke + run status routes.
 */

import { Hono } from "hono";
import { jsonError, requireRuntimeAuth } from "./auth.js";
import { enqueueWorkflowRun, getRun } from "../workflows/runner.js";
import { sql } from "../../db/index.js";

export const workflowRoutes = new Hono({ strict: false });

workflowRoutes.options("/__doable/runtime/*", (c) => {
  c.header("Access-Control-Allow-Origin", c.req.header("Origin") ?? "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, x-doable-data-api, x-doable-app-session",
  );
  return c.body(null, 204);
});

workflowRoutes.post("/__doable/runtime/workflows/:id/run", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const workflowId = c.req.param("id");
  let body: { payload?: Record<string, unknown>; dryRun?: boolean } = {};
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    body = {};
  }

  const [proj] = await sql<Array<{ workspace_id: string }>>`
    SELECT workspace_id FROM projects WHERE id = ${auth.projectId} LIMIT 1
  `;
  if (!proj) return jsonError(c, 404, "PROJECT_NOT_FOUND");

  const { runId } = await enqueueWorkflowRun({
    projectId: auth.projectId,
    workspaceId: proj.workspace_id,
    userId: auth.userId ?? "",
    workflowId,
    triggerType: "manual",
    payload: body.payload ?? {},
    dryRun: body.dryRun === true,
  });

  return c.json({ ok: true, runId });
});

workflowRoutes.get("/__doable/runtime/runs/:runId", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const run = await getRun(auth.projectId, c.req.param("runId"));
  if (!run) return jsonError(c, 404, "RUN_NOT_FOUND");
  return c.json({ ok: true, run });
});
