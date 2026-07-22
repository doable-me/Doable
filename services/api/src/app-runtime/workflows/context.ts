/**
 * Build the frozen WorkflowContext injected into workflow `run(ctx)`.
 */

import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { WorkflowContext } from "@doable/runtime";

import { runNamedQuery } from "../queries/engine.js";
import {
  crudList,
  crudGet,
  crudCreate,
  crudUpdate,
  crudDelete,
} from "../api/crud.js";
import { runOnProject } from "../../data-worker/pool.js";
import { appBus } from "../bus.js";
import { DOABLE_APP_WF_MAX_CALL_DEPTH, BACKEND_DIR } from "../config.js";
import { getProjectPath } from "../../projects/file-manager.js";
import { ensureRuntimeAppTables } from "../cdc/outbox.js";
import { sql } from "../../db/index.js";
import { resolveProjectEnvVars } from "../../env/resolve.js";

export interface BuildCtxOpts {
  projectId: string;
  workspaceId: string;
  userId: string;
  runId: string;
  callDepth: number;
  trigger: WorkflowContext["trigger"];
  appendLog: (
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ) => Promise<void>;
  enqueueChild: (
    workflowId: string,
    payload: Record<string, unknown>,
    depth: number,
  ) => Promise<{ runId: string }>;
}

function filesRoot(projectId: string): string {
  return path.join(getProjectPath(projectId), BACKEND_DIR, "files");
}

function assertSafeRel(rel: string): string {
  const norm = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  if (norm.startsWith("..") || path.isAbsolute(norm)) {
    throw new Error("Invalid file path");
  }
  return norm;
}

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "metadata.google.internal") return true;
  if (h.endsWith(".local")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1)/.test(h)) return true;
  return false;
}

export async function buildWorkflowContext(opts: BuildCtxOpts): Promise<WorkflowContext> {
  await ensureRuntimeAppTables(opts.projectId);

  const toResult = <T = Record<string, unknown>>(resp: {
    ok: boolean;
    rows?: unknown[];
    rowCount?: number;
    error?: { code: string; message: string };
  }): import("@doable/runtime").RuntimeResult<T> =>
    ({
      ok: resp.ok,
      rows: (resp.rows ?? []) as T[],
      rowCount: resp.rowCount ?? 0,
      error: resp.error,
    }) as import("@doable/runtime").RuntimeResult<T>;

  const ctx: WorkflowContext = {
    projectId: opts.projectId,
    runId: opts.runId,
    trigger: opts.trigger,

    queries: {
      run: async (name, params = {}) => {
        const resp = await runNamedQuery({
          projectId: opts.projectId,
          queryName: name,
          params,
          caller: "workflow",
          appUserId: "",
        });
        return toResult(resp);
      },
    },

    db: {
      query: async (sqlText, params = []) => {
        const resp = await runOnProject(opts.projectId, {
          op: "query",
          sql: sqlText,
          params,
          app_user_id: "",
        });
        return toResult(resp);
      },
      exec: async (sqlText) => {
        const resp = await runOnProject(opts.projectId, {
          op: "exec",
          sql: sqlText,
        });
        return toResult(resp);
      },
    },

    api: {
      list: async (table, o = {}) =>
        toResult(
          await crudList({
            projectId: opts.projectId,
            table,
            limit: o.limit,
            offset: o.offset,
            where: o.where,
          }),
        ),
      get: async (table, id) =>
        toResult(await crudGet({ projectId: opts.projectId, table, id })),
      create: async (table, data) =>
        toResult(await crudCreate({ projectId: opts.projectId, table, data })),
      update: async (table, id, data) =>
        toResult(await crudUpdate({ projectId: opts.projectId, table, id, data })),
      delete: async (table, id) =>
        toResult(await crudDelete({ projectId: opts.projectId, table, id })),
    },

    http: {
      fetch: async (url, init) => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          throw new Error("Invalid URL");
        }
        if (parsed.protocol !== "https:") {
          throw new Error("Only https URLs are allowed in workflows");
        }
        if (isBlockedHost(parsed.hostname)) {
          throw new Error("Blocked host");
        }
        return fetch(url, init);
      },
    },

    files: {
      read: async (relPath) => {
        const safe = assertSafeRel(relPath);
        const full = path.join(filesRoot(opts.projectId), safe);
        return readFile(full, "utf-8");
      },
      write: async (relPath, content) => {
        const safe = assertSafeRel(relPath);
        const full = path.join(filesRoot(opts.projectId), safe);
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, content, "utf-8");
      },
      list: async (relPath = ".") => {
        const safe = assertSafeRel(relPath);
        const full = path.join(filesRoot(opts.projectId), safe);
        if (!existsSync(full)) return [];
        return readdir(full);
      },
      delete: async (relPath) => {
        const safe = assertSafeRel(relPath);
        const full = path.join(filesRoot(opts.projectId), safe);
        await unlink(full);
      },
    },

    log: {
      info: (message, data) => {
        void opts.appendLog("info", message, data);
      },
      warn: (message, data) => {
        void opts.appendLog("warn", message, data);
      },
      error: (message, data) => {
        void opts.appendLog("error", message, data);
      },
    },

    topics: {
      publish: async (name, payload) => {
        appBus.publishTopic(opts.projectId, name, payload);
      },
      subscribe: (name, handler) =>
        appBus.subscribe(appBus.topicChannel(opts.projectId, name), handler),
    },

    secrets: {
      get: async (name) => {
        const refsPath = path.join(
          getProjectPath(opts.projectId),
          BACKEND_DIR,
          "secrets.refs.json",
        );
        if (existsSync(refsPath)) {
          try {
            const refs = JSON.parse(await readFile(refsPath, "utf-8")) as string[];
            if (!refs.includes(name)) return null;
          } catch {
            return null;
          }
        }
        const env = await resolveProjectEnvVars(
          opts.projectId,
          "production",
          opts.workspaceId,
          opts.userId,
        );
        if (env[name] != null) return String(env[name]);
        const [row] = await sql<Array<{ env_var_id: string | null }>>`
          SELECT env_var_id FROM app_runtime_secrets_refs
          WHERE project_id = ${opts.projectId} AND name = ${name}
          LIMIT 1
        `;
        if (!row) return null;
        return env[name] ?? null;
      },
    },

    integrations: {
      invoke: async (integrationId, action, input = {}) => {
        const { runAction } = await import("../../integrations/runner-core.js");
        const result = await runAction({
          integrationId,
          actionName: action,
          props: input,
          userId: opts.userId,
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
        });
        return result;
      },
    },

    messages: {
      email: async (o) => {
        const provider = o.provider ?? "resend";
        const action =
          provider === "sendgrid"
            ? "send_email"
            : provider === "gmail"
              ? "send_email"
              : "send_email";
        const integrationId =
          provider === "sendgrid" ? "sendgrid" : provider === "gmail" ? "gmail" : "resend";
        return ctx.integrations.invoke(integrationId, action, {
          to: Array.isArray(o.to) ? o.to.join(",") : o.to,
          subject: o.subject,
          body: o.body ?? o.html ?? "",
          html: o.html,
          from: o.from,
        });
      },
      sms: async (o) =>
        ctx.integrations.invoke("twilio", "send_sms", { to: o.to, body: o.body }),
      whatsapp: async (o) => {
        if (o.mediaUrl) {
          return ctx.integrations.invoke("whatsapp", "send_media", {
            to: o.to,
            media: o.mediaUrl,
            body: o.body,
          });
        }
        if (o.template) {
          return ctx.integrations.invoke("whatsapp", "send_template_message", {
            to: o.to,
            template: o.template,
          });
        }
        return ctx.integrations.invoke("whatsapp", "send_message", {
          to: o.to,
          body: o.body ?? "",
        });
      },
      telegram: async (o) =>
        ctx.integrations.invoke("telegram_bot", "send_text_message", {
          chat_id: o.chatId,
          text: o.text,
        }),
    },

    schedules: {
      create: async (spec) => {
        const { upsertSchedule } = await import("../schedules/store.js");
        await upsertSchedule(opts.projectId, {
          id: spec.id,
          cron: spec.cron,
          timezone: spec.timezone ?? "UTC",
          workflow: spec.workflow,
          enabled: spec.enabled !== false,
        });
      },
      update: async (id, patch) => {
        const { updateSchedule } = await import("../schedules/store.js");
        await updateSchedule(opts.projectId, id, patch);
      },
      list: async () => {
        const { listSchedules } = await import("../schedules/store.js");
        return listSchedules(opts.projectId);
      },
      delete: async (id) => {
        const { deleteSchedule } = await import("../schedules/store.js");
        await deleteSchedule(opts.projectId, id);
      },
    },

    users: {
      list: async (o = {}) => {
        const { listAppUsers } = await import("../users/admin.js");
        return listAppUsers(opts.projectId, o);
      },
      get: async (id) => {
        const { getAppUser } = await import("../users/admin.js");
        return getAppUser(opts.projectId, id);
      },
      update: async (id, patch) => {
        const { updateAppUser } = await import("../users/admin.js");
        return updateAppUser(opts.projectId, id, patch);
      },
      setAdmin: async (id, isAdmin) => {
        const { setAppUserAdmin } = await import("../users/admin.js");
        await setAppUserAdmin(opts.projectId, id, isAdmin);
      },
      disable: async (id, disabled = true) => {
        const { setAppUserDisabled } = await import("../users/admin.js");
        await setAppUserDisabled(opts.projectId, id, disabled);
      },
    },

    rbac: {
      listRoles: async () => {
        const { listRoles } = await import("../users/rbac.js");
        return listRoles(opts.projectId);
      },
      createRole: async (name, permissions = []) => {
        const { createRole } = await import("../users/rbac.js");
        return createRole(opts.projectId, name, permissions);
      },
      assign: async (userId, roleName) => {
        const { assignRole } = await import("../users/rbac.js");
        await assignRole(opts.projectId, userId, roleName);
      },
      revoke: async (userId, roleName) => {
        const { revokeRole } = await import("../users/rbac.js");
        await revokeRole(opts.projectId, userId, roleName);
      },
      hasPermission: async (userId, permission) => {
        const { hasPermission } = await import("../users/rbac.js");
        return hasPermission(opts.projectId, userId, permission);
      },
    },

    callWorkflow: async (workflowId, payload = {}) => {
      if (opts.callDepth >= DOABLE_APP_WF_MAX_CALL_DEPTH) {
        throw new Error(`Max workflow call depth ${DOABLE_APP_WF_MAX_CALL_DEPTH} exceeded`);
      }
      return opts.enqueueChild(workflowId, payload, opts.callDepth + 1);
    },
  };

  return Object.freeze(ctx) as WorkflowContext;
}
