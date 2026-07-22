/**
 * Named query + auto CRUD HTTP routes under /__doable/*
 */

import { Hono } from "hono";
import { runNamedQuery } from "../queries/engine.js";
import { listQueries } from "../queries/loader.js";
import {
  crudList,
  crudGet,
  crudCreate,
  crudUpdate,
  crudDelete,
  loadTablesAcl,
  isTableAllowed,
} from "../api/crud.js";
import {
  jsonError,
  requireRuntimeAuth,
  resolveAppUserId,
  resolveCaller,
} from "./auth.js";

export const queriesRoutes = new Hono({ strict: false });
export const crudRoutes = new Hono({ strict: false });

queriesRoutes.options("/__doable/queries/*", (c) => {
  c.header("Access-Control-Allow-Origin", c.req.header("Origin") ?? "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, x-doable-data-api, x-doable-app-session, x-doable-admin",
  );
  return c.body(null, 204);
});

queriesRoutes.get("/__doable/queries", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const queries = await listQueries(auth.projectId);
  return c.json({ ok: true, queries });
});

queriesRoutes.post("/__doable/queries/:queryName", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const queryName = c.req.param("queryName");
  let body: Record<string, unknown> = {};
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const params =
    body.params && typeof body.params === "object" && !Array.isArray(body.params)
      ? (body.params as Record<string, unknown>)
      : {};
  const appUserId = await resolveAppUserId(c, auth);
  const resp = await runNamedQuery({
    projectId: auth.projectId,
    queryName,
    params,
    appUserId,
    caller: resolveCaller(auth),
  });
  if (!resp.ok) {
    const status = resp.error.message.startsWith("Unknown query") ? 404 : 400;
    return c.json(
      {
        ok: false,
        rows: [],
        rowCount: 0,
        error: resp.error,
      },
      status as 400,
    );
  }
  return c.json({
    ok: true,
    rows: resp.rows ?? [],
    rowCount: resp.rowCount ?? 0,
    fields: (resp.fields ?? []).map((f) => ({
      name: f.name,
      type: String(f.dataTypeID ?? ""),
    })),
    truncated: resp.truncated ?? false,
  });
});

crudRoutes.options("/__doable/api/*", (c) => {
  c.header("Access-Control-Allow-Origin", c.req.header("Origin") ?? "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, x-doable-data-api, x-doable-app-session",
  );
  return c.body(null, 204);
});

crudRoutes.get("/__doable/api/v1/:table", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const table = c.req.param("table");
  const acl = await loadTablesAcl(auth.projectId);
  if (!isTableAllowed(table, "GET", acl)) {
    return jsonError(c, 403, "TABLE_FORBIDDEN");
  }
  const limit = Number(c.req.query("limit") ?? 50);
  const offset = Number(c.req.query("offset") ?? 0);
  let where: Record<string, unknown> | undefined;
  const whereRaw = c.req.query("where");
  if (whereRaw) {
    try {
      where = JSON.parse(whereRaw) as Record<string, unknown>;
    } catch {
      return jsonError(c, 400, "PARAMS_INVALID", "where must be JSON");
    }
  }
  const appUserId = await resolveAppUserId(c, auth);
  const resp = await crudList({
    projectId: auth.projectId,
    table,
    limit,
    offset,
    where,
    appUserId,
  });
  return workerToJson(c, resp);
});

crudRoutes.get("/__doable/api/v1/:table/:id", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const table = c.req.param("table");
  const acl = await loadTablesAcl(auth.projectId);
  if (!isTableAllowed(table, "GET", acl)) {
    return jsonError(c, 403, "TABLE_FORBIDDEN");
  }
  const appUserId = await resolveAppUserId(c, auth);
  const resp = await crudGet({
    projectId: auth.projectId,
    table,
    id: c.req.param("id"),
    appUserId,
  });
  return workerToJson(c, resp);
});

crudRoutes.post("/__doable/api/v1/:table", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const table = c.req.param("table");
  const acl = await loadTablesAcl(auth.projectId);
  if (!isTableAllowed(table, "POST", acl)) {
    return jsonError(c, 403, "TABLE_FORBIDDEN");
  }
  const data = (await c.req.json()) as Record<string, unknown>;
  const appUserId = await resolveAppUserId(c, auth);
  const resp = await crudCreate({
    projectId: auth.projectId,
    table,
    data,
    appUserId,
  });
  return workerToJson(c, resp, 201);
});

crudRoutes.patch("/__doable/api/v1/:table/:id", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const table = c.req.param("table");
  const acl = await loadTablesAcl(auth.projectId);
  if (!isTableAllowed(table, "PATCH", acl)) {
    return jsonError(c, 403, "TABLE_FORBIDDEN");
  }
  const data = (await c.req.json()) as Record<string, unknown>;
  const appUserId = await resolveAppUserId(c, auth);
  const resp = await crudUpdate({
    projectId: auth.projectId,
    table,
    id: c.req.param("id"),
    data,
    appUserId,
  });
  return workerToJson(c, resp);
});

crudRoutes.delete("/__doable/api/v1/:table/:id", async (c) => {
  const auth = await requireRuntimeAuth(c);
  if (auth instanceof Response) return auth;
  const table = c.req.param("table");
  const acl = await loadTablesAcl(auth.projectId);
  if (!isTableAllowed(table, "DELETE", acl)) {
    return jsonError(c, 403, "TABLE_FORBIDDEN");
  }
  const appUserId = await resolveAppUserId(c, auth);
  const resp = await crudDelete({
    projectId: auth.projectId,
    table,
    id: c.req.param("id"),
    appUserId,
  });
  return workerToJson(c, resp);
});

function workerToJson(
  c: Parameters<typeof jsonError>[0],
  resp: Awaited<ReturnType<typeof crudList>>,
  okStatus: 200 | 201 = 200,
) {
  if (!resp.ok) {
    return c.json(
      { ok: false, rows: [], rowCount: 0, error: resp.error },
      400,
    );
  }
  return c.json(
    {
      ok: true,
      rows: resp.rows ?? [],
      rowCount: resp.rowCount ?? 0,
      fields: (resp.fields ?? []).map((f) => ({
        name: f.name,
        type: String(f.dataTypeID ?? ""),
      })),
      truncated: resp.truncated ?? false,
    },
    okStatus,
  );
}
