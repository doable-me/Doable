/**
 * Workspace-level extras for the "Doable AI" surface.
 *
 * - GET /workspaces/:workspaceId/ai-extras   — default thinking + system prompt
 * - PUT /workspaces/:workspaceId/ai-extras   — admin-only update
 * - GET /workspaces/:workspaceId/ai-usage    — rolling-window aggregates (all projects)
 * - GET /workspaces/:workspaceId/ai-usage.csv — streaming CSV export
 *
 * Mirrors the per-project ai-usage shape so the UI can render the same
 * card with a different scope.
 */

import { Hono } from "hono";
import { z } from "zod";

import { sql } from "../../db/index.js";
import { workspaceQueries } from "@doable/db";
import { authMiddleware, type AuthEnv } from "../../middleware/auth.js";
import type { WorkspaceRole } from "@doable/shared";

const workspaces = workspaceQueries(sql);

export const workspaceAiExtrasRoutes = new Hono<AuthEnv>({ strict: false });

workspaceAiExtrasRoutes.use("*", authMiddleware);

const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin"];

async function requireMember(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  return null;
}
async function requireAdmin(workspaceId: string, userId: string): Promise<string | null> {
  const role = await workspaces.getMemberRole(workspaceId, userId);
  if (!role) return "Not a member of this workspace";
  if (!ADMIN_ROLES.includes(role)) return "Requires admin or owner role";
  return null;
}

// ─── /workspaces/:id/ai-extras ────────────────────────────────────────────

const extrasUpdate = z.object({
  defaultThinkingVisibility: z.enum(["auto", "always-show", "hide"]).optional(),
  defaultSystemPrompt:       z.string().max(4_096).nullable().optional(),
});

workspaceAiExtrasRoutes.get("/:workspaceId/ai-extras", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const [row] = await sql<Array<{
    default_thinking_visibility: string | null;
    default_system_prompt: string | null;
    default_embedding_provider_id: string | null;
    default_embedding_model: string | null;
  }>>`
    SELECT default_thinking_visibility, default_system_prompt,
           default_embedding_provider_id, default_embedding_model
    FROM workspace_ai_settings
    WHERE workspace_id = ${workspaceId}
    LIMIT 1
  `;
  return c.json({
    data: {
      defaultThinkingVisibility: (row?.default_thinking_visibility as "auto" | "always-show" | "hide" | null) ?? "hide",
      defaultSystemPrompt: row?.default_system_prompt ?? null,
      defaultEmbeddingProviderId: row?.default_embedding_provider_id ?? null,
      defaultEmbeddingModel: row?.default_embedding_model ?? null,
    },
  });
});

workspaceAiExtrasRoutes.put("/:workspaceId/ai-extras", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireAdmin(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = extrasUpdate.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", issues: parsed.error.issues }, 400);
  }
  const v = parsed.data;

  // Upsert: workspace_ai_settings always has a row per workspace once any
  // setting is written; create it if missing.
  await sql`
    INSERT INTO workspace_ai_settings (workspace_id, updated_by, default_thinking_visibility, default_system_prompt)
    VALUES (${workspaceId}, ${userId}, ${v.defaultThinkingVisibility ?? "hide"}, ${v.defaultSystemPrompt ?? null})
    ON CONFLICT (workspace_id) DO UPDATE SET
      default_thinking_visibility = COALESCE(${v.defaultThinkingVisibility ?? null}, workspace_ai_settings.default_thinking_visibility),
      default_system_prompt       = ${v.defaultSystemPrompt ?? null},
      updated_by                  = ${userId},
      updated_at                  = now()
  `;

  const [row] = await sql<Array<{
    default_thinking_visibility: string | null;
    default_system_prompt: string | null;
  }>>`
    SELECT default_thinking_visibility, default_system_prompt
    FROM workspace_ai_settings
    WHERE workspace_id = ${workspaceId}
    LIMIT 1
  `;
  return c.json({
    data: {
      defaultThinkingVisibility: (row?.default_thinking_visibility as "auto" | "always-show" | "hide" | null) ?? "hide",
      defaultSystemPrompt: row?.default_system_prompt ?? null,
    },
  });
});

// ─── /workspaces/:id/ai-usage (rollup of all projects in workspace) ────────

const PERIODS = ["today", "7d", "30d", "all"] as const;
type Period = typeof PERIODS[number];

function periodToWhereClause(period: Period) {
  switch (period) {
    case "today":
      return sql`AND created_at >= date_trunc('day', now())`;
    case "7d":
      return sql`AND created_at >= now() - interval '7 days'`;
    case "30d":
      return sql`AND created_at >= now() - interval '30 days'`;
    case "all":
    default:
      return sql``;
  }
}

// ─── Personal-scope extras (under workspace_id, same as user_ai_preferences) ─

const personalExtras = z.object({
  thinkingVisibility:   z.enum(["auto", "always-show", "hide"]).optional(),
  systemPromptOverride: z.string().max(4_096).nullable().optional(),
});

workspaceAiExtrasRoutes.get("/:workspaceId/personal-ai-extras", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const [row] = await sql<Array<{
    thinking_visibility: string | null;
    system_prompt_override: string | null;
  }>>`
    SELECT thinking_visibility, system_prompt_override
    FROM user_ai_preferences
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  return c.json({
    data: {
      thinkingVisibility: (row?.thinking_visibility as "auto" | "always-show" | "hide" | null) ?? "hide",
      systemPromptOverride: row?.system_prompt_override ?? null,
    },
  });
});

workspaceAiExtrasRoutes.put("/:workspaceId/personal-ai-extras", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = personalExtras.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", issues: parsed.error.issues }, 400);
  }
  const v = parsed.data;

  // INSERT…ON CONFLICT: user_ai_preferences exists per (workspace_id,user_id).
  await sql`
    INSERT INTO user_ai_preferences (
      workspace_id, user_id, source, thinking_visibility, system_prompt_override
    ) VALUES (
      ${workspaceId}, ${userId}, 'copilot',
      ${v.thinkingVisibility ?? "hide"}, ${v.systemPromptOverride ?? null}
    )
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
      thinking_visibility    = COALESCE(${v.thinkingVisibility ?? null}, user_ai_preferences.thinking_visibility),
      system_prompt_override = ${v.systemPromptOverride ?? null},
      updated_at             = now()
  `;
  const [row] = await sql<Array<{
    thinking_visibility: string | null;
    system_prompt_override: string | null;
  }>>`
    SELECT thinking_visibility, system_prompt_override
    FROM user_ai_preferences
    WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
    LIMIT 1
  `;
  return c.json({
    data: {
      thinkingVisibility: (row?.thinking_visibility as "auto" | "always-show" | "hide" | null) ?? "hide",
      systemPromptOverride: row?.system_prompt_override ?? null,
    },
  });
});

workspaceAiExtrasRoutes.get("/:workspaceId/ai-usage", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const userId = c.get("userId");
  const err = await requireMember(workspaceId, userId);
  if (err) return c.json({ error: err }, 403);

  const periodParam = (c.req.query("period") ?? "30d").toLowerCase();
  const period = (PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : "30d";
  const where = periodToWhereClause(period);

  const rows = await sql<Array<{
    mode: string;
    prompt_tokens: string | number | null;
    completion_tokens: string | number | null;
    total_tokens: string | number | null;
    request_count: string | number | null;
    cost_usd: string | number | null;
  }>>`
    SELECT
      mode,
      COALESCE(SUM(prompt_tokens),     0)::bigint AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0)::bigint AS completion_tokens,
      COALESCE(SUM(total_tokens),      0)::bigint AS total_tokens,
      COUNT(*)::bigint                            AS request_count,
      COALESCE(SUM(estimated_cost_usd), 0)::numeric(14,6) AS cost_usd
    FROM ai_usage_log
    WHERE workspace_id = ${workspaceId}
      ${where}
    GROUP BY mode
    ORDER BY mode
  `;

  const perProject = await sql<Array<{
    project_id: string | null;
    request_count: string | number | null;
    total_tokens: string | number | null;
  }>>`
    SELECT
      project_id,
      COUNT(*)::bigint                        AS request_count,
      COALESCE(SUM(total_tokens), 0)::bigint  AS total_tokens
    FROM ai_usage_log
    WHERE workspace_id = ${workspaceId}
      ${where}
    GROUP BY project_id
    ORDER BY COUNT(*) DESC
    LIMIT 25
  `;

  let totalTokens = 0;
  let totalRequests = 0;
  let totalCostUsd = 0;
  const byMode: Record<string, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    requestCount: number;
    costUsd: number;
  }> = {};
  for (const r of rows) {
    const m = r.mode ?? "unknown";
    const promptTokens = Number(r.prompt_tokens ?? 0);
    const completionTokens = Number(r.completion_tokens ?? 0);
    const totalTok = Number(r.total_tokens ?? 0);
    const reqs = Number(r.request_count ?? 0);
    const cost = Number(r.cost_usd ?? 0);
    byMode[m] = {
      promptTokens,
      completionTokens,
      totalTokens: totalTok,
      requestCount: reqs,
      costUsd: cost,
    };
    totalTokens += totalTok;
    totalRequests += reqs;
    totalCostUsd += cost;
  }

  return c.json({
    data: {
      period,
      totals: {
        tokens: totalTokens,
        requests: totalRequests,
        costUsd: totalCostUsd,
      },
      byMode,
      perProject: perProject.map((r) => ({
        projectId: r.project_id,
        requestCount: Number(r.request_count ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
      })),
    },
  });
});
