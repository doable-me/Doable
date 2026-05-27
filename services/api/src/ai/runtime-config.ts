/**
 * Runtime AI data-plane configuration (PRD ChatBotInfra, ch00 §7).
 *
 * Mirrors the data-worker/config.ts pattern: env vars read ONCE at module
 * load time into frozen consts. The feature flag controls the entire
 * /__doable/ai/* surface — when off, the routes are not mounted at all
 * and there is no behavioural change anywhere else.
 */

// ─── Feature flag ────────────────────────────────────────────

/** Master switch — gates /__doable/ai/* mount and the AI prompt block. ON by default; set DOABLE_APP_AI_ENABLED=0 to disable. */
export const DOABLE_APP_AI_ENABLED: boolean =
  process.env.DOABLE_APP_AI_ENABLED !== "0";

// ─── Token / payload limits (per call) ───────────────────────

/** Default max input tokens per chat call. Project setting may override. */
export const DOABLE_APP_AI_MAX_INPUT_TOKENS: number = parseInt(
  process.env.DOABLE_APP_AI_MAX_INPUT_TOKENS ?? String(8_000),
  10,
);

/** Default max output tokens per chat call. Project setting may override. */
export const DOABLE_APP_AI_MAX_OUTPUT_TOKENS: number = parseInt(
  process.env.DOABLE_APP_AI_MAX_OUTPUT_TOKENS ?? String(2_000),
  10,
);

/** Max messages[] entries the caller may submit in a single chat call. */
export const DOABLE_APP_AI_MAX_MESSAGES: number = parseInt(
  process.env.DOABLE_APP_AI_MAX_MESSAGES ?? String(64),
  10,
);

/** Max number of texts in an embed batch request. */
export const DOABLE_APP_AI_MAX_EMBED_BATCH: number = parseInt(
  process.env.DOABLE_APP_AI_MAX_EMBED_BATCH ?? String(100),
  10,
);

/** Max length (chars) of a single text in an embed batch request. */
export const DOABLE_APP_AI_MAX_EMBED_CHARS: number = parseInt(
  process.env.DOABLE_APP_AI_MAX_EMBED_CHARS ?? String(8_192),
  10,
);

/** Default embedding model fallback. */
export const DOABLE_APP_AI_DEFAULT_EMBED_MODEL: string =
  process.env.DOABLE_APP_AI_DEFAULT_EMBED_MODEL ?? "text-embedding-3-small";

/** Default embedding dimensions for the fallback embed model. */
export const DOABLE_APP_AI_DEFAULT_EMBED_DIMS: number = parseInt(
  process.env.DOABLE_APP_AI_DEFAULT_EMBED_DIMS ?? String(1536),
  10,
);
