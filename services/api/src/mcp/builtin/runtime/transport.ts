/**
 * In-process MCP transport for the builtin `doable.runtime` control plane
 * (FULLSTACK_RUNTIME §7.3). Satisfies the same McpTransport interface as
 * builtin:data so ConnectorManager treats it identically.
 *
 * Handlers live in app-runtime/mcp-handlers.ts (stubs in Phase 0).
 */
import type { McpTransport } from "../../transport-http.js";
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "../../types.js";
import {
  runtimeValidate,
  runtimeUpsertQuery,
  runtimeTestQuery,
  runtimeApplyDataTemplate,
  runtimeUpsertSchedule,
  runtimeUpsertWebhook,
  runtimeUpsertCdcBinding,
  runtimeTestWorkflow,
  runtimeOpenapi,
} from "../../../app-runtime/mcp-handlers.js";

/** Tool descriptions the AI sees (matches FULLSTACK_RUNTIME §7.3). */
export const RUNTIME_TOOL_DEFS = [
  {
    name: "runtime.validate",
    description:
      "Parse all .doable/backend/** manifests, Mustache named queries, and workflow syntax. Call before claiming a backend feature is done.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional subdirectory under .doable/backend to validate (default: all).",
        },
      },
    },
  },
  {
    name: "runtime.upsert_query",
    description:
      "Write/update a named query .sql (+ optional .meta.json) under .doable/backend/queries and validate Mustache compile.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$" },
        sql: { type: "string", maxLength: 65536 },
        meta: { type: "object", description: "Optional query .meta.json object" },
      },
      required: ["name", "sql"],
    },
  },
  {
    name: "runtime.test_query",
    description:
      "Run a named query with fixture params. Optional app_user_id simulates RLS identity.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        params: { type: "object" },
        app_user_id: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "runtime.apply_data_template",
    description:
      "Apply a starter data template pack (migrations + optional seed). Prefer before hand-rolling common schemas.",
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "e.g. saas-leads, waitlist, todo-multi-tenant" },
      },
      required: ["template_id"],
    },
  },
  {
    name: "runtime.upsert_schedule",
    description: "Register or update a cron schedule manifest (DB + .doable/backend/schedules).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cron: { type: "string" },
        timezone: { type: "string", default: "UTC" },
        workflow: { type: "string" },
        enabled: { type: "boolean", default: true },
      },
      required: ["id", "cron", "workflow"],
    },
  },
  {
    name: "runtime.upsert_webhook",
    description:
      "Register or update a webhook + ensure secret_ref exists in secrets.refs.json (value stays in vault).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        workflow: { type: "string" },
        secret_ref: { type: "string" },
        enabled: { type: "boolean", default: true },
      },
      required: ["name", "workflow", "secret_ref"],
    },
  },
  {
    name: "runtime.upsert_cdc_binding",
    description:
      "Write a CDC binding (table ops → topic and/or workflow). Validates table exists. Never use PGlite LISTEN.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        table: { type: "string" },
        ops: {
          type: "array",
          items: { type: "string", enum: ["insert", "update", "delete"] },
          minItems: 1,
        },
        topic: { type: ["string", "null"] },
        workflow: { type: ["string", "null"] },
      },
      required: ["id", "table", "ops"],
    },
  },
  {
    name: "runtime.test_workflow",
    description: "Dry-run a workflow with a fixture payload in the sandbox.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: "string" },
        payload: { type: "object" },
        trigger_type: {
          type: "string",
          enum: ["manual", "cron", "webhook", "topic", "cdc", "call"],
          default: "manual",
        },
      },
      required: ["workflow_id"],
    },
  },
  {
    name: "runtime.openapi",
    description:
      "Return generated OpenAPI for exposed auto-CRUD tables plus the list of named query names.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

type Args = Record<string, unknown>;

export type RuntimeToolHandler = (
  projectId: string,
  args: Args,
) => Promise<unknown>;

export class RuntimeBuiltinTransport implements McpTransport {
  private connected = false;

  constructor(
    private readonly projectId: string | undefined,
    private readonly handlerOverride?: Partial<Record<string, RuntimeToolHandler>>,
  ) {}

  async connect(): Promise<void> {
    this.connected = true;
  }
  async disconnect(): Promise<void> {
    this.connected = false;
  }
  isConnected(): boolean {
    return this.connected;
  }
  async sendNotification(_n: JsonRpcNotification): Promise<void> {
    /* no server-initiated notifications in v1 */
  }

  async sendRequest(req: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await this.dispatch(req.method, req.params ?? {});
      return { jsonrpc: "2.0", id: req.id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32000, message: (err as Error).message },
      };
    }
  }

  private async dispatch(method: string, params: Args): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "doable.runtime", version: "1.0.0" },
        };
      case "tools/list":
        return { tools: RUNTIME_TOOL_DEFS };
      case "tools/call":
        return this.callTool(String(params.name), (params.arguments as Args) ?? {});
      default:
        throw new Error(`builtin:runtime: unsupported method ${method}`);
    }
  }

  private requireProjectId(): string {
    if (!this.projectId) throw new Error("builtin:runtime: no projectId in connector context");
    return this.projectId;
  }

  private toContent(payload: unknown, isError = false): unknown {
    return { content: [{ type: "text", text: JSON.stringify(payload) }], isError };
  }

  private async callTool(name: string, args: Args): Promise<unknown> {
    const projectId = this.requireProjectId();
    const override = this.handlerOverride?.[name];
    if (override) {
      const payload = await override(projectId, args);
      const isError =
        typeof payload === "object" &&
        payload !== null &&
        "ok" in payload &&
        (payload as { ok: unknown }).ok === false;
      return this.toContent(payload, isError);
    }

    let payload: unknown;
    switch (name) {
      case "runtime.validate":
        payload = await runtimeValidate(projectId, args);
        break;
      case "runtime.upsert_query":
        payload = await runtimeUpsertQuery(projectId, args);
        break;
      case "runtime.test_query":
        payload = await runtimeTestQuery(projectId, args);
        break;
      case "runtime.apply_data_template":
        payload = await runtimeApplyDataTemplate(projectId, args);
        break;
      case "runtime.upsert_schedule":
        payload = await runtimeUpsertSchedule(projectId, args);
        break;
      case "runtime.upsert_webhook":
        payload = await runtimeUpsertWebhook(projectId, args);
        break;
      case "runtime.upsert_cdc_binding":
        payload = await runtimeUpsertCdcBinding(projectId, args);
        break;
      case "runtime.test_workflow":
        payload = await runtimeTestWorkflow(projectId, args);
        break;
      case "runtime.openapi":
        payload = await runtimeOpenapi(projectId, args);
        break;
      default:
        throw new Error(`builtin:runtime: unknown tool ${name}`);
    }

    const isError =
      typeof payload === "object" &&
      payload !== null &&
      "ok" in payload &&
      (payload as { ok: unknown }).ok === false;
    return this.toContent(payload, isError);
  }
}

/** Factory used by the builtin registry. */
export function runtimeBuiltinTransport(opts: { projectId?: string }): McpTransport {
  return new RuntimeBuiltinTransport(opts.projectId);
}
