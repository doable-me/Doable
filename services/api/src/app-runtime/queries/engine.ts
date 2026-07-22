/**
 * Execute a named Mustache query against the project PGlite worker.
 */

import { compileMustacheSql } from "./compile.js";
import {
  applyParamDefaults,
  callerAllowed,
  loadQuery,
} from "./loader.js";
import { runOnProject } from "../../data-worker/pool.js";
import { emitCdcIfMutation } from "../cdc/emit.js";
import { writeOutboxRow } from "../cdc/outbox.js";
import type { WorkerResponse } from "../../data-worker/types.js";

export interface RunNamedQueryOpts {
  projectId: string;
  queryName: string;
  params?: Record<string, unknown>;
  appUserId?: string;
  caller: "end_user" | "workflow" | "api_key";
  elevated?: boolean;
}

export async function runNamedQuery(opts: RunNamedQueryOpts): Promise<WorkerResponse> {
  const def = await loadQuery(opts.projectId, opts.queryName);
  if (!def) {
    return {
      id: "",
      ok: false,
      error: { code: "INTERNAL", message: `Unknown query: ${opts.queryName}` },
    };
  }
  if (!callerAllowed(def, opts.caller)) {
    return {
      id: "",
      ok: false,
      error: {
        code: "INTERNAL",
        message: `Caller ${opts.caller} not allowed for ${opts.queryName}`,
      },
    };
  }

  let params: Record<string, unknown>;
  try {
    params = applyParamDefaults(def, opts.params ?? {});
  } catch (err) {
    return {
      id: "",
      ok: false,
      error: {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  let compiled;
  try {
    compiled = compileMustacheSql(def.sqlSource, params);
  } catch (err) {
    return {
      id: "",
      ok: false,
      error: {
        code: "INTERNAL",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const resp = await runOnProject(opts.projectId, {
    op: "query",
    sql: compiled.sqlText,
    params: compiled.values,
    app_user_id: opts.appUserId ?? "",
    elevated: opts.elevated === true,
  });

  if (resp.ok) {
    const event = await emitCdcIfMutation({
      projectId: opts.projectId,
      sql: compiled.sqlText,
      payload: { query: opts.queryName, rowCount: resp.rowCount },
    });
    if (event) {
      try {
        await writeOutboxRow(opts.projectId, {
          table: event.table,
          op: event.op,
          rowPk: event.rowPk,
          payload: event.payload,
        });
      } catch {
        /* outbox best-effort */
      }
    }
  }

  return resp;
}
