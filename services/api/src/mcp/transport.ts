import { StreamableHttpTransport, LegacySseTransport } from "./transport-http.js";
import { StdioTransport } from "./transport-stdio.js";
import type { McpTransport } from "./transport-http.js";
import { createBuiltinTransport } from "./builtin/index.js";

export type { McpTransport } from "./transport-http.js";
export { StreamableHttpTransport, LegacySseTransport } from "./transport-http.js";
export { StdioTransport } from "./transport-stdio.js";

/** Create the appropriate transport for a connector config */
export function createTransport(
  transportType: string,
  opts: {
    serverUrl?: string;
    serverCommand?: string;
    serverArgs?: string[];
    serverEnv?: Record<string, string>;
    headers?: Record<string, string>;
    projectId?: string;
  },
): McpTransport {
  // ── Builtin short-circuit (PRD per-app-db 06) ──
  // Any connector whose serverCommand starts with `builtin:` resolves to an
  // in-process handler implementing the same McpTransport interface — no stdio
  // subprocess, no JSON-RPC over a pipe. Must come BEFORE the transportType
  // switch (builtin rows carry transport_type 'stdio' as a catch-all).
  if (opts.serverCommand?.startsWith("builtin:")) {
    return createBuiltinTransport(opts.serverCommand, {
      serverArgs: opts.serverArgs,
      serverEnv: opts.serverEnv,
      projectId: opts.projectId,
    });
  }

  switch (transportType) {
    case "streamable_http":
      if (!opts.serverUrl) throw new Error("serverUrl required for streamable_http transport");
      return new StreamableHttpTransport(opts.serverUrl, opts.headers);

    case "http_sse":
      if (!opts.serverUrl) throw new Error("serverUrl required for http_sse transport");
      return new LegacySseTransport(opts.serverUrl, opts.headers);

    case "stdio":
      if (!opts.serverCommand) throw new Error("serverCommand required for stdio transport");
      return new StdioTransport(opts.serverCommand, opts.serverArgs, opts.serverEnv);

    default:
      throw new Error(`Unknown transport type: ${transportType}`);
  }
}
