/**
 * Real implementations for builtin:runtime MCP tools.
 */

import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { BACKEND_DIR } from "./config.js";
import { getProjectPath } from "../projects/file-manager.js";
import { validateMustacheSyntax, compileMustacheSql } from "./queries/compile.js";
import { loadQuery, listQueries, QUERY_NAME_RE } from "./queries/loader.js";
import { runNamedQuery } from "./queries/engine.js";
import { loadTablesAcl } from "./api/crud.js";
import { upsertSchedule } from "./schedules/store.js";
import { isValidCron } from "./schedules/cron.js";
import { upsertWebhook } from "./http/hooks-routes.js";
import { upsertCdcBinding } from "./cdc/bindings.js";
import { enqueueWorkflowRun, resolveProjectOwner, writeWorkflowFile, readWorkflowSource } from "./workflows/runner.js";
import { applyDataTemplate, listDataTemplates } from "./templates/apply.js";

export type RuntimeHandlerArgs = Record<string, unknown>;

export interface RuntimeHandlerResult {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
}

function backendRoot(projectId: string): string {
  return path.join(getProjectPath(projectId), BACKEND_DIR);
}

export async function runtimeValidate(
  projectId: string,
  _args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  const errors: string[] = [];
  const root = backendRoot(projectId);

  // Queries
  const qDir = path.join(root, "queries");
  if (existsSync(qDir)) {
    for (const e of await readdir(qDir)) {
      if (!e.endsWith(".sql")) continue;
      const src = await readFile(path.join(qDir, e), "utf-8");
      const v = validateMustacheSyntax(src);
      if (!v.ok) errors.push(`query ${e}: ${v.error}`);
      try {
        compileMustacheSql(src, {});
      } catch (err) {
        errors.push(`query ${e} compile: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Workflows must export run
  const wDir = path.join(root, "workflows");
  if (existsSync(wDir)) {
    for (const e of await readdir(wDir)) {
      if (!e.endsWith(".workflow.js")) continue;
      const src = await readFile(path.join(wDir, e), "utf-8");
      if (!/export\s+(async\s+)?function\s+run\b/.test(src) && !/export\s+\{\s*run\s*\}/.test(src)) {
        if (!/export\s+default/.test(src)) {
          errors.push(`workflow ${e}: must export async function run(ctx)`);
        }
      }
    }
  }

  // Schedules
  const sDir = path.join(root, "schedules");
  if (existsSync(sDir)) {
    for (const e of await readdir(sDir)) {
      if (!e.endsWith(".json")) continue;
      try {
        const raw = JSON.parse(await readFile(path.join(sDir, e), "utf-8")) as {
          cron?: string;
        };
        if (!raw.cron || !isValidCron(raw.cron)) {
          errors.push(`schedule ${e}: invalid cron`);
        }
      } catch (err) {
        errors.push(`schedule ${e}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // Secrets refs — names only
  const refsPath = path.join(root, "secrets.refs.json");
  if (existsSync(refsPath)) {
    try {
      const refs = JSON.parse(await readFile(refsPath, "utf-8"));
      if (!Array.isArray(refs) || refs.some((r) => typeof r !== "string")) {
        errors.push("secrets.refs.json must be a string array of names");
      }
    } catch (err) {
      errors.push(`secrets.refs.json: ${err instanceof Error ? err.message : err}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    message: errors.length === 0 ? "valid" : `${errors.length} issue(s)`,
  };
}

export async function runtimeUpsertQuery(
  projectId: string,
  args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  const name = String(args.name ?? "");
  const sqlText = String(args.sql ?? "");
  if (!QUERY_NAME_RE.test(name)) {
    return { ok: false, message: "Invalid query name" };
  }
  const v = validateMustacheSyntax(sqlText);
  if (!v.ok) return { ok: false, message: v.error };
  try {
    compileMustacheSql(sqlText, (args.params as Record<string, unknown>) ?? {});
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  const dir = path.join(backendRoot(projectId), "queries");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${name}.sql`), sqlText, "utf-8");
  if (args.meta && typeof args.meta === "object") {
    await writeFile(
      path.join(dir, `${name}.meta.json`),
      JSON.stringify(args.meta, null, 2),
      "utf-8",
    );
  }
  return { ok: true, name };
}

export async function runtimeTestQuery(
  projectId: string,
  args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  const name = String(args.name ?? "");
  const params = (args.params as Record<string, unknown>) ?? {};
  const appUserId = typeof args.app_user_id === "string" ? args.app_user_id : "";
  const resp = await runNamedQuery({
    projectId,
    queryName: name,
    params,
    appUserId,
    caller: "workflow",
  });
  return {
    ok: resp.ok,
    rows: resp.ok ? resp.rows : [],
    rowCount: resp.ok ? resp.rowCount : 0,
    error: resp.ok ? undefined : resp.error,
  };
}

export async function runtimeApplyDataTemplate(
  projectId: string,
  args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  const slug = String(args.slug ?? args.template ?? "");
  if (!slug) return { ok: false, message: "slug required" };
  try {
    const result = await applyDataTemplate(projectId, slug);
    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runtimeUpsertSchedule(
  projectId: string,
  args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  try {
    await upsertSchedule(projectId, {
      id: String(args.id),
      cron: String(args.cron),
      timezone: String(args.timezone ?? "UTC"),
      workflow: String(args.workflow),
      enabled: args.enabled !== false,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runtimeUpsertWebhook(
  projectId: string,
  args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  try {
    await upsertWebhook(projectId, {
      id: args.id ? String(args.id) : undefined,
      name: String(args.name),
      workflow: String(args.workflow),
      secret_ref: args.secret_ref ? String(args.secret_ref) : undefined,
      enabled: args.enabled !== false,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runtimeUpsertCdcBinding(
  projectId: string,
  args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  try {
    await upsertCdcBinding(projectId, {
      id: String(args.id),
      table: String(args.table),
      ops: (args.ops as Array<"insert" | "update" | "delete">) ?? ["insert", "update"],
      topic: args.topic != null ? String(args.topic) : null,
      workflow: args.workflow != null ? String(args.workflow) : null,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function runtimeTestWorkflow(
  projectId: string,
  args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  const workflowId = String(args.workflow ?? args.id ?? "");
  if (!workflowId) return { ok: false, message: "workflow id required" };
  const source = await readWorkflowSource(projectId, workflowId);
  if (!source && args.source) {
    await writeWorkflowFile(projectId, workflowId, String(args.source));
  }
  const owner = await resolveProjectOwner(projectId);
  if (!owner) return { ok: false, message: "project not found" };
  const { runId } = await enqueueWorkflowRun({
    projectId,
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    workflowId,
    triggerType: "manual",
    payload: (args.payload as Record<string, unknown>) ?? {},
    dryRun: true,
  });
  return { ok: true, runId };
}

export async function runtimeOpenapi(
  projectId: string,
  _args: RuntimeHandlerArgs,
): Promise<RuntimeHandlerResult> {
  const queries = await listQueries(projectId);
  const acl = await loadTablesAcl(projectId);
  const tables = acl.allow ?? Object.keys(acl.tables ?? {});
  return {
    ok: true,
    openapi: "3.0.0",
    info: { title: `Doable App Runtime (${projectId})`, version: "1.0.0" },
    paths: {
      ...Object.fromEntries(
        queries.map((q) => [
          `/__doable/queries/${q.name}`,
          {
            post: {
              summary: q.description ?? q.name,
              requestBody: {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { params: { type: "object" } } },
                  },
                },
              },
            },
          },
        ]),
      ),
      ...Object.fromEntries(
        tables.map((t) => [
          `/__doable/api/v1/${t}`,
          {
            get: { summary: `List ${t}` },
            post: { summary: `Create ${t}` },
          },
        ]),
      ),
    },
    queries,
    tables,
    templates: listDataTemplates(),
  };
}
