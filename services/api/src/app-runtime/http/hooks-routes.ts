/**
 * Public inbound webhooks: POST /hooks/:projectId/:name
 */

import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { sql } from "../../db/index.js";
import { BACKEND_DIR, DOABLE_APP_HOOK_BODY_MAX_BYTES } from "../config.js";
import { getProjectPath } from "../../projects/file-manager.js";
import { resolveProjectEnvVars } from "../../env/resolve.js";
import { enqueueWorkflowRun, resolveProjectOwner } from "../workflows/runner.js";

export const hooksRoutes = new Hono({ strict: false });

const webhookFileSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  workflow: z.string(),
  secret_ref: z.string().optional(),
  enabled: z.boolean().optional(),
});

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateOk(projectId: string, maxPerMin = 60): boolean {
  const now = Date.now();
  const b = rateBuckets.get(projectId);
  if (!b || now > b.resetAt) {
    rateBuckets.set(projectId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (b.count >= maxPerMin) return false;
  b.count++;
  return true;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // still compare to avoid timing leak on length
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

async function loadWebhook(
  projectId: string,
  name: string,
): Promise<{ workflow: string; secretRef?: string; enabled: boolean } | null> {
  const [row] = await sql<
    Array<{ workflow_id: string; secret_ref: string | null; enabled: boolean }>
  >`
    SELECT workflow_id, secret_ref, enabled
    FROM app_runtime_webhooks
    WHERE project_id = ${projectId} AND name = ${name}
    LIMIT 1
  `;
  if (row) {
    return {
      workflow: row.workflow_id,
      secretRef: row.secret_ref ?? undefined,
      enabled: row.enabled,
    };
  }

  const filePath = path.join(
    getProjectPath(projectId),
    BACKEND_DIR,
    "webhooks",
    `${name}.json`,
  );
  if (!existsSync(filePath)) return null;
  try {
    const raw = webhookFileSchema.parse(JSON.parse(await readFile(filePath, "utf-8")));
    return {
      workflow: raw.workflow,
      secretRef: raw.secret_ref,
      enabled: raw.enabled !== false,
    };
  } catch {
    return null;
  }
}

hooksRoutes.post("/hooks/:projectId/:name", async (c) => {
  const projectId = c.req.param("projectId");
  const name = c.req.param("name");

  if (!rateOk(projectId)) {
    return c.json({ ok: false, error: { code: "RATE_LIMITED" } }, 429);
  }

  const contentLength = Number(c.req.header("content-length") ?? 0);
  if (contentLength > DOABLE_APP_HOOK_BODY_MAX_BYTES) {
    return c.json({ ok: false, error: { code: "BODY_TOO_LARGE" } }, 413);
  }

  const wh = await loadWebhook(projectId, name);
  if (!wh || !wh.enabled) {
    return c.json({ ok: false, error: { code: "WEBHOOK_NOT_FOUND" } }, 404);
  }

  let body: unknown = {};
  try {
    const text = await c.req.text();
    if (Buffer.byteLength(text, "utf8") > DOABLE_APP_HOOK_BODY_MAX_BYTES) {
      return c.json({ ok: false, error: { code: "BODY_TOO_LARGE" } }, 413);
    }
    body = text ? JSON.parse(text) : {};
  } catch {
    return c.json({ ok: false, error: { code: "INVALID_JSON" } }, 400);
  }

  if (wh.secretRef) {
    const provided =
      c.req.header("x-doable-webhook-secret") ??
      c.req.header("x-webhook-secret") ??
      "";
    const owner = await resolveProjectOwner(projectId);
    const env = await resolveProjectEnvVars(
      projectId,
      "production",
      owner?.workspaceId,
      owner?.userId,
    );
    const expected = env[wh.secretRef] ?? "";
    if (!expected || !provided || !safeEqual(provided, expected)) {
      return c.json({ ok: false, error: { code: "UNAUTHORIZED" } }, 401);
    }
  }

  const owner = await resolveProjectOwner(projectId);
  if (!owner) {
    return c.json({ ok: false, error: { code: "PROJECT_NOT_FOUND" } }, 404);
  }

  const { runId } = await enqueueWorkflowRun({
    projectId,
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    workflowId: wh.workflow,
    triggerType: "webhook",
    payload: {
      webhook: name,
      body,
      headers: {
        "content-type": c.req.header("content-type") ?? "",
        "user-agent": c.req.header("user-agent") ?? "",
      },
    },
  });

  return c.json({ ok: true, runId });
});

/** Upsert webhook file + DB row (MCP / SDK). */
export async function upsertWebhook(
  projectId: string,
  spec: {
    id?: string;
    name: string;
    workflow: string;
    secret_ref?: string;
    enabled?: boolean;
  },
): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const id = spec.id ?? spec.name;
  const dir = path.join(getProjectPath(projectId), BACKEND_DIR, "webhooks");
  await mkdir(dir, { recursive: true });
  const payload = {
    id,
    name: spec.name,
    workflow: spec.workflow,
    secret_ref: spec.secret_ref,
    enabled: spec.enabled !== false,
  };
  await writeFile(
    path.join(dir, `${spec.name}.json`),
    JSON.stringify(payload, null, 2),
    "utf-8",
  );
  await sql`
    INSERT INTO app_runtime_webhooks
      (id, project_id, name, workflow_id, secret_ref, enabled, updated_at)
    VALUES (
      ${id}, ${projectId}, ${spec.name}, ${spec.workflow},
      ${spec.secret_ref ?? null}, ${spec.enabled !== false}, now()
    )
    ON CONFLICT (project_id, id) DO UPDATE SET
      name = EXCLUDED.name,
      workflow_id = EXCLUDED.workflow_id,
      secret_ref = EXCLUDED.secret_ref,
      enabled = EXCLUDED.enabled,
      updated_at = now()
  `;
}
