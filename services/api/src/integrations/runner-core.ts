import { REGISTRY, getIntegration } from "./registry/index.js";
import { credentialVault } from "./credential-vault.js";
import { buildActionContext } from "./context-builder.js";
import type { RunActionParams, RunActionResult } from "./types.js";
import { getActiveTrace } from "../ai/trace-collector.js";
import { xray } from "./xray.js";
import { fetchCtx, createTracedFetch, type HttpTraceEntry } from "./runner-fetch.js";
import {
  customActions,
  pieceCache,
  loadPiece,
  resolveAuth,
  ensureTokenFresh,
  logUsage,
} from "./runner-helpers.js";

// ─── Main Runner ─────────────────────────────────────────

export async function runAction(params: RunActionParams): Promise<RunActionResult> {
  const startTime = Date.now();
  const def = getIntegration(params.integrationId);

  if (!def) {
    return { success: false, output: null, error: `Unknown integration: ${params.integrationId}` };
  }

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
      const connection = await credentialVault.get(params.userId, params.integrationId, params.workspaceId, params.projectId);
      const auth = connection ? resolveAuth(def.authType, connection.credentials) : undefined;

      console.log(`[Integration] RUN custom ${params.integrationId}/${params.actionName} props=${JSON.stringify(params.props).slice(0, 300)}`);
      const httpTraces: HttpTraceEntry[] = [];

      xr.phase("action_run");
      const output = await fetchCtx.run(
        { tracedFetch: createTracedFetch(httpTraces, params.projectId, xr), xrayHandle: xr, supabaseApiKey: null },
        () => customAction.run(params, auth),
      );

      const durationMs = Date.now() - startTime;
      xr.end("success");
      logUsage({ workspaceId: params.workspaceId, userId: params.userId, integrationId: params.integrationId, actionName: params.actionName, success: true, durationMs });

      return { success: true, output, httpTraces: httpTraces.length > 0 ? httpTraces : undefined };
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
        success: false, output: null,
        error: `Action '${params.actionName}' not found in ${params.integrationId}. Available: ${
          typeof piece.actions === "object" ? Object.keys(piece.actions).join(", ") : "unknown"
        }`,
      };
    }

    // 3. Load credentials
    xr.phase("credential_lookup");
    const connection = await credentialVault.get(params.userId, params.integrationId, params.workspaceId, params.projectId);

    let auth: unknown = undefined;
    if (def.authType !== "none") {
      if (!connection) {
        xr.end("error", "Not connected");
        return { success: false, output: null, error: `Not connected to ${def.displayName}. Please connect the integration first.` };
      }

      xr.phase("token_refresh_check");
      await ensureTokenFresh(connection.id, connection.auth_type);

      xr.phase("credential_refetch");
      const freshConnection = await credentialVault.get(params.userId, params.integrationId, params.workspaceId, params.projectId);
      auth = resolveAuth(def.authType, freshConnection?.credentials);
    }

    // 4. Build ActionContext
    xr.phase("context_build");
    const context = buildActionContext({ auth, props: params.props, userId: params.userId, workspaceId: params.workspaceId, projectId: params.projectId });

    // 5. Execute the action with per-call isolated HTTP tracing
    console.log(`[Integration] RUN ${params.integrationId}/${params.actionName} props=${JSON.stringify(params.props).slice(0, 300)}`);
    let activeTrace: ReturnType<typeof getActiveTrace> = null;
    try { activeTrace = params.projectId ? getActiveTrace(params.projectId) : null; } catch { /* tracing must not break tools */ }
    try { activeTrace?.pushRaw("integration_start", { integrationId: params.integrationId, actionName: params.actionName, props: params.props }); } catch { /* tracing must not break tools */ }

    const httpTraces: HttpTraceEntry[] = [];

    const supabaseApiKey = (params.integrationId === "supabase" && auth && typeof auth === "object" && "apiKey" in auth)
      ? (auth as Record<string, unknown>).apiKey as string
      : null;

    xr.phase("action_run");
    const output = await fetchCtx.run(
      { tracedFetch: createTracedFetch(httpTraces, params.projectId, xr), xrayHandle: xr, supabaseApiKey },
      () => action.run(context),
    );

    const durationMs = Date.now() - startTime;

    xr.end("success");
    logUsage({ workspaceId: params.workspaceId, userId: params.userId, integrationId: params.integrationId, actionName: params.actionName, success: true, durationMs });

    console.log(`[Integration] DONE ${params.integrationId}/${params.actionName} ${durationMs}ms httpCalls=${httpTraces.length} output=${JSON.stringify(output).slice(0, 300)}`);
    try { activeTrace?.pushRaw("integration_end", { integrationId: params.integrationId, actionName: params.actionName, durationMs, httpCallCount: httpTraces.length, output }); } catch { /* tracing must not break tools */ }

    return { success: true, output, httpTraces: httpTraces.length > 0 ? httpTraces : undefined };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Integration] FAILED ${params.integrationId}/${params.actionName} ${durationMs}ms: ${errorMsg}`);
    xr.end("error", errorMsg);
    try {
      const activeTrace = params.projectId ? getActiveTrace(params.projectId) : null;
      activeTrace?.pushRaw("integration_error", { integrationId: params.integrationId, actionName: params.actionName, durationMs, error: errorMsg, stack: err instanceof Error ? err.stack : undefined });
    } catch { /* tracing must not break tools */ }

    logUsage({ workspaceId: params.workspaceId, userId: params.userId, integrationId: params.integrationId, actionName: params.actionName, success: false, durationMs, errorMessage: errorMsg });

    return { success: false, output: null, error: errorMsg };
  }
}

/**
 * Get available actions for an integration.
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

  const pieceActions = typeof piece.actions === "function" ? piece.actions() : (piece.actions ?? {});

  let matchedAny = false;
  for (const actionName of def.actions) {
    const action = typeof piece.getAction === "function"
      ? piece.getAction(actionName)
      : pieceActions[actionName];

    if (!action) continue;
    matchedAny = true;

    if (def.actionOverrides?.[actionName]?.hidden) continue;

    actions.push({
      name: actionName,
      displayName: action.displayName ?? actionName.replace(/_/g, " "),
      description: def.actionOverrides?.[actionName]?.description ?? action.description ?? "",
      props: action.props ?? {},
    });
  }

  const matchRatio = def.actions.length > 0 ? actions.length / def.actions.length : 0;
  if (matchRatio < 0.5 && Object.keys(pieceActions).length > 0) {
    actions.length = 0;
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

  // Append custom actions
  const customs = customActions[integrationId];
  if (customs) {
    for (const [actionName, ca] of Object.entries(customs)) {
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
