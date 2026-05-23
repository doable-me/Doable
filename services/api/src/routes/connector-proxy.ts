/**
 * Connector-bridge proxy.
 *
 * Per devframeworkPRD/10-connector-bridge.md + secureIntegrationsPRD.
 *
 * Endpoints:
 *   POST /__doable/connector-proxy/:integration/:action
 *   GET  /__doable/connector-proxy/available
 *
 * Auth: Bearer <project-scoped JWT> OR Bearer <project API key (dpk_*)>
 *
 * Lets generated apps (Vite SPAs, Next.js) reach connected integrations
 * without ever holding the raw secret. The proxy validates auth, resolves
 * per-user/workspace credentials from the vault, decrypts server-side, and
 * runs the Activepieces action.
 *
 * Multi-user isolation:
 *   - Each JWT carries the userId who owns the preview session.
 *   - credentialVault.get() resolves that user's connection (or falls
 *     back to workspace-level), so concurrent users with different
 *     Slack workspaces / Stripe accounts get their own credentials.
 *   - API keys are scoped to a project; deployed apps use the credential
 *     of the user who connected the integration (workspace-level fallback).
 *
 * Security:
 *   - JWT: 15-min lifetime, signed with PROJECT_JWT_SECRET.
 *   - API Key: SHA-256 hashed in DB; plaintext shown once at creation.
 *   - Allowlist: .doable/connector-allowlist.json is checked when present.
 *     If absent AND the integration has an active vault connection, the
 *     call is allowed (connected = permitted for SDK callers).
 *   - Per-project rate limiting (in-memory sliding window).
 *   - Every call writes a row to connector_audit.
 */

import { Hono, type Context } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";

import { sql } from "../db/index.js";
import { runAction, getIntegrationActions } from "../integrations/runner.js";
import { credentialVault } from "../integrations/credential-vault.js";
import { getIntegration } from "../integrations/registry/index.js";
import { verifyProjectJwt } from "../auth/project-jwt.js";
import { getProjectPath } from "../projects/file-manager.js";
import { connectorQueries } from "@doable/db";
import { getConnectorManager } from "../mcp/connector-manager.js";
import type { McpConnectorConfig } from "../mcp/types.js";
import { PROJECT_JWT_SECRET } from "../lib/secrets.js";

export const connectorProxyRoutes = new Hono({ strict: false });

// ─── Config ─────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_JWT = 600;     // per project per minute (preview)
const RATE_LIMIT_MAX_API_KEY = 1200; // per project per minute (deployed, server key)

// ─── In-memory state ────────────────────────────────────

interface RateBucket {
  windowStart: number;
  count: number;
}
const rateBuckets = new Map<string, RateBucket>();

interface AllowlistCache {
  loadedAt: number;
  entries: Set<string> | null; // null = no file (allow all connected)
}
const allowlistCache = new Map<string, AllowlistCache>();
const ALLOWLIST_TTL_MS = 30_000;

// ─── Auth resolution ────────────────────────────────────

export interface ResolvedAuth {
  projectId: string;
  workspaceId: string;
  userId: string;
  authMode: "jwt" | "api-key";
  rateLimit: number;
  allowedTools: string[] | null; // null = unrestricted
  /** API-key tier when authMode === "api-key" (server keys get higher limits / DDL access). */
  tier?: "client" | "server";
}

/**
 * Resolve the caller's project/workspace/user from the bearer token.
 * Exported verbatim for reuse by the per-app-db data plane
 * (services/api/src/routes/app-data.ts) — the single source of truth for
 * data-surface auth. projectId/userId are server-resolved from the credential,
 * never read from the request body (PRD per-app-db 04 §S3).
 */
export async function resolveAuth(c: Context): Promise<ResolvedAuth | Response> {
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return jsonError(c, 401, "UNAUTHORIZED", "Missing Authorization: Bearer <token>");
  }

  const token = auth.slice(7);

  // ── API Key path (dpk_*) ──
  if (token.startsWith("dpk_")) {
    const keyHash = createHash("sha256").update(token).digest("hex");
    const [row] = await sql`
      SELECT pak.project_id, pak.tier, pak.created_by,
             pak.allowed_tools, pak.allowed_origins,
             p.workspace_id
      FROM project_api_keys pak
      JOIN projects p ON p.id = pak.project_id
      WHERE pak.key_hash = ${keyHash}
        AND pak.revoked_at IS NULL
      LIMIT 1
    `;
    if (!row) {
      return jsonError(c, 401, "UNAUTHORIZED", "Invalid API key");
    }

    // Origin binding: if allowed_origins is set, verify the request comes from an allowed domain.
    // This prevents stolen keys from being used from arbitrary origins (curl, attacker sites).
    const allowedOrigins = Array.isArray(row.allowed_origins) ? row.allowed_origins as string[] : null;
    if (allowedOrigins !== null && allowedOrigins.length > 0) {
      const origin = c.req.header("origin") ?? "";
      const referer = c.req.header("referer") ?? "";
      const requestOrigin = origin || (referer ? new URL(referer).origin : "");

      // If no origin/referer at all (curl, server-to-server), block it for client keys.
      // Server-tier keys skip origin check (they're meant for backend use).
      if (row.tier !== "server") {
        if (!requestOrigin) {
          return jsonError(c, 403, "ORIGIN_REQUIRED",
            "This API key requires browser origin. Use a server-tier key for backend calls.");
        }
        const originHost = requestOrigin.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
        const isAllowed = allowedOrigins.some((allowed: string) => {
          const pattern = allowed.replace(/^\*\./, "");
          return originHost === pattern || originHost.endsWith("." + pattern);
        });
        if (!isAllowed) {
          return jsonError(c, 403, "ORIGIN_NOT_ALLOWED",
            `Request origin "${originHost}" is not in this key's allowed origins.`);
        }
      }
    }

    // Touch last_used_at (fire-and-forget)
    sql`UPDATE project_api_keys SET last_used_at = now() WHERE key_hash = ${keyHash}`.catch(() => {});

    return {
      projectId: row.project_id as string,
      workspaceId: row.workspace_id as string,
      userId: row.created_by as string, // credentials resolved for the key creator
      authMode: "api-key",
      tier: row.tier === "server" ? "server" : "client",
      rateLimit: row.tier === "server" ? RATE_LIMIT_MAX_API_KEY : RATE_LIMIT_MAX_JWT,
      allowedTools: Array.isArray(row.allowed_tools) ? row.allowed_tools as string[] : null,
    };
  }

  // ── JWT path ──
  try {
    const claims = await verifyProjectJwt(token, PROJECT_JWT_SECRET);
    if (claims.kind !== "connector-proxy") {
      return jsonError(c, 401, "UNAUTHORIZED", "Wrong JWT kind");
    }
    return {
      projectId: claims.projectId,
      workspaceId: claims.workspaceId,
      userId: claims.userId ?? "",
      authMode: "jwt",
      rateLimit: RATE_LIMIT_MAX_JWT,
      allowedTools: null, // JWTs are short-lived, no tool restriction needed
    };
  } catch (err) {
    return jsonError(c, 401, "UNAUTHORIZED", "Invalid or expired token");
  }
}

// ─── Discovery endpoint ─────────────────────────────────

connectorProxyRoutes.get(
  "/__doable/connector-proxy/available",
  async (c) => {
    const authResult = await resolveAuth(c);
    if (authResult instanceof Response) return authResult;
    const { workspaceId, projectId, userId } = authResult;

    // Get all active connections for this scope
    const connections = await credentialVault.getEffective(workspaceId, projectId, userId);

    // Dedupe by integration_id (highest-priority first)
    const seen = new Set<string>();
    const integrations: Array<{
      id: string;
      displayName: string;
      actions: Array<{ name: string; displayName: string; description: string }>;
    }> = [];

    for (const conn of connections) {
      if (seen.has(conn.integration_id)) continue;
      seen.add(conn.integration_id);

      const def = getIntegration(conn.integration_id);
      if (!def) continue;

      // Get available actions for this integration
      let actions: Array<{ name: string; displayName: string; description: string }> = [];
      try {
        const actionList = await getIntegrationActions(conn.integration_id);
        actions = actionList.map((a) => ({
          name: a.name,
          displayName: a.displayName ?? a.name,
          description: a.description ?? "",
        }));
      } catch {
        // Some integrations may fail to load — skip actions
      }

      integrations.push({
        id: conn.integration_id,
        displayName: def.displayName ?? conn.integration_id,
        actions,
      });
    }

    return c.json({ integrations });
  },
);

// ─── MCP Available (extends /available) ─────────────────

connectorProxyRoutes.get(
  "/__doable/connector-proxy/mcp/available",
  async (c) => {
    const authResult = await resolveAuth(c);
    if (authResult instanceof Response) return authResult;
    const { workspaceId } = authResult;

    const connectorsDb = connectorQueries(sql);
    const rows = await connectorsDb.listConnectors(workspaceId);
    const activeRows = rows.filter((r) => r.status === "active");

    const tools: Array<{ fullName: string; connectorName: string; toolName: string; description?: string }> = [];

    for (const row of activeRows) {
      const safeName = row.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const cache = row.capabilities_cache as { tools?: { list?: Array<{ name: string; description?: string }> } } | null;
      for (const tool of cache?.tools?.list ?? []) {
        const safeToolName = tool.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        tools.push({
          fullName: `mcp_${safeName}_${safeToolName}`,
          connectorName: row.name,
          toolName: tool.name,
          description: tool.description,
        });
      }
    }

    return c.json({ tools });
  },
);

// ─── MCP Tool Proxy ─────────────────────────────────────
// POST /__doable/connector-proxy/mcp/:toolName
// Handles MCP tool calls via the same auth (JWT/API key) as integrations.
// The toolName is the AI-prefixed name like "mcp_hpca_mcp_list_cases_and_folders".
// Resolves the connector and real tool name internally.

connectorProxyRoutes.post(
  "/__doable/connector-proxy/mcp/:toolName",
  async (c) => {
    const t0 = Date.now();
    const toolName = c.req.param("toolName");

    // 1. Authenticate
    const authResult = await resolveAuth(c);
    if (authResult instanceof Response) return authResult;
    const { projectId, workspaceId, userId, rateLimit, allowedTools } = authResult;

    // 1b. Tool-scoping: if the API key restricts which tools can be called, enforce it
    if (allowedTools !== null && !allowedTools.includes(toolName)) {
      await audit(projectId, "mcp", toolName, userId, "denied", Date.now() - t0);
      return jsonError(c, 403, "TOOL_NOT_ALLOWED",
        `This API key is not authorized to call tool: ${toolName}`);
    }

    // 2. Rate limit (configurable per-project)
    const effectiveLimit = await getEffectiveRateLimit(projectId, rateLimit);
    if (!rateLimitOk(projectId, effectiveLimit)) {
      await audit(projectId, "mcp", toolName, userId, "denied", Date.now() - t0);
      return jsonError(c, 429, "RATE_LIMITED", "Too many requests. Try again shortly.");
    }

    // 3. Parse body
    let body: { props?: Record<string, unknown> } = {};
    try {
      body = (await c.req.json()) as { props?: Record<string, unknown> };
    } catch {
      // Empty body is OK
    }
    const props = body.props ?? {};

    // 4. Resolve AI-prefixed tool name → connectorId + real tool name
    const connectors = connectorQueries(sql);
    const rows = await connectors.listConnectors(workspaceId);
    const activeRows = rows.filter((r) => r.status === "active");

    let resolvedConnector: typeof activeRows[0] | null = null;
    let realToolName: string | null = null;

    for (const row of activeRows) {
      const safeName = row.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const prefix = `mcp_${safeName}_`;
      if (toolName.startsWith(prefix)) {
        const candidate = toolName.slice(prefix.length);
        // Verify this tool exists in the connector's capabilities cache
        const cache = row.capabilities_cache as { tools?: { list?: Array<{ name: string }> } } | null;
        const toolList = cache?.tools?.list ?? [];
        const match = toolList.find((t) => t.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase() === candidate);
        if (match) {
          resolvedConnector = row;
          realToolName = match.name;
          break;
        }
        // If no exact match from cache, try using the candidate directly
        // (cache might be stale or missing)
        resolvedConnector = row;
        realToolName = candidate.replace(/_/g, "_"); // keep as-is, server will validate
        break;
      }
    }

    if (!resolvedConnector || !realToolName) {
      await audit(projectId, "mcp", toolName, userId, "denied", Date.now() - t0);
      return jsonError(c, 404, "MCP_TOOL_NOT_FOUND",
        `Could not resolve MCP tool: ${toolName}. Ensure the connector is active.`);
    }

    // 5. Build connector config and call
    const config: McpConnectorConfig = {
      id: resolvedConnector.id,
      workspaceId: resolvedConnector.workspace_id,
      projectId: resolvedConnector.project_id ?? undefined,
      scope: resolvedConnector.scope as "workspace" | "project" | "user",
      name: resolvedConnector.name,
      description: resolvedConnector.description ?? undefined,
      transportType: resolvedConnector.transport_type as "streamable_http" | "http_sse" | "stdio",
      serverUrl: resolvedConnector.server_url ?? undefined,
      serverCommand: resolvedConnector.server_command ?? undefined,
      serverArgs: resolvedConnector.server_args ?? undefined,
      authType: (resolvedConnector.auth_type ?? "none") as "none" | "api_key" | "oauth2" | "bearer_token",
      status: resolvedConnector.status as "active" | "inactive" | "error" | "connecting",
      createdBy: resolvedConnector.created_by,
      createdAt: new Date(resolvedConnector.created_at),
      updatedAt: new Date(resolvedConnector.updated_at),
    };

    try {
      const manager = getConnectorManager();
      const client = await manager.getClient(config);
      const result = await client.callTool(realToolName, props);

      const durationMs = Date.now() - t0;

      if (result.isError) {
        const text = result.content
          .filter((it) => it.type === "text")
          .map((it) => (it as { type: "text"; text: string }).text)
          .join("\n");
        await audit(projectId, "mcp", toolName, userId, "error", durationMs);
        return c.json({
          success: false,
          data: null,
          error: { code: "MCP_TOOL_ERROR", message: text || "Tool returned an error" },
          meta: { connectorName: resolvedConnector.name, toolName: realToolName, durationMs },
        });
      }

      // Extract result data
      const textContent = result.content
        .filter((it) => it.type === "text")
        .map((it) => (it as { type: "text"; text: string }).text)
        .join("\n");

      let data: unknown;
      try { data = JSON.parse(textContent); } catch { data = textContent; }

      await audit(projectId, "mcp", toolName, userId, "ok", durationMs);
      return c.json({
        success: true,
        data,
        error: undefined,
        meta: { connectorName: resolvedConnector.name, toolName: realToolName, durationMs },
      });
    } catch (err) {
      const durationMs = Date.now() - t0;
      await audit(projectId, "mcp", toolName, userId, "error", durationMs);
      return jsonError(c, 500, "MCP_EXECUTION_ERROR",
        err instanceof Error ? err.message : "Unknown error");
    }
  },
);

// ─── Main proxy endpoint ────────────────────────────────

connectorProxyRoutes.post(
  "/__doable/connector-proxy/:integration/:action",
  async (c) => {
    const t0 = Date.now();
    const integration = c.req.param("integration");
    const action = c.req.param("action");

    // 1. Authenticate (JWT or API key)
    const authResult = await resolveAuth(c);
    if (authResult instanceof Response) return authResult;
    const { projectId, workspaceId, userId, authMode, rateLimit, allowedTools } = authResult;

    // 1b. Tool-scoping for API keys
    const toolId = `${integration}:${action}`;
    if (allowedTools !== null && !allowedTools.includes(toolId)) {
      await audit(projectId, integration, action, userId, "denied", Date.now() - t0);
      return jsonError(c, 403, "TOOL_NOT_ALLOWED",
        `This API key is not authorized to call: ${toolId}`);
    }

    // 2. Rate limit per project (configurable)
    const effectiveLimit = await getEffectiveRateLimit(projectId, rateLimit);
    if (!rateLimitOk(projectId, effectiveLimit)) {
      await audit(projectId, integration, action, userId, "denied", Date.now() - t0);
      return jsonError(c, 429, "RATE_LIMITED", "Too many requests. Try again shortly.");
    }

    // 3. Allowlist check (if file exists) — otherwise allow any connected integration
    const allowed = await loadAllowlist(projectId);
    if (allowed !== null && !allowed.has(`${integration}:${action}`)) {
      // Allowlist exists but doesn't include this action — check if integration is connected
      // (backwards-compat: if allowlist is present, respect it strictly)
      await audit(projectId, integration, action, userId, "denied", Date.now() - t0);
      return jsonError(c, 403, "NOT_IN_ALLOWLIST", `Action ${integration}:${action} not in allowlist`);
    }

    // 4. Verify integration is connected (vault has credentials for this user/workspace)
    const connection = await credentialVault.get(userId, integration, workspaceId, projectId);
    if (!connection) {
      await audit(projectId, integration, action, userId, "denied", Date.now() - t0);
      return jsonError(c, 403, "INTEGRATION_NOT_CONNECTED",
        `${integration} is not connected. Connect it in Settings → Integrations.`);
    }

    // 5. Parse request body
    let body: { props?: Record<string, unknown> } = {};
    try {
      body = (await c.req.json()) as { props?: Record<string, unknown> };
    } catch {
      // Empty body is OK; props defaults to {}.
    }
    const props = body.props ?? {};

    // 6. Execute via the same runAction engine AI tools use.
    //    Each concurrent call resolves its own credentials from the vault
    //    based on the authenticated userId — full user isolation.
    try {
      const result = await runAction({
        integrationId: integration,
        actionName: action,
        props,
        userId,
        workspaceId,
        projectId,
      });

      const durationMs = Date.now() - t0;
      const status = result.success ? "ok" : "error";
      await audit(projectId, integration, action, userId, status, durationMs);

      // Return normalized response
      return c.json({
        success: result.success,
        data: result.success ? result.output : null,
        error: result.success ? undefined : { code: "EXECUTION_FAILED", message: result.error ?? "Action failed" },
        meta: { integrationId: integration, actionName: action, durationMs },
      });
    } catch (err) {
      const durationMs = Date.now() - t0;
      await audit(projectId, integration, action, userId, "error", durationMs);
      return jsonError(c, 500, "EXECUTION_ERROR", err instanceof Error ? err.message : "Unknown error");
    }
  },
);

// ─── CORS preflight ─────────────────────────────────────

connectorProxyRoutes.options("/__doable/connector-proxy/*", (c) => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization, x-doable-project-id",
      "Access-Control-Max-Age": "86400",
    },
  });
});

// ─── API Key Management Helpers (exported for routes) ───

export function generateProjectApiKey(tier: "client" | "server"): { key: string; hash: string; prefix: string } {
  const random = randomBytes(24).toString("base64url"); // 32 chars
  const prefix = tier === "server" ? "dpk_s_" : "dpk_c_";
  const key = `${prefix}${random}`;
  const hash = createHash("sha256").update(key).digest("hex");
  return { key, hash, prefix: key.slice(0, 8) };
}

// ─── Helpers ────────────────────────────────────────────

/**
 * Per-project connector settings cache (from projects.connector_settings JSONB).
 * TTL: 60s to avoid hammering DB on every request.
 */
interface ConnectorSettings {
  rateLimitPerMinute: number | null; // null = use default, 0 = disabled
}
const settingsCache = new Map<string, { settings: ConnectorSettings; loadedAt: number }>();
const SETTINGS_CACHE_TTL_MS = 60_000;

async function getProjectConnectorSettings(projectId: string): Promise<ConnectorSettings> {
  const cached = settingsCache.get(projectId);
  if (cached && Date.now() - cached.loadedAt < SETTINGS_CACHE_TTL_MS) {
    return cached.settings;
  }
  const [row] = await sql<{ connector_settings: Record<string, unknown> }[]>`
    SELECT connector_settings FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  const raw = row?.connector_settings ?? {};
  const settings: ConnectorSettings = {
    rateLimitPerMinute: typeof raw.rateLimitPerMinute === "number" ? raw.rateLimitPerMinute : null,
  };
  settingsCache.set(projectId, { settings, loadedAt: Date.now() });
  return settings;
}

/**
 * Resolve effective rate limit for a project.
 * Priority: project setting > auth-mode default.
 * Setting of 0 disables rate limiting entirely.
 */
export async function getEffectiveRateLimit(projectId: string, authModeDefault: number): Promise<number | null> {
  const settings = await getProjectConnectorSettings(projectId);
  if (settings.rateLimitPerMinute === 0) return null; // disabled
  if (settings.rateLimitPerMinute !== null) return settings.rateLimitPerMinute;
  return authModeDefault;
}

export function rateLimitOk(projectId: string, max: number | null): boolean {
  if (max === null) return true; // rate limiting disabled for this project
  const now = Date.now();
  const bucket = rateBuckets.get(projectId);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(projectId, { windowStart: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

/**
 * Load allowlist. Returns null if the file doesn't exist (meaning:
 * allow all connected integrations). Returns a Set if the file exists
 * (strict mode: only listed pairs are allowed).
 */
async function loadAllowlist(projectId: string): Promise<Set<string> | null> {
  const now = Date.now();
  const cached = allowlistCache.get(projectId);
  if (cached && now - cached.loadedAt < ALLOWLIST_TTL_MS) {
    return cached.entries;
  }

  const file = path.join(getProjectPath(projectId), ".doable", "connector-allowlist.json");
  let entries: Set<string> | null = null;
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as
      | { allow?: Array<{ integration: string; action: string }> }
      | undefined;
    entries = new Set<string>();
    if (parsed?.allow && Array.isArray(parsed.allow)) {
      for (const e of parsed.allow) {
        if (typeof e?.integration === "string" && typeof e?.action === "string") {
          entries.add(`${e.integration}:${e.action}`);
        }
      }
    }
  } catch {
    // Missing file = allow all connected integrations (no allowlist restriction)
    entries = null;
  }

  allowlistCache.set(projectId, { loadedAt: now, entries });
  return entries;
}

async function audit(
  projectId: string,
  integration: string,
  action: string,
  userId: string | undefined,
  status: "ok" | "denied" | "error",
  durationMs: number,
): Promise<void> {
  try {
    await sql`
      INSERT INTO connector_audit (project_id, integration, action, user_id, status, duration_ms)
      VALUES (${projectId}, ${integration}, ${action}, ${userId ?? null}, ${status}, ${durationMs})
    `;
  } catch (err) {
    // Audit failure must NOT break the request — log and continue.
    console.error("[connector-proxy] audit insert failed:", err);
  }
}

function jsonError(
  c: Context,
  status: number,
  code: string,
  detail?: string,
) {
  return c.json(
    { success: false, error: { code, message: detail ?? code } },
    status as never,
  );
}
