/**
 * Project AI Settings — GET / PUT / usage readout.
 *
 * PRD ChatBotInfra ch04 §3 + ch07 §2. Pattern mirrors data-token.ts: the
 * router mounts standalone at /projects (gated behind DOABLE_APP_AI_ENABLED
 * in routes.ts) and applies the session-RLS auth middleware itself.
 *
 * Endpoints:
 *   GET /projects/:id/ai-settings       — current row + sensible defaults
 *   PUT /projects/:id/ai-settings       — upsert; workspace admin or
 *                                          project creator only
 *   GET /projects/:id/ai-settings/usage — rolling-window usage roll-up
 */

import { Hono } from "hono";
import { z } from "zod";

import { sql } from "../../db/index.js";
import type { AuthEnv } from "../../middleware/auth.js";
import { authMiddlewareWithRls } from "../../middleware/rls.js";
import { requireProjectAccess, validateProjectIdParam } from "./helpers.js";

export const aiSettingsRoutes = new Hono<AuthEnv>({ strict: false });

aiSettingsRoutes.use("*", authMiddlewareWithRls);
aiSettingsRoutes.use("/:id", validateProjectIdParam());
aiSettingsRoutes.use("/:id/*", validateProjectIdParam());

const DESTRUCTIVE_ROLES = new Set(["owner", "admin"]);

const upsertSchema = z.object({
  enabled:              z.boolean().optional(),
  defaultModel:         z.string().nullable().optional(),
  modelAllowlist:       z.array(z.string()).nullable().optional(),
  budgetTokens:         z.number().int().positive().nullable().optional(),
  budgetWindowSec:      z.number().int().positive().nullable().optional(),
  perUserBudgetTokens:  z.number().int().positive().nullable().optional(),
  maxInputTokens:       z.number().int().positive().nullable().optional(),
  maxOutputTokens:      z.number().int().positive().nullable().optional(),
  maxTurnsPerSession:   z.number().int().positive().nullable().optional(),
  systemPrompt:         z.string().max(8_000).nullable().optional(),
  embeddingModel:       z.string().nullable().optional(),
  embeddingProviderId:  z.string().uuid().nullable().optional(),
  // ─── Doable AI tab additions (migration 096) ────────────────
  thinkingVisibility:      z.enum(["auto", "always-show", "hide"]).optional(),
  systemPromptOverride:    z.string().max(4_096).nullable().optional(),
  chatModelOverride:       z.string().max(120).nullable().optional(),
  embeddingModelOverride:  z.string().max(120).nullable().optional(),
});

type ProjectAiSettingsRow = {
  enabled: boolean;
  default_model: string | null;
  model_allowlist: string[] | null;
  budget_tokens: string | number | null;
  budget_window_sec: number | null;
  per_user_budget_tokens: string | number | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
  max_turns_per_session: number | null;
  system_prompt: string | null;
  embedding_model: string | null;
  embedding_provider_id: string | null;
  thinking_visibility: string | null;
  system_prompt_override: string | null;
  chat_model_override: string | null;
  embedding_model_override: string | null;
};

function rowToResponse(row: ProjectAiSettingsRow | undefined) {
  if (!row) {
    return {
      enabled: true,
      defaultModel: null,
      modelAllowlist: null,
      budgetTokens: null,
      budgetWindowSec: null,
      perUserBudgetTokens: null,
      maxInputTokens: null,
      maxOutputTokens: null,
      maxTurnsPerSession: null,
      systemPrompt: null,
      embeddingModel: null,
      embeddingProviderId: null,
      thinkingVisibility: "hide" as const,
      systemPromptOverride: null,
      chatModelOverride: null,
      embeddingModelOverride: null,
    };
  }
  return {
    enabled: row.enabled,
    defaultModel: row.default_model,
    modelAllowlist: row.model_allowlist,
    budgetTokens: row.budget_tokens === null ? null : Number(row.budget_tokens),
    budgetWindowSec: row.budget_window_sec,
    perUserBudgetTokens: row.per_user_budget_tokens === null ? null : Number(row.per_user_budget_tokens),
    maxInputTokens: row.max_input_tokens,
    maxOutputTokens: row.max_output_tokens,
    maxTurnsPerSession: row.max_turns_per_session,
    systemPrompt: row.system_prompt,
    embeddingModel: row.embedding_model,
    embeddingProviderId: row.embedding_provider_id,
    thinkingVisibility: (row.thinking_visibility as "auto" | "always-show" | "hide" | null) ?? "hide",
    systemPromptOverride: row.system_prompt_override,
    chatModelOverride: row.chat_model_override,
    embeddingModelOverride: row.embedding_model_override,
  };
}

// ─── GET /projects/:id/ai-settings ────────────────────────────

aiSettingsRoutes.get("/:id/ai-settings", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const [row] = await sql<ProjectAiSettingsRow[]>`
    SELECT enabled, default_model, model_allowlist,
           budget_tokens, budget_window_sec, per_user_budget_tokens,
           max_input_tokens, max_output_tokens, max_turns_per_session,
           system_prompt, embedding_model, embedding_provider_id,
           thinking_visibility, system_prompt_override,
           chat_model_override, embedding_model_override
    FROM project_ai_settings
    WHERE project_id = ${id}
    LIMIT 1
  `;
  return c.json({ data: rowToResponse(row) });
});

// ─── PUT /projects/:id/ai-settings ────────────────────────────

aiSettingsRoutes.put("/:id/ai-settings", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);
  if (!DESTRUCTIVE_ROLES.has(access.role)) {
    return c.json({ error: "Only an owner or admin can change AI settings" }, 403);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid payload", issues: parsed.error.issues }, 400);
  }
  const v = parsed.data;

  // budgetWindowSec only makes sense alongside budgetTokens / perUserBudgetTokens.
  if (v.budgetWindowSec !== undefined && v.budgetWindowSec !== null
      && (v.budgetTokens ?? null) === null
      && (v.perUserBudgetTokens ?? null) === null) {
    return c.json({ error: "budgetWindowSec requires a budgetTokens or perUserBudgetTokens value" }, 400);
  }

  const workspaceId = access.project.workspace_id;
  await sql`
    INSERT INTO project_ai_settings (
      project_id, workspace_id, enabled,
      default_model, model_allowlist,
      budget_tokens, budget_window_sec, per_user_budget_tokens,
      max_input_tokens, max_output_tokens, max_turns_per_session,
      system_prompt, embedding_model, embedding_provider_id,
      thinking_visibility, system_prompt_override,
      chat_model_override, embedding_model_override,
      updated_by
    ) VALUES (
      ${id}, ${workspaceId}, ${v.enabled ?? true},
      ${v.defaultModel ?? null},
      ${v.modelAllowlist === undefined ? null : sql`${JSON.stringify(v.modelAllowlist)}::jsonb`},
      ${v.budgetTokens ?? null},
      ${v.budgetWindowSec ?? null},
      ${v.perUserBudgetTokens ?? null},
      ${v.maxInputTokens ?? null},
      ${v.maxOutputTokens ?? null},
      ${v.maxTurnsPerSession ?? null},
      ${v.systemPrompt ?? null},
      ${v.embeddingModel ?? null},
      ${v.embeddingProviderId ?? null},
      ${v.thinkingVisibility ?? "hide"},
      ${v.systemPromptOverride ?? null},
      ${v.chatModelOverride ?? null},
      ${v.embeddingModelOverride ?? null},
      ${userId}
    )
    ON CONFLICT (project_id) DO UPDATE SET
      enabled                  = EXCLUDED.enabled,
      default_model            = EXCLUDED.default_model,
      model_allowlist          = COALESCE(EXCLUDED.model_allowlist, project_ai_settings.model_allowlist),
      budget_tokens            = EXCLUDED.budget_tokens,
      budget_window_sec        = EXCLUDED.budget_window_sec,
      per_user_budget_tokens   = EXCLUDED.per_user_budget_tokens,
      max_input_tokens         = EXCLUDED.max_input_tokens,
      max_output_tokens        = EXCLUDED.max_output_tokens,
      max_turns_per_session    = EXCLUDED.max_turns_per_session,
      system_prompt            = EXCLUDED.system_prompt,
      embedding_model          = EXCLUDED.embedding_model,
      embedding_provider_id    = EXCLUDED.embedding_provider_id,
      thinking_visibility      = EXCLUDED.thinking_visibility,
      system_prompt_override   = EXCLUDED.system_prompt_override,
      chat_model_override      = EXCLUDED.chat_model_override,
      embedding_model_override = EXCLUDED.embedding_model_override,
      updated_by               = EXCLUDED.updated_by,
      updated_at               = now()
  `;

  const [row] = await sql<ProjectAiSettingsRow[]>`
    SELECT enabled, default_model, model_allowlist,
           budget_tokens, budget_window_sec, per_user_budget_tokens,
           max_input_tokens, max_output_tokens, max_turns_per_session,
           system_prompt, embedding_model, embedding_provider_id,
           thinking_visibility, system_prompt_override,
           chat_model_override, embedding_model_override
    FROM project_ai_settings
    WHERE project_id = ${id}
    LIMIT 1
  `;
  return c.json({ data: rowToResponse(row) });
});

// ─── GET /projects/:id/ai-settings/usage (legacy single-window) ────────────

aiSettingsRoutes.get("/:id/ai-settings/usage", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const [settingsRow] = await sql<Array<{ budget_window_sec: number | null }>>`
    SELECT budget_window_sec FROM project_ai_settings
    WHERE project_id = ${id} LIMIT 1
  `;
  const windowSec = settingsRow?.budget_window_sec ?? 30 * 24 * 60 * 60;

  const [agg] = await sql<Array<{
    tokens_used: string | number | null;
    request_count: string | number | null;
    cost_usd: string | number | null;
  }>>`
    SELECT
      COALESCE(SUM(total_tokens),     0)::bigint        AS tokens_used,
      COUNT(*)::bigint                                  AS request_count,
      COALESCE(SUM(estimated_cost_usd), 0)::numeric(14,6) AS cost_usd
    FROM ai_usage_log
    WHERE project_id  = ${id}
      AND is_runtime  = true
      AND created_at >= now() - (${windowSec} || ' seconds')::interval
  `;
  return c.json({
    data: {
      windowSec,
      tokensUsed: Number(agg?.tokens_used ?? 0),
      requestCount: Number(agg?.request_count ?? 0),
      costUsd: Number(agg?.cost_usd ?? 0),
    },
  });
});

// ─── GET /projects/:id/ai-usage (new — period + per-mode breakdown) ───────

const PERIODS = ["today", "7d", "30d", "all"] as const;
type Period = typeof PERIODS[number];

function periodToWhereClause(period: Period) {
  // Returns the SQL fragment for the time filter using template literals;
  // empty for "all".
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

aiSettingsRoutes.get("/:id/ai-usage", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const periodParam = (c.req.query("period") ?? "30d").toLowerCase();
  const period = (PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : "30d";
  const where = periodToWhereClause(period);

  // Per-mode rollup (runtime-chat, runtime-embed, agent).
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
    WHERE project_id = ${id}
      ${where}
    GROUP BY mode
    ORDER BY mode
  `;

  // Top models in window (small — show ~10).
  const topModels = await sql<Array<{
    model: string | null;
    request_count: string | number | null;
    total_tokens: string | number | null;
  }>>`
    SELECT
      model,
      COUNT(*)::bigint                            AS request_count,
      COALESCE(SUM(total_tokens), 0)::bigint      AS total_tokens
    FROM ai_usage_log
    WHERE project_id = ${id}
      ${where}
    GROUP BY model
    ORDER BY COUNT(*) DESC
    LIMIT 10
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
      topModels: topModels.map((r) => ({
        model: r.model ?? "(unknown)",
        requestCount: Number(r.request_count ?? 0),
        totalTokens: Number(r.total_tokens ?? 0),
      })),
    },
  });
});

// ─── GET /projects/:id/ai-usage.csv (streaming CSV export) ─────────────────

aiSettingsRoutes.get("/:id/ai-usage.csv", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  const periodParam = (c.req.query("period") ?? "30d").toLowerCase();
  const period = (PERIODS as readonly string[]).includes(periodParam)
    ? (periodParam as Period)
    : "30d";
  const where = periodToWhereClause(period);

  const rows = await sql<Array<{
    created_at: string;
    mode: string | null;
    model: string | null;
    provider: string | null;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    embed_dims: number | null;
    duration_ms: number | null;
    estimated_cost_usd: string | number | null;
    app_user_id: string | null;
  }>>`
    SELECT
      created_at, mode, model, provider,
      prompt_tokens, completion_tokens, total_tokens,
      embed_dims, duration_ms, estimated_cost_usd, app_user_id
    FROM ai_usage_log
    WHERE project_id = ${id}
      ${where}
    ORDER BY created_at DESC
    LIMIT 50000
  `;

  function csvCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  const header = [
    "created_at",
    "mode",
    "model",
    "provider",
    "prompt_tokens",
    "completion_tokens",
    "total_tokens",
    "embed_dims",
    "duration_ms",
    "estimated_cost_usd",
    "app_user_id",
  ];
  const lines: string[] = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.created_at),
      csvCell(r.mode),
      csvCell(r.model),
      csvCell(r.provider),
      csvCell(r.prompt_tokens),
      csvCell(r.completion_tokens),
      csvCell(r.total_tokens),
      csvCell(r.embed_dims),
      csvCell(r.duration_ms),
      csvCell(r.estimated_cost_usd),
      csvCell(r.app_user_id),
    ].join(","));
  }

  const body = lines.join("\n") + "\n";
  c.header("content-type", "text/csv; charset=utf-8");
  c.header(
    "content-disposition",
    `attachment; filename="ai-usage-${id}-${period}.csv"`,
  );
  return c.body(body);
});
