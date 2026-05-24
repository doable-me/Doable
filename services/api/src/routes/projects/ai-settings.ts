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
           system_prompt, embedding_model, embedding_provider_id
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
      system_prompt, embedding_model, embedding_provider_id, updated_by
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
      ${userId}
    )
    ON CONFLICT (project_id) DO UPDATE SET
      enabled                = EXCLUDED.enabled,
      default_model          = EXCLUDED.default_model,
      model_allowlist        = COALESCE(EXCLUDED.model_allowlist, project_ai_settings.model_allowlist),
      budget_tokens          = EXCLUDED.budget_tokens,
      budget_window_sec      = EXCLUDED.budget_window_sec,
      per_user_budget_tokens = EXCLUDED.per_user_budget_tokens,
      max_input_tokens       = EXCLUDED.max_input_tokens,
      max_output_tokens      = EXCLUDED.max_output_tokens,
      max_turns_per_session  = EXCLUDED.max_turns_per_session,
      system_prompt          = EXCLUDED.system_prompt,
      embedding_model        = EXCLUDED.embedding_model,
      embedding_provider_id  = EXCLUDED.embedding_provider_id,
      updated_by             = EXCLUDED.updated_by,
      updated_at             = now()
  `;

  const [row] = await sql<ProjectAiSettingsRow[]>`
    SELECT enabled, default_model, model_allowlist,
           budget_tokens, budget_window_sec, per_user_budget_tokens,
           max_input_tokens, max_output_tokens, max_turns_per_session,
           system_prompt, embedding_model, embedding_provider_id
    FROM project_ai_settings
    WHERE project_id = ${id}
    LIMIT 1
  `;
  return c.json({ data: rowToResponse(row) });
});

// ─── GET /projects/:id/ai-settings/usage ──────────────────────

aiSettingsRoutes.get("/:id/ai-settings/usage", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("userId");
  const access = await requireProjectAccess(userId, id);
  if (!access) return c.json({ error: "Project not found" }, 404);

  // Read the per-project window setting (default 30d when no row / no value).
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
