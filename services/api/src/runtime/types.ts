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
    // host kept as plain string (was literal "127.0.0.1") so the port
    // allocator can return it from a DB-stored row without TS complaining.
    // Bind safety is enforced by convention + the binding code itself —
    // every caller passes "127.0.0.1".
    | { kind: "tcp-port"; host: string; port: number };
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
  | { ok: false; reason: "no-process" | "no-socket" | "no-port" | "bad-addr" | "http-failed" | "timeout" | "unknown"; detail?: string };

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
