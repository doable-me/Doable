// Shared tracing types used across the doable tracing system.

export type TracingLevel = "off" | "errors-only" | "sampled" | "full" | "debug";

export const TRACING_LEVELS: TracingLevel[] = ["off", "errors-only", "sampled", "full", "debug"];

export interface RequestContext {
  requestId: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  route?: string;
}

export interface TracingOverride {
  id: string;
  scope: "user" | "workspace" | "route";
  scopeValue: string;
  level: TracingLevel;
  reason: string;
  grantedBy: string | null;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Names doable uses for service.name resource attribute. */
export const SERVICE_NAMES = {
  api: "doable-api",
  ws: "doable-ws",
  web: "doable-web",
  webBrowser: "doable-web-browser",
} as const;
