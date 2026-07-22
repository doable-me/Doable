/**
 * Load named queries from `.doable/backend/queries/*.sql` (+ optional `.meta.json`).
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { BACKEND_DIR } from "../config.js";
import type { QueryDefinition } from "../types.js";
import { getProjectPath } from "../../projects/file-manager.js";

const metaSchema = z.object({
  description: z.string().optional(),
  params: z
    .record(
      z.object({
        type: z.enum(["string", "number", "boolean", "object", "array"]).optional(),
        required: z.boolean().optional(),
        default: z.unknown().optional(),
        max: z.number().optional(),
        min: z.number().optional(),
      }),
    )
    .optional(),
  allow: z.array(z.enum(["end_user", "workflow", "api_key"])).optional(),
});

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/;

export function queriesDir(projectId: string): string {
  return path.join(getProjectPath(projectId), BACKEND_DIR, "queries");
}

export async function loadQuery(
  projectId: string,
  queryName: string,
): Promise<QueryDefinition | null> {
  if (!NAME_RE.test(queryName)) return null;
  const dir = queriesDir(projectId);
  const sqlPath = path.join(dir, `${queryName}.sql`);
  if (!existsSync(sqlPath)) return null;
  const sqlSource = await readFile(sqlPath, "utf-8");
  let meta: QueryDefinition["meta"];
  const metaPath = path.join(dir, `${queryName}.meta.json`);
  if (existsSync(metaPath)) {
    const raw = JSON.parse(await readFile(metaPath, "utf-8"));
    meta = metaSchema.parse(raw);
  }
  return { name: queryName, sqlSource, meta };
}

export async function listQueries(
  projectId: string,
): Promise<Array<{ name: string; description?: string }>> {
  const dir = queriesDir(projectId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out: Array<{ name: string; description?: string }> = [];
  for (const e of entries) {
    if (!e.endsWith(".sql")) continue;
    const name = e.slice(0, -4);
    if (!NAME_RE.test(name)) continue;
    let description: string | undefined;
    const metaPath = path.join(dir, `${name}.meta.json`);
    if (existsSync(metaPath)) {
      try {
        const meta = metaSchema.parse(JSON.parse(await readFile(metaPath, "utf-8")));
        description = meta.description;
      } catch {
        /* ignore bad meta */
      }
    }
    out.push({ name, description });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function applyParamDefaults(
  def: QueryDefinition,
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...params };
  const spec = def.meta?.params ?? {};
  for (const [k, v] of Object.entries(spec)) {
    if (out[k] === undefined && v.default !== undefined) {
      out[k] = v.default;
    }
    if (v.required && (out[k] === undefined || out[k] === null)) {
      throw new Error(`Missing required param: ${k}`);
    }
    if (typeof out[k] === "number" && v.max != null && (out[k] as number) > v.max) {
      throw new Error(`Param ${k} exceeds max ${v.max}`);
    }
    if (typeof out[k] === "number" && v.min != null && (out[k] as number) < v.min) {
      throw new Error(`Param ${k} below min ${v.min}`);
    }
  }
  return out;
}

export function callerAllowed(
  def: QueryDefinition,
  caller: "end_user" | "workflow" | "api_key",
): boolean {
  const allow = def.meta?.allow;
  if (!allow || allow.length === 0) return true;
  return allow.includes(caller);
}

export { NAME_RE as QUERY_NAME_RE };
