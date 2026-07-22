/**
 * Shared types for @doable/runtime (client + WorkflowContext JSDoc).
 */

export interface RuntimeResult<T = Record<string, unknown>> {
  ok: boolean;
  rows: T[];
  rowCount: number;
  fields?: Array<{ name: string; type: string }>;
  truncated?: boolean;
  elapsed_ms?: number;
  error?: { code: string; message: string };
}

export interface QueryMetaParam {
  type?: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  default?: unknown;
  max?: number;
  min?: number;
}

export interface QueryMeta {
  description?: string;
  params?: Record<string, QueryMetaParam>;
  allow?: Array<"end_user" | "workflow" | "api_key">;
}

export interface WorkflowTrigger {
  type: "manual" | "cron" | "webhook" | "topic" | "cdc" | "call";
  payload?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin?: boolean;
  disabled?: boolean;
}

export interface RoleRecord {
  id: string;
  name: string;
  permissions: string[];
}

/** Server-injected context available inside `.workflow.js` `run(ctx)`. */
export interface WorkflowContext {
  projectId: string;
  runId: string;
  trigger: WorkflowTrigger;

  queries: {
    run: <T = Record<string, unknown>>(
      name: string,
      params?: Record<string, unknown>,
    ) => Promise<RuntimeResult<T>>;
  };

  db: {
    query: <T = Record<string, unknown>>(
      sql: string,
      params?: unknown[],
    ) => Promise<RuntimeResult<T>>;
    exec: (sql: string) => Promise<RuntimeResult>;
  };

  api: {
    list: <T = Record<string, unknown>>(
      table: string,
      opts?: { limit?: number; offset?: number; where?: Record<string, unknown> },
    ) => Promise<RuntimeResult<T>>;
    get: <T = Record<string, unknown>>(table: string, id: string) => Promise<RuntimeResult<T>>;
    create: <T = Record<string, unknown>>(
      table: string,
      data: Record<string, unknown>,
    ) => Promise<RuntimeResult<T>>;
    update: <T = Record<string, unknown>>(
      table: string,
      id: string,
      data: Record<string, unknown>,
    ) => Promise<RuntimeResult<T>>;
    delete: (table: string, id: string) => Promise<RuntimeResult>;
  };

  http: {
    fetch: (url: string, init?: RequestInit) => Promise<Response>;
  };

  files: {
    read: (relPath: string) => Promise<string>;
    write: (relPath: string, content: string) => Promise<void>;
    list: (relPath?: string) => Promise<string[]>;
    delete: (relPath: string) => Promise<void>;
  };

  log: {
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
  };

  topics: {
    publish: (name: string, payload: unknown) => Promise<void>;
    subscribe: (name: string, handler: (ev: unknown) => void) => () => void;
  };

  secrets: {
    get: (name: string) => Promise<string | null>;
  };

  integrations: {
    invoke: (
      integrationId: string,
      action: string,
      input?: Record<string, unknown>,
    ) => Promise<unknown>;
  };

  messages: {
    email: (opts: {
      to: string | string[];
      subject: string;
      body?: string;
      html?: string;
      from?: string;
      provider?: "sendgrid" | "resend" | "gmail";
    }) => Promise<unknown>;
    sms: (opts: { to: string; body: string }) => Promise<unknown>;
    whatsapp: (opts: {
      to: string;
      body?: string;
      template?: string;
      mediaUrl?: string;
    }) => Promise<unknown>;
    telegram: (opts: { chatId: string; text: string }) => Promise<unknown>;
  };

  schedules: {
    create: (spec: {
      id: string;
      cron: string;
      timezone?: string;
      workflow: string;
      enabled?: boolean;
    }) => Promise<void>;
    update: (
      id: string,
      patch: Partial<{ cron: string; timezone: string; workflow: string; enabled: boolean }>,
    ) => Promise<void>;
    list: () => Promise<Array<Record<string, unknown>>>;
    delete: (id: string) => Promise<void>;
  };

  users: {
    list: (opts?: { limit?: number; offset?: number }) => Promise<AuthUser[]>;
    get: (id: string) => Promise<AuthUser | null>;
    update: (
      id: string,
      patch: Partial<{ name: string; email: string }>,
    ) => Promise<AuthUser | null>;
    setAdmin: (id: string, isAdmin: boolean) => Promise<void>;
    disable: (id: string, disabled?: boolean) => Promise<void>;
  };

  rbac: {
    listRoles: () => Promise<RoleRecord[]>;
    createRole: (name: string, permissions?: string[]) => Promise<RoleRecord>;
    assign: (userId: string, roleName: string) => Promise<void>;
    revoke: (userId: string, roleName: string) => Promise<void>;
    hasPermission: (userId: string, permission: string) => Promise<boolean>;
  };

  callWorkflow: (
    workflowId: string,
    payload?: Record<string, unknown>,
  ) => Promise<{ runId: string }>;
}
