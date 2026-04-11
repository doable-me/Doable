import { AsyncLocalStorage } from "node:async_hooks";
import { REGISTRY, getIntegration } from "./registry/index.js";
import { credentialVault } from "./credential-vault.js";
import { buildActionContext } from "./context-builder.js";
import type { RunActionParams, RunActionResult, OAuth2TokenData } from "./types.js";
import { sql } from "../db/index.js";
import { getActiveTrace, categorizeError } from "../ai/trace-collector.js";
import { xray, type XrayCallHandle } from "./xray.js";

// ─── Per-call fetch isolation via AsyncLocalStorage ─────
// NEVER mutate globalThis.fetch. Instead, every runAction call runs inside
// an AsyncLocalStorage context that carries its own traced fetch + xray handle.
// The patched global fetch delegates to the context-local one.

export interface FetchContext {
  tracedFetch: typeof globalThis.fetch;
  xrayHandle: XrayCallHandle | null;
  supabaseApiKey: string | null;
}

export const fetchCtx = new AsyncLocalStorage<FetchContext>();

// One-time global fetch patch: delegates to context-local fetch if available,
// otherwise falls through to the original. Safe for concurrency.
const _originalFetch = globalThis.fetch;

globalThis.fetch = function patchedFetch(input: any, init?: RequestInit): Promise<Response> {
  const ctx = fetchCtx.getStore();
  if (ctx) {
    // Inject Supabase apikey header if needed
    if (ctx.supabaseApiKey) {
      const headers = new Headers(init?.headers);
      if (!headers.has("apikey")) {
        headers.set("apikey", ctx.supabaseApiKey);
      }
      return ctx.tracedFetch(input, { ...init, headers });
    }
    return ctx.tracedFetch(input, init);
  }
  return _originalFetch(input, init);
} as typeof globalThis.fetch;

// ─── HTTP Trace Types ───────────────────────────────────

export interface HttpTraceEntry {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  statusCode: number | null;
  responseHeaders: Record<string, string>;
  durationMs: number;
  responseBody: string | null;
  error?: string;
}

/** Headers whose values should be redacted in traces */
const REDACTED_HEADERS = new Set([
  "authorization", "x-api-key", "cookie", "set-cookie",
  "x-access-token", "x-refresh-token", "proxy-authorization",
]);

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACTED_HEADERS.has(k.toLowerCase()) ? "[REDACTED]" : v;
  }
  return out;
}

function headersToRecord(init?: any): Record<string, string> {
  if (!init) return {};
  if (typeof init === "object" && typeof init.forEach === "function") {
    const r: Record<string, string> = {};
    init.forEach((v: string, k: string) => { r[k] = v; });
    return r;
  }
  if (Array.isArray(init)) return Object.fromEntries(init);
  return { ...init } as Record<string, string>;
}

/**
 * Create a fetch wrapper that records HTTP calls into the provided array
 * AND feeds the xray handle with per-request phase data.
 *
 * IMPORTANT: This captures `_originalFetch` (the real fetch) at module load,
 * so it never calls another traced wrapper — no nesting, no race.
 */
export function createTracedFetch(
  traces: HttpTraceEntry[],
  projectId?: string,
  xrayHandle?: XrayCallHandle | null,
): typeof globalThis.fetch {
  return async function tracedFetch(input: any, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;

    // Skip tracing for internal broadcast/WS calls to avoid infinite recursion:
    // traced fetch → pushRaw → broadcast → fetch → traced fetch → pushRaw → ...
    if (url.includes('/internal/broadcast') || url.includes('/internal/collab') || url.includes('/internal/yjs')) {
      return _originalFetch(input, init);
    }

    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const reqHeaders = redactHeaders(headersToRecord(init?.headers));
    const start = Date.now();

    // Capture request body
    let requestBody: string | null = null;
    try {
      if (init?.body) {
        if (typeof init.body === "string") {
          requestBody = init.body.length > 16384 ? init.body.slice(0, 16384) + `... [${init.body.length - 16384} chars truncated]` : init.body;
        } else if (init.body instanceof URLSearchParams) {
          requestBody = init.body.toString();
        } else {
          requestBody = "[non-string body]";
        }
      }
    } catch { /* body capture failed — ok */ }

    // X-Ray: track this HTTP call
    const xrayHttp = xrayHandle?.httpStart(method, url, requestBody) ?? null;

    try {
      const res = await _originalFetch(input, init);
      const durationMs = Date.now() - start;

      // Capture response headers (redacted)
      const resHeaders = redactHeaders(headersToRecord(res.headers));

      // Clone to read body without consuming the original
      let bodyText: string | null = null;
      try {
        const clone = res.clone();
        const raw = await clone.text();
        bodyText = raw.length > 16384 ? raw.slice(0, 16384) + `... [${raw.length - 16384} chars truncated]` : raw;
      } catch { /* body read failed — ok */ }

      const entry: HttpTraceEntry = { url, method, requestHeaders: reqHeaders, requestBody, statusCode: res.status, responseHeaders: resHeaders, durationMs, responseBody: bodyText };
      traces.push(entry);

      // Full raw dump to backend console
      console.log(`[Integration:HTTP] ── REQUEST ──\n  ${method} ${url}\n  Headers: ${JSON.stringify(reqHeaders)}\n  Body: ${requestBody ?? "(none)"}`);
      console.log(`[Integration:HTTP] ── RESPONSE ${res.status} (${durationMs}ms) ──\n  Headers: ${JSON.stringify(resHeaders)}\n  Body: ${bodyText ?? "(empty)"}`);

      // Push to live trace (DB + WebSocket broadcast)
      const trace = projectId ? getActiveTrace(projectId) : null;
      trace?.pushRaw("integration_http", entry);

      // X-Ray: finish HTTP call tracking
      if (xrayHttp) xrayHandle?.httpEnd(xrayHttp, res.status, durationMs, bodyText);

      return res;
    } catch (err) {
      const durationMs = Date.now() - start;
      const errMsg = err instanceof Error ? err.message : String(err);
      const entry: HttpTraceEntry = {
        url, method, requestHeaders: reqHeaders, requestBody, statusCode: null,
        responseHeaders: {}, durationMs, responseBody: null,
        error: errMsg,
      };
      traces.push(entry);
      console.error(`[Integration:HTTP] ── REQUEST ──\n  ${method} ${url}\n  Headers: ${JSON.stringify(reqHeaders)}\n  Body: ${requestBody ?? "(none)"}`);
      console.error(`[Integration:HTTP] ── FAILED (${durationMs}ms) ──\n  Error: ${errMsg}\n  Stack: ${err instanceof Error ? err.stack : "n/a"}`);

      // Push failure to live trace
      const trace = projectId ? getActiveTrace(projectId) : null;
      trace?.pushRaw("integration_http_error", { ...entry, category: categorizeError(errMsg) });

      // X-Ray: finish HTTP call tracking with error
      if (xrayHttp) xrayHandle?.httpEnd(xrayHttp, null, durationMs, null, errMsg);

      throw err;
    }
  };
}

// ─── Custom Actions ──────────────────────────────────────
// Actions implemented directly (not via npm pieces) for capabilities
// that no Activepieces piece provides (e.g. raw SQL execution).

interface CustomAction {
  displayName: string;
  description: string;
  props: Record<string, unknown>;
  run: (params: RunActionParams, auth: unknown) => Promise<unknown>;
}

const customActions: Record<string, Record<string, CustomAction>> = {
  supabase: {
    execute_sql: {
      displayName: "Execute SQL",
      description:
        "Execute raw SQL against the Supabase database (CREATE TABLE, ALTER, INSERT, SELECT, etc.). Uses the Supabase Management API via OAuth when available, or falls back to the PostgREST rpc endpoint.",
      props: {
        sql: {
          type: "STRING",
          displayName: "SQL Query",
          description: "The SQL statement to execute",
          required: true,
        },
      },
      async run(params, auth) {
        const sqlQuery = params.props.sql as string;
        if (!sqlQuery?.trim()) throw new Error("sql parameter is required");

        const creds = auth as Record<string, unknown> | undefined;
        const projectUrl = creds?.url as string | undefined;

        // Strategy 1: Use Management API if we have an OAuth token
        const mgmtConn = await credentialVault.get(
          params.userId,
          "supabase-mgmt",
          params.workspaceId,
        );
        const mgmtToken =
          (mgmtConn?.credentials as Record<string, unknown>)?.access_token as string | undefined ??
          (mgmtConn?.credentials as Record<string, unknown>)?.accessToken as string | undefined;

        if (mgmtToken && projectUrl) {
          // Extract project ref from URL: https://{ref}.supabase.co
          const refMatch = projectUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
          if (!refMatch) throw new Error(`Cannot extract project ref from URL: ${projectUrl}`);
          const projectRef = refMatch[1];

          const res = await fetch(
            `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${mgmtToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query: sqlQuery }),
            },
          );

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            throw new Error(`Supabase SQL execution failed (${res.status}): ${errText.slice(0, 500)}`);
          }

          return await res.json();
        }

        // Strategy 2: No OAuth token — try the service role key with PostgREST rpc
        // This only works if the user has created an `exec_sql` function in their DB.
        // If not, give a clear error explaining the options.
        const apiKey = creds?.apiKey as string | undefined;
        if (!projectUrl || !apiKey) {
          throw new Error(
            "Supabase credentials missing. Please connect your Supabase account first.",
          );
        }

        // Try calling an `exec_sql` rpc function (user may have created one)
        const rpcRes = await fetch(`${projectUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            apikey: apiKey,
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({ query: sqlQuery }),
        });

        if (rpcRes.ok) {
          return await rpcRes.json();
        }

        // rpc function doesn't exist — tell the user to connect via OAuth
        throw new Error(
          "Raw SQL execution requires Supabase OAuth (Sign in with Supabase) so we can use the Management API. " +
          "Alternatively, create a Postgres function named `exec_sql(query text)` in your Supabase project to enable SQL via the service role key. " +
          `PostgREST rpc/exec_sql returned: ${rpcRes.status} ${(await rpcRes.text().catch(() => "")).slice(0, 300)}`,
        );
      },
    },
  },
};

// ─── Piece Cache ─────────────────────────────────────────

/** Cache loaded pieces to avoid repeated dynamic imports */
const pieceCache = new Map<string, any>();

/**
 * Load a piece package by integration ID.
 * Pieces are cached in memory after first load.
 */
async function loadPiece(integrationId: string): Promise<any> {
  if (pieceCache.has(integrationId)) return pieceCache.get(integrationId)!;

  const def = getIntegration(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  try {
    const mod = await import(def.piecePackage);
    // Activepieces pieces export multiple things (auth helpers, utils, the piece itself).
    // The piece is the export that has displayName + actions/getAction.
    // Try: default export, then find by checking for displayName property.
    let piece = mod.default;
    if (!piece?.displayName) {
      for (const key of Object.keys(mod)) {
        const val = mod[key];
        if (val && typeof val === "object" && val.displayName && (typeof val.actions === "function" || typeof val.getAction === "function")) {
          piece = val;
          break;
        }
      }
    }

    if (!piece) {
      throw new Error(`No piece export found in ${def.piecePackage}`);
    }

    pieceCache.set(integrationId, piece);
    return piece;
  } catch (err) {
    throw new Error(
      `Failed to load piece ${def.piecePackage}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─── Auth Resolution ─────────────────────────────────────

/**
 * Resolve credentials to the shape expected by the piece action.
 * Different auth types produce different runtime values:
 * - oauth2: { access_token, ...data }
 * - secret_text: string (the API key)
 * - custom_auth: { props: { field1, field2, ... } } or the raw object
 * - basic_auth: { username, password }
 * - none: undefined
 */
function resolveAuth(authType: string, credentials: unknown): unknown {
  switch (authType) {
    case "oauth2": {
      const creds = credentials as OAuth2TokenData;
      return {
        access_token: creds.access_token,
        ...(creds.data ?? {}),
      };
    }
    case "secret_text":
      // SecretText auth is just the key string
      return typeof credentials === "string"
        ? credentials
        : (credentials as any)?.secret_text ?? credentials;
    case "custom_auth":
      // Activepieces pieces use BOTH patterns for custom auth:
      //   - validate(): `const { url, apiKey } = auth` (destructures directly)
      //   - baseUrl/authMapping(): `auth.props.url`, `auth.props.apiKey`
      // Spread credentials at top level AND nest under props so both work.
      return { ...(credentials as Record<string, unknown>), props: credentials };
    case "basic_auth":
      return credentials;
    case "none":
      return undefined;
    default:
      return credentials;
  }
}

// ─── Token Refresh Check ─────────────────────────────────

/**
 * Check if an OAuth2 token needs refresh and refresh it if needed.
 * Uses a 15-minute buffer before expiry.
 */
async function ensureTokenFresh(connectionId: string, authType: string): Promise<void> {
  if (authType !== "oauth2") return;

  const creds = await credentialVault.decrypt(connectionId) as OAuth2TokenData | null;
  if (!creds || !creds.refresh_token) return;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (creds.claimed_at ?? 0) + (creds.expires_in ?? 3600);

  // Refresh if within 15 minutes of expiry
  if (now + 900 < expiresAt) return;

  // Token needs refresh — this will be handled by the oauth2 module
  // For now, we just flag it. The oauth2.ts module handles actual refresh.
  console.log(`[IntegrationRunner] Token for connection ${connectionId} needs refresh`);
}

// ─── Usage Logging ───────────────────────────────────────

async function logUsage(params: {
  workspaceId: string;
  userId: string;
  integrationId: string;
  actionName: string;
  success: boolean;
  durationMs: number;
  errorMessage?: string;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO integration_usage_log (
        workspace_id, user_id, integration_id, action_name,
        success, duration_ms, error_message
      ) VALUES (
        ${params.workspaceId}, ${params.userId}, ${params.integrationId},
        ${params.actionName}, ${params.success}, ${params.durationMs},
        ${params.errorMessage ?? null}
      )
    `;
  } catch (err) {
    // Don't let logging failures break action execution
    console.warn("[IntegrationRunner] Usage logging failed:", err);
  }
}

// ─── Main Runner ─────────────────────────────────────────

/**
 * Run an integration action.
 *
 * Every step is phase-instrumented via X-Ray so you can see EXACTLY
 * which sub-step (credential lookup, token refresh, piece load,
 * action execution, individual HTTP calls) is taking how long.
 *
 * HTTP calls are isolated per-call via AsyncLocalStorage — no global
 * mutation, safe for concurrent calls.
 */
export async function runAction(params: RunActionParams): Promise<RunActionResult> {
  const startTime = Date.now();
  const def = getIntegration(params.integrationId);

  if (!def) {
    return {
      success: false,
      output: null,
      error: `Unknown integration: ${params.integrationId}`,
    };
  }

  // Start X-Ray tracking
  const xr = xray.start({
    kind: "integration",
    integrationId: params.integrationId,
    actionName: params.actionName,
    projectId: params.projectId,
    userId: params.userId,
    args: params.props,
  });

  try {
    // 0. Check for custom (non-piece) action first
    const customAction = customActions[params.integrationId]?.[params.actionName];
    if (customAction) {
      xr.phase("credential_lookup");
      const connection = await credentialVault.get(
        params.userId,
        params.integrationId,
        params.workspaceId,
      );
      const auth = connection ? resolveAuth(def.authType, connection.credentials) : undefined;

      console.log(`[Integration] RUN custom ${params.integrationId}/${params.actionName} props=${JSON.stringify(params.props).slice(0, 300)}`);
      const httpTraces: HttpTraceEntry[] = [];

      xr.phase("action_run");
      // Run inside AsyncLocalStorage context — no global fetch mutation
      const output = await fetchCtx.run(
        { tracedFetch: createTracedFetch(httpTraces, params.projectId, xr), xrayHandle: xr, supabaseApiKey: null },
        () => customAction.run(params, auth),
      );

      const durationMs = Date.now() - startTime;
      xr.end("success");
      logUsage({
        workspaceId: params.workspaceId,
        userId: params.userId,
        integrationId: params.integrationId,
        actionName: params.actionName,
        success: true,
        durationMs,
      });

      return {
        success: true,
        output,
        httpTraces: httpTraces.length > 0 ? httpTraces : undefined,
      };
    }

    // 1. Load the piece
    xr.phase("piece_load");
    const piece = await loadPiece(params.integrationId);

    // 2. Get the action
    xr.phase("action_lookup");
    const action = typeof piece.getAction === "function"
      ? piece.getAction(params.actionName)
      : piece.actions?.[params.actionName];

    if (!action) {
      xr.end("error", `Action '${params.actionName}' not found`);
      return {
        success: false,
        output: null,
        error: `Action '${params.actionName}' not found in ${params.integrationId}. Available: ${
          typeof piece.actions === "object" ? Object.keys(piece.actions).join(", ") : "unknown"
        }`,
      };
    }

    // 3. Load credentials
    xr.phase("credential_lookup");
    const connection = await credentialVault.get(
      params.userId,
      params.integrationId,
      params.workspaceId,
    );

    // For "none" auth type, credentials aren't required
    let auth: unknown = undefined;
    if (def.authType !== "none") {
      if (!connection) {
        xr.end("error", "Not connected");
        return {
          success: false,
          output: null,
          error: `Not connected to ${def.displayName}. Please connect the integration first.`,
        };
      }

      // Check and refresh token if needed
      xr.phase("token_refresh_check");
      await ensureTokenFresh(connection.id, connection.auth_type);

      // Re-fetch after potential refresh
      xr.phase("credential_refetch");
      const freshConnection = await credentialVault.get(
        params.userId,
        params.integrationId,
        params.workspaceId,
      );

      auth = resolveAuth(def.authType, freshConnection?.credentials);
    }

    // 4. Build ActionContext
    xr.phase("context_build");
    const context = buildActionContext({
      auth,
      props: params.props,
      userId: params.userId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
    });

    // 5. Execute the action with per-call isolated HTTP tracing
    console.log(`[Integration] RUN ${params.integrationId}/${params.actionName} props=${JSON.stringify(params.props).slice(0, 300)}`);
    let activeTrace: ReturnType<typeof getActiveTrace> = null;
    try { activeTrace = params.projectId ? getActiveTrace(params.projectId) : null; } catch { /* tracing must not break tools */ }
    try { activeTrace?.pushRaw("integration_start", {
      integrationId: params.integrationId,
      actionName: params.actionName,
      props: params.props,
    }); } catch { /* tracing must not break tools */ }

    const httpTraces: HttpTraceEntry[] = [];

    // Supabase REST API requires an `apikey` header alongside Authorization.
    const supabaseApiKey = (params.integrationId === "supabase" && auth && typeof auth === "object" && "apiKey" in auth)
      ? (auth as Record<string, unknown>).apiKey as string
      : null;

    xr.phase("action_run");
    // Run inside AsyncLocalStorage context — traced fetch + xray are per-call isolated
    const output = await fetchCtx.run(
      {
        tracedFetch: createTracedFetch(httpTraces, params.projectId, xr),
        xrayHandle: xr,
        supabaseApiKey,
      },
      () => action.run(context),
    );

    const durationMs = Date.now() - startTime;

    // 6. Log success
    xr.end("success");
    logUsage({
      workspaceId: params.workspaceId,
      userId: params.userId,
      integrationId: params.integrationId,
      actionName: params.actionName,
      success: true,
      durationMs,
    });

    console.log(`[Integration] DONE ${params.integrationId}/${params.actionName} ${durationMs}ms httpCalls=${httpTraces.length} output=${JSON.stringify(output).slice(0, 300)}`);
    try { activeTrace?.pushRaw("integration_end", {
      integrationId: params.integrationId,
      actionName: params.actionName,
      durationMs,
      httpCallCount: httpTraces.length,
      output,
    }); } catch { /* tracing must not break tools */ }

    return {
      success: true,
      output,
      httpTraces: httpTraces.length > 0 ? httpTraces : undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Integration] FAILED ${params.integrationId}/${params.actionName} ${durationMs}ms: ${errorMsg}`);
    xr.end("error", errorMsg);
    try {
      const activeTrace = params.projectId ? getActiveTrace(params.projectId) : null;
      activeTrace?.pushRaw("integration_error", {
        integrationId: params.integrationId,
        actionName: params.actionName,
        durationMs,
        error: errorMsg,
        stack: err instanceof Error ? err.stack : undefined,
      });
    } catch { /* tracing must not break tools */ }

    // Log failure
    logUsage({
      workspaceId: params.workspaceId,
      userId: params.userId,
      integrationId: params.integrationId,
      actionName: params.actionName,
      success: false,
      durationMs,
      errorMessage: errorMsg,
    });

    return {
      success: false,
      output: null,
      error: errorMsg,
    };
  }
}

/**
 * Get available actions for an integration.
 * Returns metadata about each action including name, description, and required props.
 */
export async function getIntegrationActions(integrationId: string): Promise<Array<{
  name: string;
  displayName: string;
  description: string;
  props: Record<string, unknown>;
}>> {
  const piece = await loadPiece(integrationId);
  const def = getIntegration(integrationId);
  if (!def) return [];

  const actions: Array<{ name: string; displayName: string; description: string; props: Record<string, unknown> }> = [];

  // Get all actual actions from the piece
  const pieceActions = typeof piece.actions === "function" ? piece.actions() : (piece.actions ?? {});

  // First try registry-listed actions
  let matchedAny = false;
  for (const actionName of def.actions) {
    const action = typeof piece.getAction === "function"
      ? piece.getAction(actionName)
      : pieceActions[actionName];

    if (!action) continue;
    matchedAny = true;

    // Check if hidden
    if (def.actionOverrides?.[actionName]?.hidden) continue;

    actions.push({
      name: actionName,
      displayName: action.displayName ?? actionName.replace(/_/g, " "),
      description: def.actionOverrides?.[actionName]?.description ?? action.description ?? "",
      props: action.props ?? {},
    });
  }

  // If fewer than half the registry actions matched, fall back to ALL piece actions
  // This handles cases where the registry has guessed/wrong action names
  const matchRatio = def.actions.length > 0 ? actions.length / def.actions.length : 0;
  if (matchRatio < 0.5 && Object.keys(pieceActions).length > 0) {
    actions.length = 0; // Clear partial matches
    for (const [actionName, action] of Object.entries(pieceActions)) {
      const a = action as any;
      actions.push({
        name: actionName,
        displayName: a.displayName ?? actionName.replace(/[_-]/g, " "),
        description: a.description ?? "",
        props: a.props ?? {},
      });
    }
  }

  // Append custom actions (not from npm piece)
  const customs = customActions[integrationId];
  if (customs) {
    for (const [actionName, ca] of Object.entries(customs)) {
      // Avoid duplicates if somehow listed in both
      if (!actions.some((a) => a.name === actionName)) {
        actions.push({
          name: actionName,
          displayName: ca.displayName,
          description: ca.description,
          props: ca.props,
        });
      }
    }
  }

  return actions;
}

/** Clear the piece cache (useful for testing or hot reload) */
export function clearPieceCache(): void {
  pieceCache.clear();
}
