/**
 * CDC emission after successful DML against the per-app DB.
 */

import { appBus } from "../bus.js";
import type { ChangeEvent, ChangeOp } from "../types.js";
import { DOABLE_APP_RUNTIME_ENABLED } from "../config.js";

const DML_RE = /^\s*(INSERT|UPDATE|DELETE)\b/i;

export function classifyDmlOp(sql: string): ChangeOp | null {
  const m = DML_RE.exec(sql);
  if (!m) return null;
  const k = m[1]!.toUpperCase();
  if (k === "INSERT") return "insert";
  if (k === "UPDATE") return "update";
  if (k === "DELETE") return "delete";
  return null;
}

/** Best-effort table name from simple DML (first table token). */
export function extractTableName(sql: string): string | null {
  const insert = /^\s*INSERT\s+INTO\s+"?([a-zA-Z_][\w]*)"?/i.exec(sql);
  if (insert) return insert[1]!;
  const update = /^\s*UPDATE\s+"?([a-zA-Z_][\w]*)"?/i.exec(sql);
  if (update) return update[1]!;
  const del = /^\s*DELETE\s+FROM\s+"?([a-zA-Z_][\w]*)"?/i.exec(sql);
  if (del) return del[1]!;
  return null;
}

export interface EmitCdcOpts {
  projectId: string;
  sql: string;
  rowPk?: string | null;
  payload?: unknown;
}

/**
 * Publish a ChangeEvent when SQL looks like DML. No-op when runtime disabled.
 * Also notifies CDC binding dispatcher (lazy import to avoid cycles).
 */
export async function emitCdcIfMutation(opts: EmitCdcOpts): Promise<ChangeEvent | null> {
  if (!DOABLE_APP_RUNTIME_ENABLED) return null;
  const op = classifyDmlOp(opts.sql);
  if (!op) return null;
  const table = extractTableName(opts.sql);
  if (!table || table.startsWith("_doable")) return null;

  const event: ChangeEvent = {
    projectId: opts.projectId,
    table,
    op,
    rowPk: opts.rowPk ?? null,
    payload: opts.payload,
    ts: new Date().toISOString(),
  };
  appBus.publishCdc(event);

  try {
    const { handleCdcEvent } = await import("./bindings.js");
    await handleCdcEvent(event);
  } catch (err) {
    console.warn(
      "[app-runtime/cdc] binding dispatch failed:",
      err instanceof Error ? err.message : err,
    );
  }
  return event;
}
