/**
 * Runtime AI data-plane proxy (PRD ChatBotInfra ch01).
 *
 * Sibling of /__doable/data/*: same auth shape (project JWT for preview,
 * dpk_* for deployed apps), same rate-limit window, same connector_audit
 * table. The only difference downstream is that instead of forwarding SQL to
 * the per-project PGlite worker, we forward a chat/embed payload to the
 * workspace-configured AI provider (OpenAI-compatible or Anthropic).
 *
 * Routes (mounted at "/"):
 *   POST /__doable/ai/chat   — streaming chat (SSE) by default
 *   POST /__doable/ai/embed  — batch embeddings (JSON)
 *
 * Security invariants (per ch01 + ch05):
 *   - projectId/userId come from resolveAuth — never from the request body.
 *   - The provider key never leaves the server process; the SDK only ever
 *     holds a fenced, project-scoped token.
 *   - Model allow-list enforcement (ch05 §4) before the provider call.
 *   - Per-project token budget cap (ch05 §2) before the provider call.
 *   - app_user_id (x-doable-app-user) honoured ONLY on server-tier keys
 *     (impersonation guard from app-data.ts) — guarantees per-user metering
 *     cannot be spoofed by browser-exposed credentials.
 *   - Every call writes connector_audit + ai_usage_log rows.
 */

import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";

import { sql } from "../db/index.js";
import {
  resolveAuth,
  rateLimitOk,
  getEffectiveRateLimit,
  type ResolvedAuth,
} from "./connector-proxy.js";
import { resolveAiEngine } from "../ai/engine-resolver.js";
import type { ByokProviderConfig } from "../ai/engine-types.js";
import {
  resolveEmbeddingEngine,
  type ResolvedEmbeddingEngine,
} from "../ai/embedding-resolver.js";
import { createThinkingStripper } from "@doable/ai";
import {
  DOABLE_APP_AI_MAX_INPUT_TOKENS,
  DOABLE_APP_AI_MAX_OUTPUT_TOKENS,
  DOABLE_APP_AI_MAX_MESSAGES,
  DOABLE_APP_AI_MAX_EMBED_BATCH,
  DOABLE_APP_AI_MAX_EMBED_CHARS,
  DOABLE_APP_AI_DEFAULT_EMBED_MODEL,
  DOABLE_APP_AI_DEFAULT_EMBED_DIMS,
} from "../ai/runtime-config.js";

// ── Public router ─────────────────────────────────────────────────────────

export const aiProxyRoutes = new Hono({ strict: false });

type AiOp = "chat" | "embed";

// ── Domain types ──────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatRequestBody {
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
}

export interface ChatStreamEvent {
  type: "text_delta" | "done" | "error" | "status";
  data: unknown;
}

export interface ChatProviderResult {
  /** Whole-response text. */
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  finish_reason: string;
  model: string;
}

export interface EmbedProviderResult {
  vectors: number[][];
  model: string;
  dimensions: number;
  prompt_tokens: number;
}

export interface ProjectAiSettings {
  enabled: boolean;
  defaultModel: string | null;
  modelAllowlist: string[] | null;
  budgetTokens: number | null;
  budgetWindowSec: number | null;
  perUserBudgetTokens: number | null;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  maxTurnsPerSession: number | null;
  systemPrompt: string | null;
  embeddingModel: string | null;
  embeddingProviderId: string | null;
  // ─── Migration 096 additions ─────────────────────────────────
  thinkingVisibility: "auto" | "always-show" | "hide";
  systemPromptOverride: string | null;
  chatModelOverride: string | null;
  embeddingModelOverride: string | null;
}

/** A single chat-stream chunk shape we pass to the SDK. */
export interface ChatStreamYield {
  type: "text_delta" | "done" | "error";
  data: unknown;
}

// ── Test seams ────────────────────────────────────────────────────────────

type ChatExecutor = (
  ctx: {
    provider: ByokProviderConfig | undefined;
    githubToken: string | undefined;
    model: string;
    messages: ChatMessage[];
    max_tokens: number;
    stream: boolean;
  },
) => AsyncIterable<ChatStreamYield>;

type EmbedExecutor = (
  ctx: {
    provider: ByokProviderConfig | undefined;
    model: string;
    texts: string[];
  },
) => Promise<EmbedProviderResult>;

type SettingsResolver = (projectId: string) => Promise<ProjectAiSettings>;
type EngineResolver = (projectId: string, userId: string) => Promise<{
  model?: string;
  provider?: ByokProviderConfig;
  githubToken?: string;
} | null>;
type EmbeddingResolver = (
  projectId: string,
  projectOverride: { embeddingProviderId: string | null; embeddingModel: string | null },
) => Promise<ResolvedEmbeddingEngine | null>;

let chatExecutor: ChatExecutor = defaultChatExecutor;
let embedExecutor: EmbedExecutor = defaultEmbedExecutor;
let settingsResolver: SettingsResolver | null = null;
let engineResolver: EngineResolver | null = null;
let embeddingResolver: EmbeddingResolver | null = null;

/** Test seam: override the chat provider executor. Pass null to reset. */
export function __setChatExecutorForTest(fn: ChatExecutor | null): void {
  chatExecutor = fn ?? defaultChatExecutor;
}
/** Test seam: override the embed provider executor. Pass null to reset. */
export function __setEmbedExecutorForTest(fn: EmbedExecutor | null): void {
  embedExecutor = fn ?? defaultEmbedExecutor;
}
/** Test seam: override the project-AI-settings resolver. Pass null to reset. */
export function __setSettingsResolverForTest(fn: SettingsResolver | null): void {
  settingsResolver = fn;
}
/** Test seam: override the AI engine resolver. Pass null to reset. */
export function __setEngineResolverForTest(fn: EngineResolver | null): void {
  engineResolver = fn;
}
/** Test seam: override the embedding-engine resolver. Pass null to reset. */
export function __setEmbeddingResolverForTest(fn: EmbeddingResolver | null): void {
  embeddingResolver = fn;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function jsonError(c: Context, status: number, code: string, message?: string) {
  return c.json({ ok: false, error: { code, message: message ?? code } }, status as 400);
}

/** Mirror of app-data.ts:toolNotAllowed for ai.* operations. */
export function toolNotAllowed(auth: ResolvedAuth, op: AiOp): boolean {
  if (auth.authMode !== "api-key") return false;
  if (auth.allowedTools === null) return false;
  return !auth.allowedTools.includes(`ai.${op}`);
}

/** Impersonation guard — only server-tier keys may assert x-doable-app-user. */
export function appUserId(c: Context, auth: ResolvedAuth): string | null {
  const trustedBackend = auth.authMode === "api-key" && auth.tier === "server";
  if (trustedBackend) {
    const hdr = c.req.header("x-doable-app-user");
    return hdr && hdr.length > 0 ? hdr : null;
  }
  return null;
}

/** Naive token estimator — a deterministic stand-in when the provider does
 *  not return real counts. Counts ~4 chars per token (a widely-cited heuristic
 *  for English text in the OpenAI / Anthropic tokenisers). */
export function estimateTokens(s: string): number {
  if (!s) return 0;
  return Math.ceil(s.length / 4);
}

/** Load per-project AI settings; returns sensible defaults if no row exists. */
export async function getProjectAiSettings(projectId: string): Promise<ProjectAiSettings> {
  try {
    const [row] = await sql<Array<Record<string, unknown>>>`
      SELECT enabled, default_model, model_allowlist,
             budget_tokens, budget_window_sec, per_user_budget_tokens,
             max_input_tokens, max_output_tokens, max_turns_per_session,
             system_prompt,
             embedding_model, embedding_provider_id,
             thinking_visibility, system_prompt_override,
             chat_model_override, embedding_model_override
      FROM project_ai_settings
      WHERE project_id = ${projectId}
      LIMIT 1
    `;
    if (!row) return defaultProjectAiSettings();
    // OOB default is "hide" so generated apps never leak raw <think> reasoning
    // unless an admin explicitly opts into "auto"/"always-show". Explicit
    // stored values (including explicit "auto") are preserved.
    const tv = (row.thinking_visibility as string | null) ?? "hide";
    const tvValid: "auto" | "always-show" | "hide" =
      tv === "auto" || tv === "always-show" ? tv : "hide";
    return {
      enabled: (row.enabled as boolean | null) ?? true,
      defaultModel: (row.default_model as string | null) ?? null,
      modelAllowlist: Array.isArray(row.model_allowlist) ? row.model_allowlist as string[] : null,
      budgetTokens: row.budget_tokens === null || row.budget_tokens === undefined ? null : Number(row.budget_tokens),
      budgetWindowSec: row.budget_window_sec === null || row.budget_window_sec === undefined ? null : Number(row.budget_window_sec),
      perUserBudgetTokens: row.per_user_budget_tokens === null || row.per_user_budget_tokens === undefined ? null : Number(row.per_user_budget_tokens),
      maxInputTokens: row.max_input_tokens === null || row.max_input_tokens === undefined ? null : Number(row.max_input_tokens),
      maxOutputTokens: row.max_output_tokens === null || row.max_output_tokens === undefined ? null : Number(row.max_output_tokens),
      maxTurnsPerSession: row.max_turns_per_session === null || row.max_turns_per_session === undefined ? null : Number(row.max_turns_per_session),
      systemPrompt: (row.system_prompt as string | null) ?? null,
      embeddingModel: (row.embedding_model as string | null) ?? null,
      embeddingProviderId: (row.embedding_provider_id as string | null) ?? null,
      thinkingVisibility: tvValid,
      systemPromptOverride: (row.system_prompt_override as string | null) ?? null,
      chatModelOverride: (row.chat_model_override as string | null) ?? null,
      embeddingModelOverride: (row.embedding_model_override as string | null) ?? null,
    };
  } catch {
    return defaultProjectAiSettings();
  }
}

function defaultProjectAiSettings(): ProjectAiSettings {
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
    thinkingVisibility: "hide",
    systemPromptOverride: null,
    chatModelOverride: null,
    embeddingModelOverride: null,
  };
}

/**
 * Returns true if the requested call would push the project / per-end-user
 * usage over the configured budget. Counts tokens spent in the current
 * rolling window.
 */
export async function checkBudgetExceeded(opts: {
  projectId: string;
  appUserId: string | null;
  settings: ProjectAiSettings;
  estimatedTokens: number;
}): Promise<{ exceeded: boolean; scope?: "project" | "per_user" }> {
  const { settings } = opts;
  if (settings.budgetTokens === null && settings.perUserBudgetTokens === null) {
    return { exceeded: false };
  }
  try {
    const windowSec = settings.budgetWindowSec ?? 30 * 24 * 60 * 60; // default 30d
    if (settings.budgetTokens !== null) {
      const [row] = await sql<Array<{ tokens_used: string | number | null }>>`
        SELECT COALESCE(SUM(total_tokens), 0)::bigint AS tokens_used
        FROM ai_usage_log
        WHERE project_id = ${opts.projectId}
          AND is_runtime = true
          AND created_at >= now() - (${windowSec} || ' seconds')::interval
      `;
      const used = Number(row?.tokens_used ?? 0);
      if (used + opts.estimatedTokens > settings.budgetTokens) {
        return { exceeded: true, scope: "project" };
      }
    }
    if (settings.perUserBudgetTokens !== null && opts.appUserId) {
      const [row] = await sql<Array<{ tokens_used: string | number | null }>>`
        SELECT COALESCE(SUM(total_tokens), 0)::bigint AS tokens_used
        FROM ai_usage_log
        WHERE project_id = ${opts.projectId}
          AND app_user_id = ${opts.appUserId}
          AND is_runtime = true
          AND created_at >= now() - (${windowSec} || ' seconds')::interval
      `;
      const used = Number(row?.tokens_used ?? 0);
      if (used + opts.estimatedTokens > settings.perUserBudgetTokens) {
        return { exceeded: true, scope: "per_user" };
      }
    }
    return { exceeded: false };
  } catch {
    // If the budget query fails (e.g. DB hiccup), do NOT fail the request.
    return { exceeded: false };
  }
}

/**
 * Enforce the model allow-list. Returns the effective model id or throws
 * the appropriate http error response.
 *
 * Behaviour (mirror PRD ch01 §6 + ch05 §4):
 *   - body.model is intentionally absent from our request schema, so the
 *     server picks. We pass through `settings.defaultModel` first, then the
 *     workspace-default resolved by engine-resolver.
 *   - If `model_allowlist` is non-null and the resolved model is not in it,
 *     return 403 MODEL_NOT_ALLOWED.
 */
export function enforceModelAllowList(
  resolvedModel: string | undefined,
  settings: ProjectAiSettings,
): { ok: true; model: string } | { ok: false; code: string; message: string } {
  // Priority: chat_model_override (Doable AI tab) >
  //           legacy default_model > workspace/engine-resolved default.
  const model = settings.chatModelOverride ?? settings.defaultModel ?? resolvedModel ?? "";
  if (!model) {
    return { ok: false, code: "PROVIDER_ERROR", message: "No model resolved for this workspace" };
  }
  if (settings.modelAllowlist === null) return { ok: true, model };
  if (settings.modelAllowlist.length === 0) {
    return { ok: false, code: "MODEL_NOT_ALLOWED", message: "Project allows no models" };
  }
  if (!settings.modelAllowlist.includes(model)) {
    return {
      ok: false,
      code: "MODEL_NOT_ALLOWED",
      message: `Model "${model}" is not in the project's allow-list`,
    };
  }
  return { ok: true, model };
}

// ── Audit & usage ─────────────────────────────────────────────────────────

async function audit(opts: {
  projectId: string;
  op: AiOp;
  userId?: string;
  status: "ok" | "denied" | "error";
  errorCode?: string | null;
  durationMs: number;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO connector_audit
        (project_id, integration, action, user_id, status, duration_ms, error_code)
      VALUES
        (${opts.projectId}, 'doable.ai', ${`ai.${opts.op}`}, ${opts.userId ?? null},
         ${opts.status}, ${opts.durationMs}, ${opts.errorCode ?? null})
    `;
  } catch (err) {
    console.error("[ai-proxy] audit insert failed:", err);
  }
}

async function recordUsage(opts: {
  auth: ResolvedAuth;
  op: AiOp;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  appUserId: string | null;
  embedDims?: number;
}): Promise<void> {
  try {
    const total = opts.promptTokens + opts.completionTokens;
    await sql`
      INSERT INTO ai_usage_log
        (user_id, workspace_id, project_id, provider, model, mode,
         prompt_tokens, completion_tokens, total_tokens, duration_ms,
         is_runtime, app_user_id, owner_user_id, owner_workspace_id, embed_dims)
      VALUES
        (${opts.auth.userId}, ${opts.auth.workspaceId}, ${opts.auth.projectId},
         'doable.ai', ${opts.model}, ${`runtime-${opts.op}`},
         ${opts.promptTokens}, ${opts.completionTokens}, ${total}, ${opts.durationMs},
         true, ${opts.appUserId}, ${opts.auth.userId}, ${opts.auth.workspaceId},
         ${opts.embedDims ?? null})
    `;
  } catch (err) {
    console.error("[ai-proxy] usage insert failed:", err);
  }
}

/**
 * Phase 3 abuse analytics (PRD ch08 §phase3).
 *
 * Fire-and-forget: updates the most recently inserted ai_usage_log row for
 * this project if its total_tokens is ≥ ABUSE_MULTIPLIER × the 30-day
 * rolling mean for the project. Anomalous rows surface in the admin
 * abuse-flags endpoint (/admin/ai/abuse-flags).
 *
 * Intentionally non-blocking — a DB hiccup here must never fail a chat
 * request. Called with void so the caller does not await it.
 */
const ABUSE_MULTIPLIER = 10; // flag if cost is ≥ 10× project rolling mean

function flagAbuseAsync(projectId: string, totalTokens: number): void {
  // Run in background; never reject to the caller.
  Promise.resolve().then(async () => {
    try {
      if (totalTokens <= 0) return;
      // Compute 30-day mean excluding already-flagged rows so a run of
      // flagged rows doesn't normalise the mean upward.
      const [mean] = await sql<Array<{ avg_tokens: string | number | null }>>`
        SELECT AVG(total_tokens)::numeric(14,2) AS avg_tokens
        FROM ai_usage_log
        WHERE project_id    = ${projectId}
          AND is_runtime     = true
          AND is_flagged_abuse = false
          AND created_at    >= now() - interval '30 days'
      `;
      const avgTokens = Number(mean?.avg_tokens ?? 0);
      if (avgTokens <= 0) return; // not enough history to flag
      if (totalTokens < avgTokens * ABUSE_MULTIPLIER) return;

      // Mark the most recent row(s) for this project created in the last
      // 2 seconds that match the token count and are not yet flagged.
      await sql`
        UPDATE ai_usage_log
        SET    is_flagged_abuse = true
        WHERE  project_id        = ${projectId}
          AND  total_tokens      = ${totalTokens}
          AND  is_flagged_abuse  = false
          AND  created_at       >= now() - interval '2 seconds'
      `;
    } catch (err) {
      console.error("[ai-proxy] flagAbuseAsync failed:", err);
    }
  }).catch(() => { /* swallow */ });
}

// ── Default executors (real provider calls) ───────────────────────────────

/**
 * Generic OpenAI-compatible chat completions caller used as the default
 * chat executor. Most providers (OpenAI, Azure with OpenAI shape, OpenRouter,
 * Groq, Mistral, DeepSeek, …) accept this shape. Anthropic uses its own SDK
 * but its `/v1/messages` endpoint is also supported here in a basic form.
 *
 * We deliberately don't depend on a provider SDK package — keep the proxy
 * lightweight and avoid build-tier coupling. Streaming is parsed from the
 * standard SSE `data: {json}\n\n` envelope.
 */
async function* defaultChatExecutor(ctx: {
  provider: ByokProviderConfig | undefined;
  githubToken: string | undefined;
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  stream: boolean;
}): AsyncGenerator<ChatStreamYield, void, undefined> {
  if (!ctx.provider && !ctx.githubToken) {
    yield { type: "error", data: "No AI provider configured for this workspace" };
    return;
  }
  // Default to OpenAI-compatible. Anthropic is a small variation.
  // BUG-CHATBOT-001: The stored baseUrl for OpenAI-compatible providers
  // already includes the version segment (e.g. `https://api.openai.com/v1`,
  // `https://api.minimax.io/v1`, `https://generativelanguage.googleapis.com/v1beta/openai`).
  // The wizard probe in setup.ts agrees: it appends just `/embeddings` or
  // `/models`. The runtime path here must do the same — appending `/v1`
  // unconditionally produced `.../v1/v1/chat/completions` and a 404 for
  // every non-Anthropic provider. Anthropic's stored baseUrl is
  // `https://api.anthropic.com` (no /v1) so we keep the explicit /v1 prefix
  // for that branch.
  const baseUrl = (ctx.provider?.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const url = ctx.provider?.type === "anthropic"
    ? `${baseUrl}/v1/messages`
    : `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ctx.provider?.apiKey) headers["authorization"] = `Bearer ${ctx.provider.apiKey}`;
  if (ctx.provider?.bearerToken) headers["authorization"] = `Bearer ${ctx.provider.bearerToken}`;
  if (ctx.provider?.type === "anthropic") {
    headers["x-api-key"] = ctx.provider.apiKey ?? ctx.provider.bearerToken ?? "";
    headers["anthropic-version"] = "2023-06-01";
  }

  const body = ctx.provider?.type === "anthropic"
    ? {
        model: ctx.model,
        max_tokens: ctx.max_tokens,
        stream: ctx.stream,
        messages: ctx.messages.filter((m) => m.role !== "system"),
        system: ctx.messages.find((m) => m.role === "system")?.content,
      }
    : {
        model: ctx.model,
        max_tokens: ctx.max_tokens,
        stream: ctx.stream,
        messages: ctx.messages,
      };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    yield { type: "error", data: `Network error: ${(err as Error).message}` };
    return;
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => "");
    yield { type: "error", data: `Provider HTTP ${res.status}: ${errText.slice(0, 200)}` };
    return;
  }

  if (!ctx.stream) {
    const json = await res.json().catch(() => ({})) as Record<string, unknown>;
    const content = extractFullContent(ctx.provider?.type, json);
    const usage = extractUsage(json);
    yield { type: "text_delta", data: content };
    yield { type: "done", data: { finish_reason: "stop", usage } };
    return;
  }

  // Streaming path: parse SSE frames from the provider's response.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let promptTokens = 0;
  let completionTokens = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (raw === "[DONE]") continue;
      let json: Record<string, unknown>;
      try { json = JSON.parse(raw) as Record<string, unknown>; } catch { continue; }
      const delta = extractDelta(ctx.provider?.type, json);
      if (delta) {
        yield { type: "text_delta", data: delta };
      }
      const usage = extractUsage(json);
      if (usage) {
        promptTokens = usage.prompt_tokens;
        completionTokens = usage.completion_tokens;
      }
    }
  }
  yield {
    type: "done",
    data: {
      finish_reason: "stop",
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    },
  };
}

function extractDelta(type: string | undefined, json: Record<string, unknown>): string | null {
  if (type === "anthropic") {
    // {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}
    const ev = json as { type?: string; delta?: { text?: string } };
    if (ev.type === "content_block_delta" && ev.delta?.text) return ev.delta.text;
    return null;
  }
  // OpenAI-compatible: {"choices":[{"delta":{"content":"Hi"}}]}
  const oai = json as { choices?: Array<{ delta?: { content?: string } }> };
  return oai.choices?.[0]?.delta?.content ?? null;
}

function extractFullContent(type: string | undefined, json: Record<string, unknown>): string {
  if (type === "anthropic") {
    const ev = json as { content?: Array<{ type?: string; text?: string }> };
    return (ev.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  }
  const oai = json as { choices?: Array<{ message?: { content?: string } }> };
  return oai.choices?.[0]?.message?.content ?? "";
}

function extractUsage(json: Record<string, unknown>): { prompt_tokens: number; completion_tokens: number } | null {
  const u = (json as { usage?: Record<string, number> }).usage;
  if (!u) return null;
  // OpenAI: prompt_tokens / completion_tokens. Anthropic: input_tokens / output_tokens.
  const prompt = u.prompt_tokens ?? u.input_tokens ?? 0;
  const completion = u.completion_tokens ?? u.output_tokens ?? 0;
  return { prompt_tokens: prompt, completion_tokens: completion };
}

async function defaultEmbedExecutor(ctx: {
  provider: ByokProviderConfig | undefined;
  model: string;
  texts: string[];
}): Promise<EmbedProviderResult> {
  if (!ctx.provider) {
    throw new Error("No embedding provider configured");
  }
  // BUG-CHATBOT-001: stored embedding-provider baseUrls already include the
  // version segment (`.../v1`, `.../v1beta/openai`). The wizard's probe
  // call uses `${baseUrl}/embeddings`; the runtime path must match.
  const baseUrl = ctx.provider.baseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/embeddings`;

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ctx.provider.apiKey) headers["authorization"] = `Bearer ${ctx.provider.apiKey}`;
  if (ctx.provider.bearerToken) headers["authorization"] = `Bearer ${ctx.provider.bearerToken}`;

  // Cap the output dimensionality so generated apps' pgvector indexes stay
  // valid. pgvector's ivfflat/hnsw indexes are limited to 2000 dimensions,
  // but several current models exceed that natively (e.g. Gemini's
  // gemini-embedding-001 → 3072, OpenAI text-embedding-3-large → 3072).
  // Matryoshka-capable models (gemini-embedding-001, text-embedding-3-*)
  // honor an OpenAI-style `dimensions` param to truncate the vector; models
  // that don't support it reject the request (400/422), so we transparently
  // retry without the param. DOABLE_APP_AI_DEFAULT_EMBED_DIMS (default 1536,
  // matching the app-prompt's `vector(1536)` template) is the requested cap.
  const requestedDims = DOABLE_APP_AI_DEFAULT_EMBED_DIMS;
  const postEmbeddings = (includeDims: boolean) =>
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(
        includeDims && requestedDims > 0
          ? { model: ctx.model, input: ctx.texts, dimensions: requestedDims }
          : { model: ctx.model, input: ctx.texts },
      ),
    });

  let res = await postEmbeddings(true);
  if (!res.ok && (res.status === 400 || res.status === 422) && requestedDims > 0) {
    // Provider/model doesn't support output-dimension reduction — fall back
    // to its native dimensionality rather than failing the embed call.
    res = await postEmbeddings(false);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Provider HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding: number[] }>;
    usage?: { prompt_tokens?: number };
  };
  const vectors = (json.data ?? []).map((d) => d.embedding ?? []);
  return {
    vectors,
    model: ctx.model,
    dimensions: vectors[0]?.length ?? DOABLE_APP_AI_DEFAULT_EMBED_DIMS,
    prompt_tokens: json.usage?.prompt_tokens ?? 0,
  };
}

// ── Request validators ───────────────────────────────────────────────────

function isMessage(x: unknown): x is ChatMessage {
  return !!x && typeof x === "object"
    && typeof (x as { role?: unknown }).role === "string"
    && typeof (x as { content?: unknown }).content === "string"
    && ["user", "assistant", "system"].includes((x as { role: string }).role);
}

function parseChatBody(c: Context, body: Record<string, unknown>): ChatRequestBody | Response {
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError(c, 400, "PARAMS_INVALID", "messages[] is required and must be non-empty");
  }
  if (body.messages.length > DOABLE_APP_AI_MAX_MESSAGES) {
    return jsonError(c, 400, "PARAMS_INVALID", `messages[] exceeds ${DOABLE_APP_AI_MAX_MESSAGES}`);
  }
  for (const m of body.messages) {
    if (!isMessage(m)) {
      return jsonError(c, 400, "PARAMS_INVALID", "messages[] entries must be {role, content}");
    }
  }
  return {
    messages: body.messages as ChatMessage[],
    stream: body.stream === false ? false : true,
    max_tokens: typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : undefined,
  };
}

function parseEmbedBody(c: Context, body: Record<string, unknown>): { texts: string[] } | Response {
  if (!Array.isArray(body.texts) || body.texts.length === 0) {
    return jsonError(c, 400, "PARAMS_INVALID", "texts[] is required and must be non-empty");
  }
  if (body.texts.length > DOABLE_APP_AI_MAX_EMBED_BATCH) {
    return jsonError(c, 400, "PARAMS_INVALID", `texts[] exceeds ${DOABLE_APP_AI_MAX_EMBED_BATCH}`);
  }
  for (const t of body.texts) {
    if (typeof t !== "string") return jsonError(c, 400, "PARAMS_INVALID", "texts[] entries must be strings");
    if (t.length > DOABLE_APP_AI_MAX_EMBED_CHARS) {
      return jsonError(c, 400, "PARAMS_INVALID", `texts[] entry exceeds ${DOABLE_APP_AI_MAX_EMBED_CHARS} chars`);
    }
  }
  return { texts: body.texts as string[] };
}

// ── /chat handler ────────────────────────────────────────────────────────

aiProxyRoutes.post("/__doable/ai/chat", async (c) => {
  const started = Date.now();
  const auth = await resolveAuth(c);
  if (auth instanceof Response) return auth;

  if (toolNotAllowed(auth, "chat")) {
    return jsonError(c, 403, "TOOL_NOT_ALLOWED", "This API key may not call ai.chat");
  }

  let max: number | null = auth.rateLimit;
  try { max = await getEffectiveRateLimit(auth.projectId, auth.rateLimit); } catch { /* use default */ }
  if (!rateLimitOk(auth.projectId, max)) {
    return jsonError(c, 429, "RATE_LIMITED", "Per-project rate limit exceeded");
  }

  let body: Record<string, unknown>;
  try { body = (await c.req.json()) as Record<string, unknown>; } catch { body = {}; }
  const parsed = parseChatBody(c, body);
  if (parsed instanceof Response) return parsed;

  const settings = await (settingsResolver ?? getProjectAiSettings)(auth.projectId);
  if (!settings.enabled) {
    return jsonError(c, 503, "AI_DISABLED_FOR_PROJECT", "Doable AI is disabled for this project");
  }

  const aiConfig = engineResolver
    ? await engineResolver(auth.projectId, auth.userId).catch(() => null)
    : await resolveAiEngine(auth.projectId, auth.userId, {}).catch(() => null);
  const allow = enforceModelAllowList(aiConfig?.model, settings);
  if (!allow.ok) {
    return jsonError(c, allow.code === "PROVIDER_ERROR" ? 503 : 403, allow.code, allow.message);
  }
  const model = allow.model;

  // Inject pinned system prompt server-side (never echoed to client).
  // Priority: explicit per-call request (caller is trusted via project JWT
  // only for the request body — system prompts come from settings):
  //   1. settings.systemPromptOverride (from the Doable AI tab)
  //   2. settings.systemPrompt (legacy field; kept for backward-compat)
  // We concatenate when BOTH are present so a workspace admin's pinned
  // safety prompt can't be silently replaced by a per-project override.
  const systemPrompts: string[] = [];
  if (settings.systemPrompt) systemPrompts.push(settings.systemPrompt);
  if (settings.systemPromptOverride && settings.systemPromptOverride !== settings.systemPrompt) {
    systemPrompts.push(settings.systemPromptOverride);
  }
  const messages: ChatMessage[] = systemPrompts.length
    ? [{ role: "system", content: systemPrompts.join("\n\n") }, ...parsed.messages]
    : parsed.messages;

  const inputCap = settings.maxInputTokens ?? DOABLE_APP_AI_MAX_INPUT_TOKENS;
  const outputCap = settings.maxOutputTokens ?? DOABLE_APP_AI_MAX_OUTPUT_TOKENS;
  const requestedMax = parsed.max_tokens ?? outputCap;
  const maxTokens = Math.min(requestedMax, outputCap);

  const estimatedInput = messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  if (estimatedInput > inputCap) {
    return jsonError(c, 400, "INPUT_TOO_LARGE",
      `Estimated input tokens ${estimatedInput} exceeds cap ${inputCap}`);
  }

  const endUser = appUserId(c, auth);
  const budget = await checkBudgetExceeded({
    projectId: auth.projectId,
    appUserId: endUser,
    settings,
    estimatedTokens: estimatedInput + maxTokens,
  });
  if (budget.exceeded) {
    const message = budget.scope === "per_user"
      ? "Per-user token budget exceeded"
      : "Project token budget exceeded";
    await audit({ projectId: auth.projectId, op: "chat", userId: auth.userId, status: "denied", errorCode: "BUDGET_EXCEEDED", durationMs: Date.now() - started });
    return jsonError(c, 402, "BUDGET_EXCEEDED", message);
  }

  const shouldStream = parsed.stream !== false;
  const provider = aiConfig?.provider;
  const githubToken = aiConfig?.githubToken;
  // thinking-visibility = "hide" → strip <think>…</think> server-side using
  // the same util the SDK ships, so the app never sees the reasoning even in
  // DevTools. "hide" is the OOB DEFAULT: generated chatbot apps never leak the
  // model's raw reasoning to end users unless an admin explicitly opts into the
  // in-app disclosure by setting "auto" or "always-show". "auto" and
  // "always-show" pass through unchanged; the app is then expected to render
  // thinking inside a <details> disclosure or inline. Hidden mode also enforces
  // the spec's "ask again → thinking section is gone entirely" expectation.
  const hideThinking = settings.thinkingVisibility === "hide";

  if (!shouldStream) {
    let content = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let err: string | null = null;
    try {
      for await (const ev of chatExecutor({ provider, githubToken, model, messages, max_tokens: maxTokens, stream: false })) {
        if (ev.type === "text_delta" && typeof ev.data === "string") content += ev.data;
        else if (ev.type === "done" && ev.data && typeof ev.data === "object") {
          const u = (ev.data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
          // Use `||` not `??`: smaller models / providers stream a final
          // usage frame of {0,0} (no stream_options.include_usage), and `??`
          // would keep those zeros — logging runtime-chat usage as 0 tokens.
          // `||` falls back to a local estimate whenever the upstream count
          // is absent OR zero, so per-project/user metering stays accurate.
          promptTokens = u?.prompt_tokens || estimateTokens(messages.map((m) => m.content).join(" "));
          completionTokens = u?.completion_tokens || estimateTokens(content);
        } else if (ev.type === "error" && typeof ev.data === "string") {
          err = ev.data;
        }
      }
    } catch (e) {
      err = (e as Error).message;
    }
    if (hideThinking) {
      // One-shot pass on the assembled content.
      const stripper = createThinkingStripper();
      const out = stripper.push(content);
      const tail = stripper.flush();
      content = (out.visible + tail.visible).trim();
    }
    const durationMs = Date.now() - started;
    if (err) {
      await audit({ projectId: auth.projectId, op: "chat", userId: auth.userId, status: "error", errorCode: "PROVIDER_ERROR", durationMs });
      return jsonError(c, 503, "PROVIDER_ERROR", err);
    }
    await recordUsage({
      auth, op: "chat", model,
      promptTokens, completionTokens,
      durationMs, appUserId: endUser,
    });
    flagAbuseAsync(auth.projectId, promptTokens + completionTokens);
    await audit({ projectId: auth.projectId, op: "chat", userId: auth.userId, status: "ok", durationMs });
    return c.json({
      ok: true,
      content,
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
      elapsed_ms: durationMs,
    });
  }

  // Streaming SSE — mirror routes/chat/send-handler.ts streaming pattern.
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify({ type: "status", data: { phase: "thinking" } }) });
    let content = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let providerError: string | null = null;
    // Server-side thinking stripper (only used when visibility=hide). For
    // "auto"/"always-show" we pass deltas through verbatim and the SDK on
    // the client renders the disclosure.
    const stripper = hideThinking ? createThinkingStripper() : null;
    try {
      for await (const ev of chatExecutor({ provider, githubToken, model, messages, max_tokens: maxTokens, stream: true })) {
        if (ev.type === "text_delta" && typeof ev.data === "string") {
          content += ev.data;
          let toSend = ev.data;
          if (stripper) {
            const r = stripper.push(ev.data);
            toSend = r.visible;
          }
          if (toSend.length > 0) {
            await stream.writeSSE({ data: JSON.stringify({ type: "text_delta", data: toSend }) });
          }
        } else if (ev.type === "done" && ev.data && typeof ev.data === "object") {
          const u = (ev.data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
          // Use `||` not `??`: smaller models / providers stream a final
          // usage frame of {0,0} (no stream_options.include_usage), and `??`
          // would keep those zeros — logging runtime-chat usage as 0 tokens.
          // `||` falls back to a local estimate whenever the upstream count
          // is absent OR zero, so per-project/user metering stays accurate.
          promptTokens = u?.prompt_tokens || estimateTokens(messages.map((m) => m.content).join(" "));
          completionTokens = u?.completion_tokens || estimateTokens(content);
        } else if (ev.type === "error" && typeof ev.data === "string") {
          providerError = ev.data;
        }
      }
    } catch (err) {
      providerError = (err as Error).message ?? String(err);
    }
    // Flush any buffered partial thinking opener (e.g. "<th" that never
    // closed). When hiding, we DROP these tails entirely — they're either
    // not really a tag or a malformed one we don't want to risk leaking.
    if (stripper) {
      // Intentionally NOT calling stripper.flush() — its return value
      // includes the buffered tail, which may contain partial thinking
      // content. Hidden mode prefers a possibly-truncated answer over a
      // leak. (For the non-streaming branch the entire content is fed in
      // one push() and the tail can't be split, so flush() is safe.)
    }
    const durationMs = Date.now() - started;
    if (providerError) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", data: providerError }) });
      await stream.writeSSE({ data: "[DONE]" });
      await audit({ projectId: auth.projectId, op: "chat", userId: auth.userId, status: "error", errorCode: "PROVIDER_ERROR", durationMs });
      return;
    }
    await recordUsage({
      auth, op: "chat", model,
      promptTokens, completionTokens,
      durationMs, appUserId: endUser,
    });
    flagAbuseAsync(auth.projectId, promptTokens + completionTokens);
    await audit({ projectId: auth.projectId, op: "chat", userId: auth.userId, status: "ok", durationMs });
    await stream.writeSSE({
      data: JSON.stringify({
        type: "done",
        data: {
          finish_reason: "stop",
          usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
          elapsed_ms: durationMs,
        },
      }),
    });
    await stream.writeSSE({ data: "[DONE]" });
  });
});

// ── /embed handler ───────────────────────────────────────────────────────

aiProxyRoutes.post("/__doable/ai/embed", async (c) => {
  const started = Date.now();
  const auth = await resolveAuth(c);
  if (auth instanceof Response) return auth;

  if (toolNotAllowed(auth, "embed")) {
    return jsonError(c, 403, "TOOL_NOT_ALLOWED", "This API key may not call ai.embed");
  }

  let max: number | null = auth.rateLimit;
  try { max = await getEffectiveRateLimit(auth.projectId, auth.rateLimit); } catch { /* use default */ }
  if (!rateLimitOk(auth.projectId, max)) {
    return jsonError(c, 429, "RATE_LIMITED", "Per-project rate limit exceeded");
  }

  let body: Record<string, unknown>;
  try { body = (await c.req.json()) as Record<string, unknown>; } catch { body = {}; }
  const parsed = parseEmbedBody(c, body);
  if (parsed instanceof Response) return parsed;

  const settings = await (settingsResolver ?? getProjectAiSettings)(auth.projectId);
  if (!settings.enabled) {
    return jsonError(c, 503, "AI_DISABLED_FOR_PROJECT", "Doable AI is disabled for this project");
  }

  // Embedding-specific resolver — different from chat. Walks project →
  // workspace → platform-default (set in /setup or /admin/embedding-provider).
  // `embedding_model_override` (096) wins over `embedding_model` (095) so the
  // Doable AI tab can rebind a project to a new model without dropping the
  // legacy column (which may still be used by older project_ai_settings rows).
  const effectiveEmbeddingModel =
    settings.embeddingModelOverride ?? settings.embeddingModel;
  const embedConfig = await (embeddingResolver ?? resolveEmbeddingEngine)(auth.projectId, {
    embeddingProviderId: settings.embeddingProviderId,
    embeddingModel: effectiveEmbeddingModel,
  }).catch((err) => {
    console.error("[ai-proxy] embedding resolve failed:", err);
    return null;
  });
  if (!embedConfig) {
    return jsonError(
      c,
      503,
      "EMBEDDING_NOT_CONFIGURED",
      "No embedding provider configured. Set one in /setup or /admin/ai-settings.",
    );
  }
  const model = embedConfig.model || DOABLE_APP_AI_DEFAULT_EMBED_MODEL;
  const provider = embedConfig.provider;

  const endUser = appUserId(c, auth);
  const estimated = parsed.texts.reduce((acc, t) => acc + estimateTokens(t), 0);
  const budget = await checkBudgetExceeded({
    projectId: auth.projectId,
    appUserId: endUser,
    settings,
    estimatedTokens: estimated,
  });
  if (budget.exceeded) {
    await audit({ projectId: auth.projectId, op: "embed", userId: auth.userId, status: "denied", errorCode: "BUDGET_EXCEEDED", durationMs: Date.now() - started });
    return jsonError(c, 402, "BUDGET_EXCEEDED",
      budget.scope === "per_user" ? "Per-user token budget exceeded" : "Project token budget exceeded");
  }

  try {
    const result = await embedExecutor({ provider, model, texts: parsed.texts });
    const durationMs = Date.now() - started;
    await recordUsage({
      auth, op: "embed", model: result.model,
      promptTokens: result.prompt_tokens || estimated,
      completionTokens: 0,
      durationMs, appUserId: endUser,
      embedDims: result.dimensions,
    });
    flagAbuseAsync(auth.projectId, result.prompt_tokens || estimated);
    await audit({ projectId: auth.projectId, op: "embed", userId: auth.userId, status: "ok", durationMs });
    return c.json({
      ok: true,
      vectors: result.vectors,
      model: result.model,
      dimensions: result.dimensions,
      elapsed_ms: durationMs,
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    await audit({ projectId: auth.projectId, op: "embed", userId: auth.userId, status: "error", errorCode: "PROVIDER_ERROR", durationMs });
    return c.json({
      ok: false,
      error: { code: "PROVIDER_ERROR", message: (err as Error).message ?? String(err) },
      elapsed_ms: durationMs,
    }, 503);
  }
});

// ── CORS preflight ───────────────────────────────────────────────────────

aiProxyRoutes.options("/__doable/ai/*", (c) =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, authorization, x-doable-app-user",
      "Access-Control-Max-Age": "86400",
    },
  }),
);
