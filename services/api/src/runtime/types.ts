export type RuntimeKind = "static" | "process";
export type ListenContract = "tcp-port" | "unix-socket";

export interface RuntimeContext {
  projectId: string;
  projectSlug: string;
  workspaceSlug: string;
  siteDir: string;
  projectDir: string;
  framework: { id: string; version?: string };
  env: Record<string, string>;
  listen:
    | { kind: "unix-socket"; path: string }
    | { kind: "tcp-port"; host: "127.0.0.1"; port: number };
  userId: string | null;
}

export interface RuntimeHandle {
  id: string;
  pid?: number;
  startedAt: Date;
  listenAddr: string;
  listenContract: ListenContract;
}

export type HealthStatus =
  | { ok: true; uptimeMs: number; memBytes?: number; cpuPct?: number }
  | { ok: false; reason: "no-process" | "no-socket" | "http-failed" | "timeout" | "unknown"; detail?: string };

export interface RuntimeAdapter {
  id: string;
  kind: RuntimeKind;
  listenContract: ListenContract;
  idleTimeoutMs: number | null;
  env(ctx: RuntimeContext): Record<string, string>;
  start(ctx: RuntimeContext): Promise<RuntimeHandle>;
  stop(handle: RuntimeHandle): Promise<void>;
  healthCheck(handle: RuntimeHandle): Promise<HealthStatus>;
}
