/**
 * MCP capabilities-cache warmer.
 *
 * Root cause this fixes:
 *   When a user adds an MCP connector and immediately triggers AI generation,
 *   the auto-test that populates `mcp_connectors.capabilities_cache` is fired
 *   *non-blockingly* from the POST /connectors route. If generation starts
 *   before that probe completes (devtunnel cold start, slow remote, etc.),
 *   `buildConnectedMcpServersContext` reads an empty cache → emits the fallback
 *   "tools load on first use" line → the AI never sees real `mcp_…` tool names
 *   → it hallucinates names and bakes them as code strings, producing apps that
 *   show no data and chatbots that can't summarise responses.
 *
 *   The fix is a synchronous warm-up just before we read the cache to build
 *   the prompt: for every external (non-builtin) active connector in the
 *   workspace whose `capabilities_cache.tools.list` is missing or empty, probe
 *   the MCP server once with a tight per-connector timeout and persist the
 *   result. Bounded by an overall wall-clock budget so a single dead connector
 *   can never make chat hang.
 *
 *   Generic by construction — works for any MCP server on any install
 *   (docker / baremetal / doable-cli) because it operates entirely on the
 *   already-existing connector row + ConnectorManager.testConnection path.
 */

import { sql } from "../db/index.js";
import { connectorQueries, type McpConnectorRow } from "@doable/db";
import { BUILTIN_MCP_APPS } from "./builtin-connectors.js";
import { getConnectorManager } from "./connector-manager.js";
import type { McpConnectorConfig, McpToolDefinition } from "./types.js";

const connectors = connectorQueries(sql);
const BUILTIN_CONNECTOR_NAMES = new Set(BUILTIN_MCP_APPS.map((a) => a.name));

/** Default budgets — chosen so the first generation after adding a connector
 *  waits long enough for a normal MCP server to respond, but never holds chat
 *  hostage if the server is dead. */
const DEFAULT_PER_CONNECTOR_TIMEOUT_MS = 8_000;
// Allow extra wall-clock for the output-shape sampling phase below. Bounded so a
// dead/slow connector can never hold chat hostage; this only ever blocks ONCE
// per connector (the captured shapes are cached and reused forever after).
const DEFAULT_TOTAL_TIMEOUT_MS = 120_000;

/** Output-shape sampling budgets (see captureOutputShapes). Two dependency-ordered
 *  passes run back-to-back, each capped by SHAPE_PHASE_TIMEOUT_MS. Generous because
 *  this is a ONE-TIME cost per connector — the shapes are cached forever after. */
const SHAPE_PHASE_TIMEOUT_MS = 45_000; // cap for one sampling pass over a connector's tools
const SHAPE_PER_CALL_TIMEOUT_MS = 15_000; // cap for a single sample tool call (a discovery tool returning a whole portfolio can take several seconds)
const MAX_SAMPLE_TOOLS = 60; // cap read-only tools sampled per connector (cover whole servers)
// Sample at BOUNDED concurrency, not all-at-once: hammering an MCP server with
// every read tool in parallel makes its slowest (largest) responses — exactly the
// list/discovery tools we most need shapes for — exceed the per-call timeout and
// get dropped. A small pool keeps each call near its standalone latency.
const SHAPE_CONCURRENCY = 3;

/** A cached tool entry. `outputShape` is a compact, human/LLM-readable summary of
 *  the REAL response observed when the tool was sampled at probe time — this is
 *  what lets the generator bind to actual response keys instead of guessing. */
interface CachedTool {
  name: string;
  description?: string;
  outputShape?: string;
}

interface CacheTools {
  // shapesV3 supersedes V2/V1: V1 = types-only; V2 = unioned fields + real
  // enum/example values; V3 adds DEPENDENCY-ORDERED probing — id-requiring
  // read tools (e.g. a "details" tool needing an id) are now sampled with REAL
  // ids harvested from the discovery tools' responses, so the WHOLE server's
  // tools get shapes, not just the no-arg ones. Bumping the marker forces a
  // one-time re-capture of connectors warmed under V1/V2.
  tools?: { list?: Array<CachedTool>; shapesV1?: boolean; shapesV2?: boolean; shapesV3?: boolean };
}

function isCacheEmpty(row: McpConnectorRow): boolean {
  const cache = row.capabilities_cache as CacheTools | null;
  const list = cache?.tools?.list;
  return !Array.isArray(list) || list.length === 0;
}

/**
 * A connector needs (re)warming if its tool list is empty OR the list predates
 * the current output-shape capture (no `shapesV2` marker). This ensures
 * connectors probed before this feature — INCLUDING those captured under the
 * older types-only `shapesV1` — get their real (value-annotated) response shapes
 * captured exactly once on the next generation, then cached.
 */
function needsWarming(row: McpConnectorRow): boolean {
  if (isCacheEmpty(row)) return true;
  const cache = row.capabilities_cache as CacheTools | null;
  return cache?.tools?.shapesV3 !== true;
}

// ─── Generic output-shape sampling (server-agnostic) ──────────────────────────

/** Tool-name heuristics: only ever SAMPLE tools that look read-only, so probing
 *  can never trigger a mutation on the user's MCP server. A write match always
 *  wins over a read match. */
const READ_NAME_RE =
  /(^|[_-])(list|get|query|search|fetch|read|find|show|describe|count|summary|summarize|view|lookup|retrieve|explore|browse|stat|status|detail|details|info|all)([_-]|$)/i;
const WRITE_NAME_RE =
  /(^|[_-])(create|update|delete|remove|write|set|add|insert|put|post|send|patch|drop|modify|edit|upload|cancel|approve|reject|execute|run|trigger|apply|release|assign|revoke|disable|enable|move|copy|rename|restore|purge|archive|import|export|sync|register|provision|deploy|start|stop|restart|kill|destroy|reset|generate|submit|publish|share|grant|invite|login|logout|authorize)([_-]|$)/i;

export function isLikelyReadOnly(tool: McpToolDefinition): boolean {
  // Respect an explicit MCP readOnlyHint annotation when present (most reliable).
  const ann = (tool as { annotations?: { readOnlyHint?: boolean } }).annotations;
  if (ann?.readOnlyHint === true) return true;
  if (ann?.readOnlyHint === false) return false;
  if (WRITE_NAME_RE.test(tool.name)) return false;
  return READ_NAME_RE.test(tool.name);
}

/** Derive the MINIMAL set of args needed to satisfy a tool's required inputs, so
 *  read tools that require a param (e.g. an enum `type`) can still be sampled.
 *  Optional params are omitted. Never invents free-text values beyond "". */
export function deriveSafeArgs(inputSchema: McpToolDefinition["inputSchema"]): Record<string, unknown> {
  const props = (inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(inputSchema?.required) ? inputSchema.required : [];
  const args: Record<string, unknown> = {};
  for (const key of required) {
    const spec = props[key] ?? {};
    if (Array.isArray(spec.enum) && spec.enum.length > 0) { args[key] = spec.enum[0]; continue; }
    if (spec.default !== undefined) { args[key] = spec.default; continue; }
    switch (spec.type) {
      case "number": case "integer": args[key] = 1; break;
      case "boolean": args[key] = false; break;
      case "array": args[key] = []; break;
      case "object": args[key] = {}; break;
      default: args[key] = ""; // string / unknown — best effort
    }
  }
  return args;
}

// ─── Shape + real-value description tuning ────────────────────────────────────
const MAX_DEPTH = 3; // don't descend past this many object levels
const MAX_KEYS = 24; // cap fields shown per object (unioned across records)
const SAMPLE_RECORDS = 16; // array items inspected to union keys + collect values
const ENUM_MAX = 6; // ≤ this many distinct primitive values → list them as an enum
const EXAMPLE_STR_MAX = 40; // truncate string examples to this many chars

/** Format a single primitive value for a prompt hint (strings quoted+truncated). */
function fmtValue(v: unknown): string {
  if (typeof v === "string") {
    const s = v.length > EXAMPLE_STR_MAX ? v.slice(0, EXAMPLE_STR_MAX) + "…" : v;
    return JSON.stringify(s);
  }
  if (typeof v === "bigint") return `${v.toString()}n`;
  return String(v);
}

/**
 * Annotate a primitive field with the REAL values observed in the live data —
 * this is what lets the generator map status/enum/flag fields to actual values
 * instead of guessing labels (the "status: Unknown / Active=0" bug). Discovered
 * purely from the sampled response — NEVER a hardcoded field name or value.
 *   - 1 distinct value      → `type (e.g. <value>)`
 *   - 2..ENUM_MAX distinct  → `type (values: a | b | c)`   (a real enum)
 *   - many distinct         → `type (e.g. <one value>)`
 */
function annotatePrimitive(values: unknown[]): string {
  const prims = values.filter((v) => v === null || typeof v !== "object");
  if (prims.length === 0) return "any";
  const nonNull = prims.find((v) => v !== null);
  const type = nonNull === undefined ? "null" : typeof nonNull;
  const seen = new Set<string>();
  const distinct: unknown[] = [];
  for (const v of prims) {
    if (v === null) continue;
    const key = typeof v === "string" ? `s:${v}` : `${typeof v}:${String(v)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(v);
    if (distinct.length > ENUM_MAX + 1) break;
  }
  if (distinct.length === 0) return type; // all-null
  if (distinct.length === 1) return `${type} (e.g. ${fmtValue(distinct[0])})`;
  if (distinct.length <= ENUM_MAX)
    return `${type} (values: ${distinct.map(fmtValue).join(" | ")})`;
  return `${type} (e.g. ${fmtValue(distinct[0])})`;
}

/**
 * Describe one logical "slot" given ALL real samples of it (e.g. the value of a
 * given field across many array records). Unions object keys across records (so
 * a field absent from the first row is still surfaced), recurses into arrays,
 * and annotates primitive leaves with real enum/example values. `_meta` is
 * always stripped. Bulk row data is never embedded — only key names, types, and
 * a small distinct-value sample.
 */
function describeValues(values: unknown[], depth: number): string {
  const defined = values.filter((v) => v !== undefined);
  if (defined.length === 0) return "any";

  // Arrays — describe element shape from a flattened sample, report max length.
  const arrays = defined.filter(Array.isArray) as unknown[][];
  if (arrays.length > 0 && arrays.length === defined.length) {
    const maxLen = Math.max(...arrays.map((a) => a.length));
    if (maxLen === 0) return "array[0] of any";
    const items = arrays.flat().slice(0, SAMPLE_RECORDS);
    return `array[${maxLen}] of ${describeValues(items, depth + 1)}`;
  }

  // Objects — union keys across all sampled records.
  const objs = defined.filter(
    (v): v is Record<string, unknown> =>
      v !== null && typeof v === "object" && !Array.isArray(v),
  );
  if (objs.length === defined.length) {
    if (depth >= MAX_DEPTH) return "object";
    const keys: string[] = [];
    for (const o of objs)
      for (const k of Object.keys(o))
        if (k !== "_meta" && !keys.includes(k)) keys.push(k);
    if (keys.length === 0) return "object";
    const shown = keys.slice(0, MAX_KEYS);
    const parts = shown.map(
      (k) => `${k}: ${describeValues(objs.map((o) => o[k]), depth + 1)}`,
    );
    if (keys.length > shown.length)
      parts.push(`…+${keys.length - shown.length} more`);
    return `{ ${parts.join(", ")} }`;
  }

  // Primitives (or a mix) → type + real-value hint.
  return annotatePrimitive(defined);
}

/**
 * Build a compact, depth-limited shape summary of a real response value. Keeps
 * KEY NAMES + types + array lengths (the original bug was wrong key names),
 * unions per-record fields, annotates primitive leaves with the REAL enum /
 * example VALUES seen in the data (so the generator binds status/flag/count
 * fields to actual values), strips the LLM-only `_meta` blob, and never embeds
 * bulk row data. A standalone primitive returns its bare type (no value hint) so
 * the summary of a scalar response stays terse.
 */
export function summarizeShape(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array[0] of any";
    return describeValues([value], depth);
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).filter(
      (k) => k !== "_meta",
    );
    if (keys.length === 0) return "object";
    return describeValues([value], depth);
  }
  return typeof value; // string | number | boolean | bigint | symbol | function
}

/** Sample a single tool's real output and return a compact shape string, or
 *  undefined on any failure (never throws). The proxy wraps results as
 *  `{ success, data }`, so we summarize from the parsed `data`. */
async function sampleToolShape(
  config: McpConnectorConfig,
  tool: McpToolDefinition,
  args: Record<string, unknown>,
): Promise<{ shape?: string; data?: unknown }> {
  try {
    const manager = getConnectorManager();
    const res = await withTimeout(
      manager.callTool(config, tool.name, args),
      SHAPE_PER_CALL_TIMEOUT_MS,
      `[mcp-cache-warmer] sample ${config.name}/${tool.name}`,
    );
    if (res.isError) return {};
    const text = res.content
      .filter((it): it is { type: "text"; text: string } => it.type === "text")
      .map((it) => it.text)
      .join("\n");
    if (!text) return {};
    let data: unknown;
    try { data = JSON.parse(text); } catch { return {}; } // non-JSON → not bindable
    let shape = `result.data = ${summarizeShape(data, 0)}`;
    // Richer (key-unioned + real enum/example values) descriptions run longer
    // than the original types-only summary, so allow more headroom here; the
    // prompt-manifest applies its own per-tool + cumulative budget downstream.
    if (shape.length > 2200) shape = shape.slice(0, 2200) + " …}";
    return { shape, data };
  } catch {
    return {}; // timeout, auth, validation — degrade to the no-shape line
  }
}

// ─── Dependency-ordered probing (generic; no server/field names hardcoded) ────

/** A pool of REAL primitive values observed in already-sampled responses, keyed
 *  by the field NAME they appeared under. Lets us satisfy an id-requiring read
 *  tool (e.g. a "details" tool needing some id) with a real value harvested from
 *  a discovery tool's response, instead of sending junk that the server rejects. */
type ValuePool = Map<string, unknown[]>;
const POOL_VALUES_PER_KEY = 8;
const POOL_HARVEST_DEPTH = 6;

/** Walk a sampled response and record primitive leaves under their key name.
 *  Server-agnostic: never looks for specific field names. `_meta` is skipped. */
function harvestValues(value: unknown, pool: ValuePool, depth = 0): void {
  if (depth > POOL_HARVEST_DEPTH || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, SAMPLE_RECORDS)) harvestValues(item, pool, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "_meta") continue;
      if (v !== null && typeof v !== "object") {
        const arr = pool.get(k) ?? [];
        if (arr.length < POOL_VALUES_PER_KEY && !arr.includes(v) && v !== "") {
          arr.push(v);
          pool.set(k, arr);
        }
      } else {
        harvestValues(v, pool, depth + 1);
      }
    }
  }
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function typeMatches(v: unknown, want: unknown): boolean {
  if (want === "number" || want === "integer") return typeof v === "number";
  if (want === "boolean") return typeof v === "boolean";
  if (want === "string" || want === undefined) return typeof v === "string" || typeof v === "number";
  return true;
}

/** Find a harvested value whose field name matches `paramName` (exact → normalized
 *  → containment either way, e.g. param `folderId` ↔ harvested `folderId`/`id`). */
function matchPool(paramName: string, spec: Record<string, unknown>, pool: ValuePool): unknown {
  const target = normKey(paramName);
  let fallback: unknown;
  for (const [k, vals] of pool) {
    const nk = normKey(k);
    const hit = nk === target || nk.endsWith(target) || target.endsWith(nk) || nk.includes(target) || target.includes(nk);
    if (!hit) continue;
    const typed = vals.find((v) => typeMatches(v, spec.type));
    if (nk === target && typed !== undefined) return typed; // exact name wins immediately
    if (typed !== undefined && fallback === undefined) fallback = typed;
  }
  return fallback;
}

/** True when a tool's REQUIRED params can be satisfied with no external context
 *  (no required value, or only enum/default/boolean/array/object). A required
 *  free string or bare number likely needs a real id → defer to pass 2. */
function requiredSatisfiableStandalone(inputSchema: McpToolDefinition["inputSchema"]): boolean {
  const props = (inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(inputSchema?.required) ? inputSchema.required : [];
  for (const key of required) {
    const spec = props[key] ?? {};
    if (Array.isArray(spec.enum) && spec.enum.length > 0) continue;
    if (spec.default !== undefined) continue;
    if (spec.type === "boolean" || spec.type === "array" || spec.type === "object") continue;
    return false; // required string / number without enum|default → needs a real value
  }
  return true;
}

/** Fill a tool's required params from the harvested pool. Returns the args, or
 *  null if any required param can't be satisfied with a REAL value (so we never
 *  send junk that the server rejects). */
function deriveArgsFromPool(
  inputSchema: McpToolDefinition["inputSchema"],
  pool: ValuePool,
): Record<string, unknown> | null {
  const props = (inputSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = Array.isArray(inputSchema?.required) ? inputSchema.required : [];
  const args: Record<string, unknown> = {};
  for (const key of required) {
    const spec = props[key] ?? {};
    if (Array.isArray(spec.enum) && spec.enum.length > 0) { args[key] = spec.enum[0]; continue; }
    if (spec.default !== undefined) { args[key] = spec.default; continue; }
    if (spec.type === "boolean") { args[key] = false; continue; }
    if (spec.type === "array") { args[key] = []; continue; }
    if (spec.type === "object") { args[key] = {}; continue; }
    const real = matchPool(key, spec, pool);
    if (real === undefined) return null; // can't satisfy with a real value
    args[key] = real;
  }
  return args;
}

/** Capture real output shapes for the read-only tools of one connector via TWO
 *  dependency-ordered passes (generic — nothing about any specific MCP server):
 *    Pass 1 — sample tools whose required args are satisfiable standalone
 *             (discovery/list/search tools). Harvest every real primitive value
 *             from their responses into a name→values pool.
 *    Pass 2 — sample the remaining id-requiring tools, filling their required
 *             params from the harvested pool (e.g. a real id from pass 1).
 *  Returns a name→shape map (possibly empty). Time-bounded; never throws. */
async function captureOutputShapes(
  config: McpConnectorConfig,
  tools: McpToolDefinition[],
): Promise<Record<string, string>> {
  const readOnly = tools.filter(isLikelyReadOnly).slice(0, MAX_SAMPLE_TOOLS);
  if (readOnly.length === 0) return {};
  const shapes: Record<string, string> = {};
  const pool: ValuePool = new Map();

  const runPass = async (
    batch: Array<{ tool: McpToolDefinition; args: Record<string, unknown> }>,
    tag: string,
  ): Promise<void> => {
    if (batch.length === 0) return;
    // Bounded-concurrency worker pool: SHAPE_CONCURRENCY calls in flight at once,
    // pulling from a shared queue. Keeps slow/large discovery responses near
    // their standalone latency instead of starving them under a parallel burst.
    let next = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const i = next++;
        if (i >= batch.length) return;
        const { tool, args } = batch[i]!;
        const { shape, data } = await sampleToolShape(config, tool, args);
        if (shape) shapes[tool.name] = shape;
        if (data !== undefined) harvestValues(data, pool);
      }
    };
    const workers = Array.from(
      { length: Math.min(SHAPE_CONCURRENCY, batch.length) },
      () => worker(),
    );
    await withTimeout(
      Promise.allSettled(workers).then(() => undefined),
      SHAPE_PHASE_TIMEOUT_MS,
      tag,
    ).catch(() => {}); // partial results are fine
  };

  // Pass 1 — standalone-satisfiable tools (discovery). Populates the value pool.
  const pass1 = readOnly.filter((t) => requiredSatisfiableStandalone(t.inputSchema));
  await runPass(
    pass1.map((tool) => ({ tool, args: deriveSafeArgs(tool.inputSchema) })),
    `[mcp-cache-warmer] shape pass-1 ${config.name}`,
  );

  // Pass 2 — id-requiring tools, satisfied from values harvested in pass 1.
  const pass2: Array<{ tool: McpToolDefinition; args: Record<string, unknown> }> = [];
  for (const tool of readOnly) {
    if (shapes[tool.name]) continue; // already captured in pass 1
    const args = deriveArgsFromPool(tool.inputSchema, pool);
    if (args !== null) pass2.push({ tool, args });
  }
  await runPass(pass2, `[mcp-cache-warmer] shape pass-2 ${config.name}`);

  return shapes;
}

function isExternal(row: McpConnectorRow): boolean {
  return (
    row.status === "active" &&
    !(row.server_command ?? "").startsWith("builtin:") &&
    !BUILTIN_CONNECTOR_NAMES.has(row.name)
  );
}

function rowToProbeConfig(row: McpConnectorRow): McpConnectorConfig {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? undefined,
    scope: row.scope,
    name: row.name,
    description: row.description ?? undefined,
    transportType: row.transport_type,
    serverUrl: row.server_url ?? undefined,
    serverCommand: row.server_command ?? undefined,
    serverArgs: row.server_args ?? [],
    authType: row.auth_type,
    status: row.status as McpConnectorConfig["status"],
    capabilitiesCache: (row.capabilities_cache as McpConnectorConfig["capabilitiesCache"]) ?? undefined,
    lastConnectedAt: row.last_connected_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number, tag: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}: timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

async function probeAndPersist(row: McpConnectorRow, perConnectorTimeoutMs: number): Promise<void> {
  const config = rowToProbeConfig(row);
  const manager = getConnectorManager();
  const result = await withTimeout(
    manager.testConnection(config),
    perConnectorTimeoutMs,
    `[mcp-cache-warmer] probe ${config.name}`,
  );
  if (result.success && result.tools) {
    // Capture REAL output shapes for read-only tools so the generator binds to
    // actual response keys instead of guessing (the "shows 0 despite 200" bug).
    // Best-effort + time-bounded; degrades to no-shape lines on any failure.
    let shapes: Record<string, string> = {};
    try {
      shapes = await captureOutputShapes(config, result.tools);
    } catch (err) {
      console.warn(
        `[mcp-cache-warmer] shape capture failed for ${config.name}: ${err instanceof Error ? err.message : err}`,
      );
    }
    const shapeCount = Object.keys(shapes).length;
    await connectors.updateConnectorStatus(row.id, "active", {
      capabilities: {
        tools: {
          count: result.tools.length,
          // `shapesV3` marks that the dependency-ordered output-shape capture
          // was ATTEMPTED, so we never re-sample this connector on every
          // subsequent generation. (Supersedes V2/V1.)
          shapesV3: true,
          list: result.tools.map((t) => ({
            name: t.name,
            description: t.description,
            ...(shapes[t.name] ? { outputShape: shapes[t.name] } : {}),
          })),
        },
      },
    });
    console.log(
      `[mcp-cache-warmer] populated ${config.name}: ${result.tools.length} tools, ${shapeCount} shape(s) captured`,
    );
  } else if (!result.success) {
    // Don't downgrade status — the cache simply stays empty for this call.
    // The next generation request will retry. We log so failures are visible.
    console.warn(
      `[mcp-cache-warmer] probe failed for ${config.name}: ${result.error ?? "(no error)"}`,
    );
  }
}

/**
 * For every external (user-added, non-builtin) active MCP connector in the
 * workspace whose capabilities cache is empty, probe synchronously and persist
 * the freshly discovered tool list. Bounded by `perConnectorTimeoutMs` per
 * connector and `totalTimeoutMs` overall.
 *
 * Best-effort: this function NEVER throws. If a probe fails or times out the
 * cache simply stays empty for the current request and the existing fallback
 * "(tools load on first use)" line is shown — the same behavior we had before
 * this fix, so we degrade gracefully instead of breaking chat.
 */
export async function ensureMcpCacheFresh(
  workspaceId: string,
  opts?: { perConnectorTimeoutMs?: number; totalTimeoutMs?: number },
): Promise<void> {
  const perConnectorTimeoutMs =
    opts?.perConnectorTimeoutMs ?? DEFAULT_PER_CONNECTOR_TIMEOUT_MS;
  const totalTimeoutMs = opts?.totalTimeoutMs ?? DEFAULT_TOTAL_TIMEOUT_MS;

  let rows: McpConnectorRow[];
  try {
    rows = await connectors.listConnectors(workspaceId);
  } catch (err) {
    console.warn("[mcp-cache-warmer] failed to list connectors:", err);
    return;
  }

  const stale = rows.filter((r) => isExternal(r) && needsWarming(r));
  if (stale.length === 0) return;

  console.log(
    `[mcp-cache-warmer] warming ${stale.length} connector(s) for workspace=${workspaceId.slice(0, 8)}: ${stale.map((r) => r.name).join(", ")}`,
  );

  const probes = stale.map((r) =>
    probeAndPersist(r, perConnectorTimeoutMs).catch((err) => {
      console.warn(
        `[mcp-cache-warmer] ${r.name}: ${err instanceof Error ? err.message : err}`,
      );
    }),
  );

  await withTimeout(
    Promise.allSettled(probes).then(() => undefined),
    totalTimeoutMs,
    "[mcp-cache-warmer] overall warm-up",
  ).catch((err) => {
    console.warn(
      `[mcp-cache-warmer] overall timeout — some connectors did not finish warming: ${err instanceof Error ? err.message : err}`,
    );
  });
}
