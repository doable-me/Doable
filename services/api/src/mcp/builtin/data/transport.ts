/**
 * In-process MCP transport for the builtin `doable.data` control plane
 * (PRD per-app-db 06-mcp-integration). Satisfies the same McpTransport interface
 * as the HTTP/stdio transports so ConnectorManager treats it identically
 * (listTools / callTool / eviction / audit), but instead of JSON-RPC over a
 * socket it dispatches directly into the per-project PGlite worker pool.
 *
 * The five data.* tools share the SAME worker pool as the runtime HTTP data
 * plane (05-data-api) — a data.query tool-call and a Vite app's fetch are the
 * same call, only the entry point differs.
 *
 * Routing: the projectId is supplied by ConnectorManager from the per-project
 * connector row (scope=project). Without it the transport cannot route and
 * tools/call fails fast.
 */
import type { McpTransport } from "../../transport-http.js";
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "../../types.js";
import { sql } from "../../../db/index.js";
import { runOnProject } from "../../../data-worker/pool.js";
import { introspectSchema, inspectTable } from "../../../data-worker/schema.js";
import { applyMigration } from "../../../data-worker/migrate.js";
import { DOABLE_APP_DB_ROW_CAP, DOABLE_APP_DB_QUERY_TIMEOUT_MS, DOABLE_APP_DB_EXEC_TIMEOUT_MS } from "../../../data-worker/config.js";
import type { WorkerRequest, WorkerResponse } from "../../../data-worker/types.js";

/** The five tool descriptions the AI sees (matches 06 §"Tool definitions"). */
export const DATA_TOOL_DEFS = [
  {
    name: "data.query",
    description:
      "Execute a single SELECT/INSERT/UPDATE/DELETE against this project's PGlite database. RLS-wrapped: app.user_id is set per call.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", maxLength: 16384 },
        params: { type: "array", items: {}, maxItems: 32 },
        app_user_id: { type: "string", description: "Optional: simulate an end-user identity for RLS." },
        row_cap: { type: "integer", minimum: 1, maximum: 10000, default: 1000 },
      },
      required: ["sql"],
    },
  },
  {
    name: "data.exec",
    description: "Execute DDL or a multi-statement script. Prefer data.migrate for tracked schema changes.",
    inputSchema: {
      type: "object",
      properties: { sql: { type: "string", maxLength: 65536 }, params: { type: "array", items: {}, maxItems: 32 } },
      required: ["sql"],
    },
  },
  {
    name: "data.migrate",
    description: "Apply a named migration. Idempotent: replaying the same migration_id is a no-op. Recorded in _doable_migrations.",
    inputSchema: {
      type: "object",
      properties: { migration_id: { type: "string", pattern: "^[a-z0-9_-]{1,80}$" }, sql: { type: "string", maxLength: 65536 } },
      required: ["migration_id", "sql"],
    },
  },
  {
    name: "data.schema",
    description: "List tables, columns, indexes, and RLS policies. Read-only; safe anytime. Use it to self-verify migrations.",
    inputSchema: { type: "object", properties: {} },
    _meta: { ui: { resourceUri: "ui://doable.data/schema-inspector", permissions: ["read"], csp: ["default-src 'self'", "script-src 'self'"] } },
  },
  {
    name: "data.inspect",
    description: "Browse rows in one table with optional filter, limit, offset. Backs the table-inspector UI.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", pattern: "^[a-z_][a-z0-9_]{0,62}$" },
        where: { type: "string", maxLength: 1024 },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 50 },
        offset: { type: "integer", minimum: 0, default: 0 },
        app_user_id: { type: "string" },
      },
      required: ["table"],
    },
    _meta: { ui: { resourceUri: "ui://doable.data/table-inspector?table={table}", permissions: ["read"], csp: ["default-src 'self'", "script-src 'self'"] } },
  },
] as const;

type Args = Record<string, unknown>;

export type DataExecutor = (projectId: string, req: Omit<WorkerRequest, "id">) => Promise<WorkerResponse>;

export class DataBuiltinTransport implements McpTransport {
  private connected = false;
  // execOverride is a test seam; production uses the real pool's runOnProject.
  constructor(private readonly projectId: string | undefined, private readonly execOverride?: DataExecutor) {}

  async connect(): Promise<void> { this.connected = true; }
  async disconnect(): Promise<void> { this.connected = false; }
  isConnected(): boolean { return this.connected; }
  async sendNotification(_n: JsonRpcNotification): Promise<void> { /* no server-initiated notifications in v1 */ }

  async sendRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await this.dispatch(req.method, req.params ?? {});
      return { jsonrpc: "2.0", id: req.id, result };
    } catch (err) {
      return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: (err as Error).message } };
    }
  }

  private async dispatch(method: string, params: Args): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "doable.data", version: "1.0.0" },
        };
      case "tools/list":
        return { tools: DATA_TOOL_DEFS };
      case "tools/call":
        return this.callTool(String(params.name), (params.arguments as Args) ?? {});
      default:
        throw new Error(`builtin:data: unsupported method ${method}`);
    }
  }

  private exec = (req: Omit<WorkerRequest, "id">): Promise<WorkerResponse> => {
    if (!this.projectId) throw new Error("builtin:data: no projectId in connector context");
    if (this.execOverride) return this.execOverride(this.projectId, req);
    return runOnProject(this.projectId, req);
  };

  /**
   * Cached project-owner id used as the DEFAULT app.user_id for the AI's
   * build-time data writes. `undefined` = unresolved, `null` = none found.
   *
   * The AI's data.* tool calls carry no end-user (`x-doable-app-user`) header,
   * so before this they defaulted to app_user_id="" — the self-stamping
   * `created_by` DEFAULT then resolved to the all-zero anon UUID. Owner-scoped
   * RLS (`created_by = current_setting('app.user_id')`) subsequently hid every
   * AI-seeded row from the project owner's OWN preview, which DOES resolve
   * app.user_id to the owner (preview-proxy mints the viewer's id). Result: the
   * shell rendered but all seeded content (menus, catalogs, sample rows) was
   * invisible. Defaulting unspecified seed/DML writes to the owner makes the
   * stamped created_by match what the owner sees in their preview. The AI can
   * still pass an explicit app_user_id to simulate a specific end-user. The
   * runtime HTTP data plane (app-data.ts) resolves identity separately and is
   * unaffected by this default.
   */
  private ownerUserId?: string | null;

  private async resolveOwnerUserId(): Promise<string> {
    if (this.ownerUserId !== undefined) return this.ownerUserId ?? "";
    if (!this.projectId) {
      this.ownerUserId = null;
      return "";
    }
    try {
      // Read the owner from the builtin:data connector row, NOT projects/
      // workspaces: those are FORCE-RLS in the main DB and this lookup runs
      // outside an RLS context (no doable.current_user_id GUC set), so a JOIN
      // through them returns zero rows. mcp_connectors is not RLS-gated and its
      // created_by IS the provisioning owner (see register.ts ensureData-
      // ConnectorForProject -> createdBy: ownerUserId).
      const [row] = await sql<Array<{ created_by: string }>>`
        SELECT created_by
        FROM mcp_connectors
        WHERE project_id = ${this.projectId}
          AND server_command = 'builtin:data'
        LIMIT 1
      `;
      this.ownerUserId = row?.created_by ?? null;
    } catch {
      this.ownerUserId = null;
    }
    return this.ownerUserId ?? "";
  }

  private toContent(payload: unknown, isError = false): unknown {
    return { content: [{ type: "text", text: JSON.stringify(payload) }], isError };
  }

  private async callTool(name: string, args: Args): Promise<unknown> {
    switch (name) {
      case "data.query": {
        const resp = await this.exec({
          op: "query",
          sql: String(args.sql ?? ""),
          params: Array.isArray(args.params) ? args.params : [],
          app_user_id: typeof args.app_user_id === "string" ? args.app_user_id : await this.resolveOwnerUserId(),
          row_cap: typeof args.row_cap === "number" ? args.row_cap : DOABLE_APP_DB_ROW_CAP,
          timeout_ms: DOABLE_APP_DB_QUERY_TIMEOUT_MS,
        });
        return this.toContent(this.envelope(resp), !resp.ok);
      }
      case "data.exec": {
        const resp = await this.exec({
          op: "exec",
          sql: String(args.sql ?? ""),
          params: Array.isArray(args.params) ? args.params : [],
          // Default seed/DML inside an exec body to the owner too (see
          // resolveOwnerUserId); falls back to null when no owner is resolvable.
          app_user_id: typeof args.app_user_id === "string" ? args.app_user_id : ((await this.resolveOwnerUserId()) || null),
          timeout_ms: DOABLE_APP_DB_EXEC_TIMEOUT_MS,
        });
        return this.toContent(this.envelope(resp), !resp.ok);
      }
      case "data.migrate": {
        const result = await applyMigration(this.exec, String(args.migration_id ?? ""), String(args.sql ?? ""));
        return this.toContent(result);
      }
      case "data.schema": {
        const schema = await introspectSchema(this.exec);
        return this.toContent(schema);
      }
      case "data.inspect": {
        const resp = await inspectTable(this.exec, String(args.table ?? ""), {
          where: typeof args.where === "string" ? args.where : undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined,
          offset: typeof args.offset === "number" ? args.offset : undefined,
          appUserId: typeof args.app_user_id === "string" ? args.app_user_id : undefined,
        });
        return this.toContent(this.envelope(resp), !resp.ok);
      }
      default:
        throw new Error(`builtin:data: unknown tool ${name}`);
    }
  }

  private envelope(resp: WorkerResponse): unknown {
    if (!resp.ok) return { ok: false, error: resp.error };
    return { ok: true, rows: resp.rows ?? [], rowCount: resp.rowCount ?? 0, fields: resp.fields ?? [], truncated: resp.truncated ?? false };
  }
}

/** Factory used by the builtin registry. */
export function dataBuiltinTransport(opts: { projectId?: string }): McpTransport {
  return new DataBuiltinTransport(opts.projectId);
}
