import * as crypto from "node:crypto";
import { PostgresStore } from "./store.js";
import { DoableFilesService } from "./files-service.js";
import { DoableConnectionsManager } from "./connections-manager.js";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:4000";
const PUBLIC_URL = process.env.PUBLIC_URL ?? API_URL;

/**
 * Build an ActionContext compatible with Activepieces piece actions.
 *
 * Every piece action receives an ActionContext object. Most actions only use
 * auth + propsValue. We provide real implementations for the commonly-used
 * services (store, files, connections) and stubs for the rest.
 */
export function buildActionContext(params: {
  auth: unknown;
  props: Record<string, unknown>;
  userId: string;
  workspaceId: string;
  projectId?: string;
}): Record<string, unknown> {
  return {
    // ── Real implementations (used by 100% of actions) ──
    auth: params.auth,
    propsValue: params.props,

    // ── Real implementations (used by ~15% of actions) ──
    executionType: "BEGIN",
    store: new PostgresStore(params.userId, params.workspaceId),
    files: new DoableFilesService(),
    server: {
      apiUrl: API_URL,
      publicUrl: PUBLIC_URL,
      token: "",
    },
    connections: new DoableConnectionsManager(params.userId, params.workspaceId),

    // ── Stubs (used by <1% of actions) ──
    tags: { add: async () => {} },
    output: { update: async () => {} },
    agent: { tools: async () => ({}) },
    project: {
      id: params.projectId ?? params.workspaceId,
      externalId: async () => undefined,
    },
    flows: {
      current: { id: "doable", version: { id: "1" } },
      list: async () => ({ data: [], next: null, previous: null }),
    },
    step: { name: "doable_action" },
    run: {
      id: crypto.randomUUID(),
      stop: () => ({ type: "STOP" }),
      pause: () => ({ type: "PAUSE" }),
      respond: () => ({}),
    },
    generateResumeUrl: () => "",
  };
}
