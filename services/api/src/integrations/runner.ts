import { REGISTRY, getIntegration } from "./registry/index.js";
import { credentialVault } from "./credential-vault.js";
import { buildActionContext } from "./context-builder.js";
import type { RunActionParams, RunActionResult, OAuth2TokenData } from "./types.js";
import { sql } from "../db/index.js";

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
      return { props: credentials };
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
 * Algorithm:
 * 1. Look up integration in registry
 * 2. Dynamic import the piece package
 * 3. Get the action from the piece
 * 4. Load credentials from vault
 * 5. Resolve auth value to correct shape
 * 6. Build ActionContext with real auth/props + stubs
 * 7. Call action.run(context)
 * 8. Log usage and return result
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

  try {
    // 1. Load the piece
    const piece = await loadPiece(params.integrationId);

    // 2. Get the action
    const action = typeof piece.getAction === "function"
      ? piece.getAction(params.actionName)
      : piece.actions?.[params.actionName];

    if (!action) {
      return {
        success: false,
        output: null,
        error: `Action '${params.actionName}' not found in ${params.integrationId}. Available: ${
          typeof piece.actions === "object" ? Object.keys(piece.actions).join(", ") : "unknown"
        }`,
      };
    }

    // 3. Load credentials
    const connection = await credentialVault.get(
      params.userId,
      params.integrationId,
      params.workspaceId,
    );

    // For "none" auth type, credentials aren't required
    let auth: unknown = undefined;
    if (def.authType !== "none") {
      if (!connection) {
        return {
          success: false,
          output: null,
          error: `Not connected to ${def.displayName}. Please connect the integration first.`,
        };
      }

      // Check and refresh token if needed
      await ensureTokenFresh(connection.id, connection.auth_type);

      // Re-fetch after potential refresh
      const freshConnection = await credentialVault.get(
        params.userId,
        params.integrationId,
        params.workspaceId,
      );

      auth = resolveAuth(def.authType, freshConnection?.credentials);
    }

    // 4. Build ActionContext
    const context = buildActionContext({
      auth,
      props: params.props,
      userId: params.userId,
      workspaceId: params.workspaceId,
      projectId: params.projectId,
    });

    // 5. Execute the action
    const output = await action.run(context);

    const durationMs = Date.now() - startTime;

    // 6. Log success
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
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err instanceof Error ? err.message : String(err);

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

  return actions;
}

/** Clear the piece cache (useful for testing or hot reload) */
export function clearPieceCache(): void {
  pieceCache.clear();
}
