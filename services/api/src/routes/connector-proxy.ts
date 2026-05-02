/**
 * Connector-bridge proxy.
 *
 * Per devframeworkPRD/10-connector-bridge.md.
 *
 * Endpoint:
 *   POST /__doable/connector-proxy/:integration/:action
 *   Authorization: Bearer <project-scoped JWT>
 *   Content-Type: application/json
 *   { "props": { ...action params... } }
 *
 * Lets static-kind generated apps (Vite SPAs, Astro static) reach
 * connected integrations without ever holding the raw secret. The proxy
 * resolves a project-scoped JWT, checks the project's allowlist, decrypts
 * vault credentials server-side, and runs the same Activepieces action
 * the AI tool bridge already uses.
 *
 * Threat-model summary:
 *   - JWT has 15-min lifetime, signed with the per-project secret.
 *   - .doable/connector-allowlist.json is deny-default; a generated app
 *     can only call (integration, action) pairs the allowlist explicitly
 *     opts in. AI populates the allowlist as it generates code.
 *   - Per-project rate limiting (in-memory, Map<projectId, count+windowStart>).
 *   - Every call writes a row to connector_audit (status: ok/denied/error).
 */

import { Hono, type Context } from "hono";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { sql } from "../db/index.js";
import { runAction } from "../integrations/runner.js";
import { verifyProjectJwt } from "../auth/project-jwt.js";
import { getProjectPath } from "../projects/file-manager.js";

export const connectorProxyRoutes = new Hono();

// ─── Config ─────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 600; // per project per minute

const PROJECT_JWT_SECRET =
  process.env.PROJECT_JWT_SECRET ??
  process.env.JWT_SECRET ??
  "DEVELOPMENT_PROJECT_JWT_SECRET_DO_NOT_USE_IN_PROD";

// ─── In-memory state ────────────────────────────────────

interface RateBucket {
  windowStart: number;
  count: number;
}
const rateBuckets = new Map<string, RateBucket>();

interface AllowlistCache {
  loadedAt: number;
  entries: Set<string>; // "{integration}:{action}"
}
const allowlistCache = new Map<string, AllowlistCache>();
const ALLOWLIST_TTL_MS = 30_000;

// ─── Endpoint ───────────────────────────────────────────

connectorProxyRoutes.post(
  "/__doable/connector-proxy/:integration/:action",
  async (c) => {
    const t0 = Date.now();
    const integration = c.req.param("integration");
    const action = c.req.param("action");

    // 1. Verify JWT.
    const auth = c.req.header("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return jsonError(c, 401, "missing-bearer");
    }
    let claims;
    try {
      claims = await verifyProjectJwt(auth.slice(7), PROJECT_JWT_SECRET);
    } catch (err) {
      return jsonError(c, 401, "jwt-invalid", String(err));
    }
    if (claims.kind !== "connector-proxy") {
      return jsonError(c, 401, "wrong-jwt-kind");
    }

    const { projectId, workspaceId, userId } = claims;

    // 2. Rate limit per project.
    if (!rateLimitOk(projectId)) {
      await audit(projectId, integration, action, userId, "denied", Date.now() - t0);
      return jsonError(c, 429, "rate-limited");
    }

    // 3. Allowlist check.
    const allowed = await loadAllowlist(projectId);
    if (!allowed.has(`${integration}:${action}`)) {
      await audit(projectId, integration, action, userId, "denied", Date.now() - t0);
      return jsonError(c, 403, "not-in-allowlist", `add ${integration}:${action} to .doable/connector-allowlist.json`);
    }

    // 4. Run the action through the same path the AI tool bridge uses.
    let body: { props?: Record<string, unknown> } = {};
    try {
      body = (await c.req.json()) as { props?: Record<string, unknown> };
    } catch {
      // Empty body is OK; props defaults to {}.
    }
    const props = body.props ?? {};

    try {
      const result = await runAction({
        integrationId: integration,
        actionName: action,
        props,
        userId: userId ?? "",
        workspaceId,
        projectId,
      });
      const status = result.success ? "ok" : "error";
      await audit(projectId, integration, action, userId, status, Date.now() - t0);
      return c.json(result);
    } catch (err) {
      await audit(projectId, integration, action, userId, "error", Date.now() - t0);
      return jsonError(c, 500, "execution-error", err instanceof Error ? err.message : "unknown");
    }
  },
);

// ─── Helpers ────────────────────────────────────────────

function rateLimitOk(projectId: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(projectId);
  if (!bucket || now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(projectId, { windowStart: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT_MAX;
}

async function loadAllowlist(projectId: string): Promise<Set<string>> {
  const now = Date.now();
  const cached = allowlistCache.get(projectId);
  if (cached && now - cached.loadedAt < ALLOWLIST_TTL_MS) {
    return cached.entries;
  }

  const file = path.join(getProjectPath(projectId), ".doable", "connector-allowlist.json");
  let entries = new Set<string>();
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw) as
      | { allow?: Array<{ integration: string; action: string }> }
      | undefined;
    if (parsed?.allow && Array.isArray(parsed.allow)) {
      for (const e of parsed.allow) {
        if (typeof e?.integration === "string" && typeof e?.action === "string") {
          entries.add(`${e.integration}:${e.action}`);
        }
      }
    }
  } catch {
    // Missing file = deny all (the deny-default contract).
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
  return c.json({ error: { code, detail } }, status as never);
}
