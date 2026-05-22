import { getIntegration } from "./registry/index.js";
import { credentialVault } from "./credential-vault.js";
import type { RunActionParams, OAuth2TokenData } from "./types.js";
import { sql } from "../db/index.js";

// ─── Custom Actions ──────────────────────────────────────

interface CustomAction {
  displayName: string;
  description: string;
  props: Record<string, unknown>;
  run: (params: RunActionParams, auth: unknown) => Promise<unknown>;
}

export const customActions: Record<string, Record<string, CustomAction>> = {
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
        const apiKey = creds?.apiKey as string | undefined;
        if (!projectUrl || !apiKey) {
          throw new Error(
            "Supabase credentials missing. Please connect your Supabase account first.",
          );
        }

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
export const pieceCache = new Map<string, any>();

/**
 * Load a piece package by integration ID.
 */
export async function loadPiece(integrationId: string): Promise<any> {
  if (pieceCache.has(integrationId)) return pieceCache.get(integrationId)!;

  const def = getIntegration(integrationId);
  if (!def) throw new Error(`Unknown integration: ${integrationId}`);

  try {
    const mod = await import(def.piecePackage);
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

export function resolveAuth(authType: string, credentials: unknown): unknown {
  switch (authType) {
    case "oauth2": {
      const creds = credentials as OAuth2TokenData;
      return { access_token: creds.access_token, ...(creds.data ?? {}) };
    }
    case "secret_text": {
      // Activepieces pieces always access auth.secret_text, so we must
      // return { secret_text: "the_value" } regardless of how the
      // credential was stored (apiKey, token, auth, or raw string).
      let rawValue: string | undefined;
      if (typeof credentials === "string") {
        rawValue = credentials;
      } else {
        rawValue =
          (credentials as any)?.secret_text ??
          (credentials as any)?.apiKey ??
          (credentials as any)?.token ??
          (credentials as any)?.auth;
      }
      if (rawValue !== undefined) {
        return { secret_text: rawValue };
      }
      return credentials;
    }
    case "custom_auth":
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

export async function ensureTokenFresh(connectionId: string, authType: string): Promise<void> {
  if (authType !== "oauth2") return;

  const creds = await credentialVault.decrypt(connectionId) as OAuth2TokenData | null;
  if (!creds || !creds.refresh_token) return;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (creds.claimed_at ?? 0) + (creds.expires_in ?? 3600);

  if (now + 900 < expiresAt) return;

  console.log(`[IntegrationRunner] Token for connection ${connectionId} needs refresh`);
}

// ─── Usage Logging ───────────────────────────────────────

export async function logUsage(params: {
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
    console.warn("[IntegrationRunner] Usage logging failed:", err);
  }
}
