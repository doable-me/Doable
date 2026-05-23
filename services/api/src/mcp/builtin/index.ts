/**
 * Builtin (in-process) MCP transport registry (PRD per-app-db 06 §"Transport
 * factory short-circuit"). Any connector whose serverCommand starts with
 * `builtin:` resolves to an in-process handler that satisfies McpTransport, so
 * ConnectorManager treats it identically to a real transport.
 */
import type { McpTransport } from "../transport-http.js";
import { dataBuiltinTransport } from "./data/transport.js";

export interface BuiltinTransportOpts {
  serverArgs?: string[];
  serverEnv?: Record<string, string>;
  projectId?: string;
}

type BuiltinFactory = (opts: BuiltinTransportOpts) => McpTransport;

const REGISTRY: Record<string, BuiltinFactory> = {
  "builtin:data": dataBuiltinTransport,
};

export function createBuiltinTransport(command: string, opts: BuiltinTransportOpts): McpTransport {
  const factory = REGISTRY[command];
  if (!factory) throw new Error(`Unknown builtin transport: ${command}`);
  return factory(opts);
}
