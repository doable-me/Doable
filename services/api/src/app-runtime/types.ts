/**
 * Server-side app-runtime types.
 */

export type ChangeOp = "insert" | "update" | "delete";

export interface ChangeEvent {
  projectId: string;
  table: string;
  op: ChangeOp;
  rowPk?: string | null;
  payload?: unknown;
  ts: string;
}

export type TriggerType = "manual" | "cron" | "webhook" | "topic" | "cdc" | "call";

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface WorkflowRunRecord {
  id: string;
  projectId: string;
  workflowId: string;
  triggerType: TriggerType;
  triggerPayload: Record<string, unknown>;
  status: RunStatus;
  error?: string | null;
  attempt: number;
  callDepth: number;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface CompiledQuery {
  sqlText: string;
  values: unknown[];
}

export interface QueryDefinition {
  name: string;
  sqlSource: string;
  meta?: {
    description?: string;
    params?: Record<
      string,
      {
        type?: string;
        required?: boolean;
        default?: unknown;
        max?: number;
        min?: number;
      }
    >;
    allow?: Array<"end_user" | "workflow" | "api_key">;
  };
}
