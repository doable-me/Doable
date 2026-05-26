/**
 * /api/setup/* — In-app setup wizard endpoints.
 *
 * All routes require:
 *   - authMiddleware (valid session)
 *   - platformAdminMiddleware (platform admin only)
 *   - CSRF protection via Bearer JWT (standard SPA pattern — no separate CSRF token needed)
 *
 * SECURITY: Secret values are stored ENCRYPTED via setEncryptedConfig().
 * GET /api/setup/status NEVER returns actual secret values — always masked.
 * NEVER log decrypted secrets or API keys.
 */

import { Hono } from "hono";
import { z } from "zod";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { authMiddleware, type AuthEnv } from "../middleware/auth.js";
import { platformAdminMiddleware } from "../middleware/platform-admin.js";
import {
  getConfig,
  setConfig,
  setEncryptedConfig,
  getEncryptedConfig,
} from "../lib/platformConfig.js";
import { recordAdminAction } from "../admin/audit-log.js";
import { sql } from "../db/index.js";
import { ENCRYPTION_KEY } from "../lib/secrets.js";
import { DOABLE_APP_AI_DEFAULT_EMBED_DIMS } from "../ai/runtime-config.js";

export const setupRoutes = new Hono<AuthEnv>({ strict: false });

// ─── Auth + admin guard on all setup routes ────────────────────────────────
setupRoutes.use("*", authMiddleware);
setupRoutes.use("*", platformAdminMiddleware);

// ─── Schemas ───────────────────────────────────────────────────────────────

// Accepts both the frontend's labels ("github_copilot", "byok") and the
// shorter internal labels ("copilot", "custom"). Normalized to internal form
// before storage so /admin/integrations sees a consistent value.
const aiProviderSchema = z.object({
  provider: z
    .enum(["anthropic", "openai", "copilot", "custom", "github_copilot", "byok"])
    .transform((v) => (v === "github_copilot" ? "copilot" : v === "byok" ? "custom" : v)),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  model: z.string().min(1).max(120).optional(),
  // When true (default), the wizard also propagates this provider+model
  // into platform_ai_defaults so all 4 plans inherit it. Default=true is
  // wizard-friendly; out-of-band callers (CLI install, OOB seeding, replay
  // scripts) MUST send `false` to avoid silently overwriting plan defaults.
  setAsPlanDefault: z.boolean().optional().default(true),
  // Set when the wizard completes the inline Copilot OAuth popup. Without
  // these, the copilot branch only flips setup.ai_provider in platform_config
  // and chat still fails with "No model available" until the admin manually
  // binds an account via /admin/ai-settings. With them, the handler also
  // writes workspace_ai_settings + platform_ai_defaults so chat works the
  // moment the wizard finishes.
  copilotAccountId: z.string().uuid().optional(),
  copilotModel: z.string().min(1).max(120).optional(),
});

// Platform-default embedding provider. Set once during /setup (or later in
// /admin/embedding-provider). All workspaces inherit it silently — end users
// never see embedding-model UI. Mirrors aiProviderSchema's shape (provider
// type, base URL, key, model) but with an embeddings-only validator.
const aiEmbeddingProviderSchema = z.object({
  provider: z
    .enum(["openai", "gemini", "custom"])
    // gemini is OpenAI-compatible at https://generativelanguage.googleapis.com/v1beta/openai
    // — treat it as 'openai' downstream so engine-resolver + embedding-resolver
    // don't need a third code path.
    .transform((v) => (v === "gemini" ? "openai" : v === "custom" ? "openai" : v)),
  apiKey: z.string().min(1),
  baseUrl: z.string().url(),
  model: z.string().min(1).max(120),
  // Auto-bind as the workspace default for the admin's workspace too so the
  // admin's own projects immediately have embeddings available. Defaults
  // true; out-of-band callers may pass false.
  bindToAdminWorkspace: z.boolean().optional().default(true),
});

const oauthSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const supabaseSchema = z.object({
  url: z.string().url(),
  serviceRoleKey: z.string().min(1),
});

const workspaceNameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const billingSchema = z.object({
  stripeSecretKey: z.string().min(1).optional(),
  stripeWebhookSecret: z.string().min(1).optional(),
  stripeProMonthlyPriceId: z.string().min(1).optional(),
  stripeBusinessMonthlyPriceId: z.string().min(1).optional(),
});

const signupPolicySchema = z.object({
  requireApproval: z.boolean(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Masks any truthy string value with bullet characters. */
function masked(value: string | null | undefined): string | null {
  return value ? "••••••••" : null;
}

/** Quick liveness check against a provider's models endpoint. */
async function validateAiProvider(
  provider: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    let url: string;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (provider === "anthropic") {
      url = "https://api.anthropic.com/v1/models";
      if (apiKey) {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      }
    } else if (provider === "openai") {
      url = (baseUrl ? `${baseUrl.replace(/\/$/, "")}/models` : "https://api.openai.com/v1/models");
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    } else if (provider === "copilot") {
      // GitHub Copilot uses OAuth — skip key validation, just accept.
      return { valid: true };
    } else {
      // custom — if baseUrl provided try GET /models
      if (!baseUrl) return { valid: true };
      url = `${baseUrl.replace(/\/$/, "")}/models`;
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(8000) });
    if (res.ok || res.status === 401) {
      // 401 means the endpoint exists but the key is wrong — still "valid" URL
      return res.ok
        ? { valid: true }
        : { valid: false, error: "Invalid API key — provider returned 401" };
    }
    return { valid: false, error: `Provider returned HTTP ${res.status}` };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

// ─── POST /api/setup/ai-provider ──────────────────────────────────────────
// Saves the wizard's AI-provider choice to platform_config (UI display state)
// AND — for BYOK providers — creates an `ai_providers` row in the admin's
// workspace + binds it as the workspace default via `workspace_ai_settings`.
// Without that binding, the chat handler's engine-resolver finds no provider
// and the SDK errors with "Session was not created with authentication info
// or custom provider" even though the wizard "saved" the key.
setupRoutes.post("/ai-provider", async (c) => {
  const parsed = aiProviderSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { provider, apiKey, baseUrl, model, setAsPlanDefault, copilotAccountId, copilotModel } = parsed.data;

  if (apiKey) {
    const check = await validateAiProvider(provider, apiKey, baseUrl);
    if (!check.valid) {
      return c.json({ error: check.error ?? "Provider validation failed" }, 422);
    }
  }

  const userId = c.get("userId");

  // Store provider name + model plain, key + baseUrl encrypted
  await setConfig("setup.ai_provider", provider, { updatedBy: userId });
  if (apiKey) {
    await setEncryptedConfig("setup.ai_provider_key", apiKey, userId);
  }
  if (baseUrl) {
    await setConfig("setup.ai_provider_base_url", baseUrl, { updatedBy: userId });
  }
  if (model) {
    await setConfig("setup.ai_model", model, { updatedBy: userId });
  }

  // Bind to the admin's workspace so the chat handler's engine-resolver finds a usable provider.
  // Skip for "copilot" — that path uses github_copilot_accounts via OAuth.
  if (apiKey && provider !== "copilot") {
    try {
      // ai_provider_type enum is openai|azure|anthropic. Map our "custom"
      // (OpenAI-compatible BYOK) to "openai" so the column accepts it.
      const providerType: "openai" | "azure" | "anthropic" =
        provider === "anthropic" ? "anthropic" : "openai";
      const resolvedBaseUrl =
        baseUrl ||
        (provider === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com/v1");
      const providerLabel = model ? `${provider} ${model}` : provider;

      const [adminWorkspace] = await sql<{ id: string }[]>`
        SELECT w.id FROM workspaces w
        JOIN workspace_members m ON m.workspace_id = w.id
        WHERE m.user_id = ${userId} AND m.role IN ('owner', 'admin')
        ORDER BY w.created_at LIMIT 1
      `;
      if (adminWorkspace) {
        const [existing] = await sql<{ id: string }[]>`
          SELECT id FROM ai_providers
          WHERE workspace_id = ${adminWorkspace.id} AND label = ${providerLabel} AND scope = 'workspace'
          LIMIT 1
        `;
        let providerId: string;
        if (existing) {
          await sql`
            UPDATE ai_providers
            SET encrypted_api_key = pgp_sym_encrypt(${apiKey}, ${ENCRYPTION_KEY}),
                provider_type = ${providerType}::ai_provider_type,
                base_url = ${resolvedBaseUrl},
                is_valid = true,
                updated_at = now()
            WHERE id = ${existing.id}
          `;
          providerId = existing.id;
        } else {
          const [created] = await sql<{ id: string }[]>`
            INSERT INTO ai_providers (
              workspace_id, label, provider_type, base_url,
              encrypted_api_key, is_valid, added_by, scope
            ) VALUES (
              ${adminWorkspace.id}, ${providerLabel}, ${providerType}::ai_provider_type,
              ${resolvedBaseUrl}, pgp_sym_encrypt(${apiKey}, ${ENCRYPTION_KEY}),
              true, ${userId}, 'workspace'::ai_account_scope
            ) RETURNING id
          `;
          if (!created) throw new Error("ai_providers INSERT returned no row");
          providerId = created.id;
        }
        // Write the user-typed model verbatim. The historic "rewrite to gpt-4o
        // for SDK compatibility" branch corrupted the upstream call for any BYOK
        // model outside a hardcoded allowlist (e.g. MiniMax-M2.7 → 400 unknown
        // model 'gpt-4o' from the provider). No SDK session-creation gate
        // actually enforces that allowlist; the field is the upstream model name.
        //
        // Migration 042 split the legacy `default_model` column into per-source
        // slots: `default_copilot_model` and `default_provider_model`. The
        // engine-resolver (ai/engine-resolver.ts:106-108) only reads
        // `default_provider_model` for source='custom'. Writing to the legacy
        // `default_model` column made the wizard appear to succeed but the
        // chat handler resolved model=null → "No model available" SDK error.
        // Always write to `default_provider_model` for the BYOK path.
        const storedModel = model ?? null;
        // Mirror the wizard pick into the suggestion slot. A BYOK-only install
        // has no copilot account, so the default suggestion_source='copilot'
        // would make inline suggestions fail with "No model available".
        // Admins can rebind separately via /admin/ai-settings.
        await sql`
          INSERT INTO workspace_ai_settings (
            workspace_id,
            default_provider_id, default_provider_model, default_source,
            suggestion_provider_id, suggestion_provider_model, suggestion_source,
            updated_by
          ) VALUES (
            ${adminWorkspace.id},
            ${providerId}, ${storedModel}, 'custom',
            ${providerId}, ${storedModel}, 'custom',
            ${userId}
          )
          ON CONFLICT (workspace_id) DO UPDATE SET
            default_provider_id = EXCLUDED.default_provider_id,
            default_provider_model = EXCLUDED.default_provider_model,
            default_copilot_model = NULL,
            default_copilot_account_id = NULL,
            default_source = 'custom',
            suggestion_provider_id = EXCLUDED.suggestion_provider_id,
            suggestion_provider_model = EXCLUDED.suggestion_provider_model,
            suggestion_copilot_model = NULL,
            suggestion_copilot_account_id = NULL,
            suggestion_source = 'custom',
            updated_by = EXCLUDED.updated_by
        `;

        // platform_ai_defaults is pre-seeded with the 4 plan rows by
        // migration 056. But that seed can be missing on installs that lost
        // it (TRUNCATE cascades, OOB resets, half-applied migrations on
        // long-lived boxes). Use UPSERT so the wizard always populates
        // defaults for all 4 plans even when rows weren't pre-seeded.
        if (setAsPlanDefault) {
          for (const plan of ["free", "pro", "business", "enterprise"]) {
            await sql`
              INSERT INTO platform_ai_defaults (
                plan, source, provider_id, provider_model,
                copilot_account_id, copilot_model, updated_by
              ) VALUES (
                ${plan}, 'custom', ${providerId}, ${storedModel},
                NULL, NULL, ${userId}
              )
              ON CONFLICT (plan) DO UPDATE SET
                source = 'custom',
                provider_id = EXCLUDED.provider_id,
                provider_model = EXCLUDED.provider_model,
                copilot_account_id = NULL,
                copilot_model = NULL,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            `;
          }
        }
      }
    } catch (err) {
      // Hard failure — plan defaults missing will break chat for all non-admin users.
      console.error("[setup] Failed to insert platform_ai_defaults:", err);
      const detail = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: "PLAN_DEFAULTS_INSERT_FAILED", detail }, 500);
    }
  }

  // ─── Copilot path: inline OAuth handshake completed in the wizard ────
  // The frontend has already POSTed to /workspaces/:wid/ai-settings/copilot-accounts
  // (via the popup callback) so the account row + encrypted token exist.
  // Here we bind that account + a default copilot_model into
  // workspace_ai_settings, and (if setAsPlanDefault) into platform_ai_defaults
  // for all 4 plans. Without this binding the chat handler's engine-resolver
  // would still resolve source='custom'/null and fail with "No model available"
  // even after the OAuth handshake "succeeded".
  if (provider === "copilot" && copilotAccountId && copilotModel) {
    try {
      const [adminWorkspace] = await sql<{ id: string }[]>`
        SELECT w.id FROM workspaces w
        JOIN workspace_members m ON m.workspace_id = w.id
        WHERE m.user_id = ${userId} AND m.role IN ('owner', 'admin')
        ORDER BY w.created_at LIMIT 1
      `;
      if (adminWorkspace) {
        await sql`
          INSERT INTO workspace_ai_settings (
            workspace_id,
            default_copilot_account_id, default_copilot_model, default_source,
            suggestion_copilot_account_id, suggestion_copilot_model, suggestion_source,
            updated_by
          ) VALUES (
            ${adminWorkspace.id},
            ${copilotAccountId}::uuid, ${copilotModel}, 'copilot',
            ${copilotAccountId}::uuid, ${copilotModel}, 'copilot',
            ${userId}
          )
          ON CONFLICT (workspace_id) DO UPDATE SET
            default_copilot_account_id = EXCLUDED.default_copilot_account_id,
            default_copilot_model = EXCLUDED.default_copilot_model,
            default_provider_id = NULL,
            default_provider_model = NULL,
            default_source = 'copilot',
            suggestion_copilot_account_id = EXCLUDED.suggestion_copilot_account_id,
            suggestion_copilot_model = EXCLUDED.suggestion_copilot_model,
            suggestion_provider_id = NULL,
            suggestion_provider_model = NULL,
            suggestion_source = 'copilot',
            updated_by = EXCLUDED.updated_by
        `;

        if (setAsPlanDefault) {
          for (const plan of ["free", "pro", "business", "enterprise"]) {
            await sql`
              INSERT INTO platform_ai_defaults (
                plan, source, provider_id, provider_model,
                copilot_account_id, copilot_model, updated_by
              ) VALUES (
                ${plan}, 'copilot', NULL, NULL,
                ${copilotAccountId}::uuid, ${copilotModel}, ${userId}
              )
              ON CONFLICT (plan) DO UPDATE SET
                source = 'copilot',
                provider_id = NULL,
                provider_model = NULL,
                copilot_account_id = EXCLUDED.copilot_account_id,
                copilot_model = EXCLUDED.copilot_model,
                updated_by = EXCLUDED.updated_by,
                updated_at = now()
            `;
          }
        }
      }
    } catch (err) {
      console.error("[setup] Failed to bind copilot account to workspace:", err);
      const detail = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: "COPILOT_BINDING_FAILED", detail }, 500);
    }
  }

  recordAdminAction(c, {
    action: "setup_save_ai_provider",
    details: { provider, model: model ?? null, copilotModel: copilotModel ?? null },
  }).catch(() => {});

  return c.json({ ok: true });
});

// ─── Embedding provider helpers ────────────────────────────────────────────
//
// The platform-default embedding provider lives in TWO places:
//   1) platform_config.setup.embedding_*  → the platform fallback that every
//      workspace inherits silently (read by embedding-resolver.ts when no
//      workspace/project override exists).
//   2) ai_providers (scope=workspace, role='embedding') + bound onto the
//      admin's workspace_ai_settings.default_embedding_provider_id  →ensures
//      the admin's OWN projects already have embeddings working without an
//      additional workspace-level configuration step.
//
// Both writes happen in one transaction-ish flow. (1) is the source of truth
// for inheritance; (2) is a convenience so the admin's first project works.

async function probeEmbeddingEndpoint(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ ok: true; dims: number } | { ok: false; error: string }> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/embeddings`;
    // Mirror defaultEmbedExecutor (ai-proxy.ts): request a capped output
    // dimensionality so the probe validates the SAME vector size the runtime
    // will actually store. Keeps generated apps' pgvector ivfflat/hnsw
    // indexes (2000-dim limit) valid even when a model defaults higher
    // (e.g. gemini-embedding-001 → 3072). Retry without the param for models
    // that don't support output-dimension reduction.
    const requestedDims = DOABLE_APP_AI_DEFAULT_EMBED_DIMS;
    const probe = (includeDims: boolean) =>
      fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(
          includeDims && requestedDims > 0
            ? { model, input: "doable embedding self-test", dimensions: requestedDims }
            : { model, input: "doable embedding self-test" },
        ),
        signal: AbortSignal.timeout(10_000),
      });
    let res = await probe(true);
    if (!res.ok && (res.status === 400 || res.status === 422) && requestedDims > 0) {
      res = await probe(false);
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const dims = json.data?.[0]?.embedding?.length ?? 0;
    if (!dims) return { ok: false, error: "Provider returned no embedding vector" };
    return { ok: true, dims };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Shared logic for storing the platform-default embedding provider. Called
 * from /api/setup/ai-embedding-provider (initial install) AND from
 * /admin/embedding-provider (post-install edits). Returns { ok:false,error }
 * for clean error mapping in the handler.
 */
export async function savePlatformEmbeddingProvider(opts: {
  userId: string;
  provider: "openai" | "anthropic";
  apiKey: string;
  baseUrl: string;
  model: string;
  bindToAdminWorkspace: boolean;
}): Promise<{ ok: true; providerId: string | null; dims: number } | { ok: false; error: string }> {
  const probe = await probeEmbeddingEndpoint(opts.baseUrl, opts.apiKey, opts.model);
  if (!probe.ok) {
    return { ok: false, error: probe.error };
  }

  // 1) Persist the platform-config fallback (encrypted key, plain everything
  // else). embedding-resolver.ts reads these on every /__doable/ai/embed call
  // when no workspace/project override exists.
  await setConfig("setup.embedding_provider", opts.provider, { updatedBy: opts.userId });
  await setConfig("setup.embedding_base_url", opts.baseUrl, { updatedBy: opts.userId });
  await setConfig("setup.embedding_model", opts.model, { updatedBy: opts.userId });
  await setEncryptedConfig("setup.embedding_api_key", opts.apiKey, opts.userId);

  // 2) Mirror into ai_providers + workspace_ai_settings for the admin's
  // workspace so /admin/ai-settings can list it like any other workspace
  // provider, AND so the admin's own projects work out-of-the-box.
  let providerId: string | null = null;
  if (opts.bindToAdminWorkspace) {
    try {
      const [adminWorkspace] = await sql<{ id: string }[]>`
        SELECT w.id FROM workspaces w
        JOIN workspace_members m ON m.workspace_id = w.id
        WHERE m.user_id = ${opts.userId} AND m.role IN ('owner', 'admin')
        ORDER BY w.created_at LIMIT 1
      `;
      if (adminWorkspace) {
        const label = `${opts.provider} embeddings (${opts.model})`;
        const [existing] = await sql<{ id: string }[]>`
          SELECT id FROM ai_providers
          WHERE workspace_id = ${adminWorkspace.id}
            AND scope = 'workspace'
            AND role IN ('embedding', 'both')
          ORDER BY updated_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        `;
        if (existing) {
          await sql`
            UPDATE ai_providers
            SET encrypted_api_key = pgp_sym_encrypt(${opts.apiKey}, ${ENCRYPTION_KEY}),
                provider_type = ${opts.provider}::ai_provider_type,
                base_url = ${opts.baseUrl},
                role = 'embedding',
                label = ${label},
                is_valid = true,
                updated_at = now()
            WHERE id = ${existing.id}
          `;
          providerId = existing.id;
        } else {
          const [created] = await sql<{ id: string }[]>`
            INSERT INTO ai_providers (
              workspace_id, label, provider_type, base_url,
              encrypted_api_key, is_valid, added_by, scope, role
            ) VALUES (
              ${adminWorkspace.id}, ${label}, ${opts.provider}::ai_provider_type,
              ${opts.baseUrl}, pgp_sym_encrypt(${opts.apiKey}, ${ENCRYPTION_KEY}),
              true, ${opts.userId}, 'workspace'::ai_account_scope, 'embedding'
            ) RETURNING id
          `;
          providerId = created?.id ?? null;
        }
        if (providerId) {
          await sql`
            INSERT INTO workspace_ai_settings (
              workspace_id, default_embedding_provider_id, default_embedding_model, updated_by
            ) VALUES (
              ${adminWorkspace.id}, ${providerId}, ${opts.model}, ${opts.userId}
            )
            ON CONFLICT (workspace_id) DO UPDATE SET
              default_embedding_provider_id = EXCLUDED.default_embedding_provider_id,
              default_embedding_model       = EXCLUDED.default_embedding_model,
              updated_by                    = EXCLUDED.updated_by
          `;
        }
      }
    } catch (err) {
      // Non-fatal: platform_config write is the inheritance source-of-truth.
      // Workspace-binding failures still leave embeddings working for every
      // workspace via the platform fallback path.
      console.warn("[setup] embedding provider workspace bind failed:", err);
    }
  }

  return { ok: true, providerId, dims: probe.dims };
}

// ─── POST /api/setup/ai-embedding-provider ────────────────────────────────
// Saves the platform-default embedding provider during the install wizard.
// One-shot configuration that every workspace inherits — end users never
// see embedding-model UI. Validates the key against the provider's
// /embeddings endpoint before persisting.
setupRoutes.post("/ai-embedding-provider", async (c) => {
  const parsed = aiEmbeddingProviderSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const userId = c.get("userId");
  const { provider, apiKey, baseUrl, model, bindToAdminWorkspace } = parsed.data;

  const saved = await savePlatformEmbeddingProvider({
    userId,
    provider: provider as "openai" | "anthropic",
    apiKey,
    baseUrl,
    model,
    bindToAdminWorkspace,
  });
  if (!saved.ok) {
    return c.json({ ok: false, error: "EMBEDDING_PROBE_FAILED", detail: saved.error }, 422);
  }

  recordAdminAction(c, {
    action: "setup_save_ai_embedding_provider",
    details: { provider, model, baseUrl, dims: saved.dims },
  }).catch(() => {});

  return c.json({ ok: true, providerId: saved.providerId, dimensions: saved.dims });
});

// ─── POST /api/setup/oauth/google ─────────────────────────────────────────
setupRoutes.post("/oauth/google", async (c) => {
  const parsed = oauthSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { clientId, clientSecret } = parsed.data;
  const userId = c.get("userId");

  await setConfig("setup.google_client_id", clientId, { updatedBy: userId });
  await setEncryptedConfig("setup.google_client_secret", clientSecret, userId);

  recordAdminAction(c, {
    action: "setup_save_google_oauth",
    details: { clientId },
  }).catch(() => {});

  return c.json({ ok: true });
});

// ─── POST /api/setup/oauth/github ─────────────────────────────────────────
setupRoutes.post("/oauth/github", async (c) => {
  const parsed = oauthSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { clientId, clientSecret } = parsed.data;
  const userId = c.get("userId");

  await setConfig("setup.github_client_id", clientId, { updatedBy: userId });
  await setEncryptedConfig("setup.github_client_secret", clientSecret, userId);

  recordAdminAction(c, {
    action: "setup_save_github_oauth",
    details: { clientId },
  }).catch(() => {});

  return c.json({ ok: true });
});

// ─── POST /api/setup/oauth/supabase ──────────────────────────────────────
// Admin pastes Supabase OAuth APP credentials (client_id + client_secret) so
// end users get a mid-build "Authorize Doable to provision Supabase" consent
// prompt. Saves to both platform_config (so /setup/status surfaces it) and
// oauth_apps with workspace_id=NULL (platform-wide) so the existing
// integrations-oauth.ts flow at oauthApps.get() picks it up for every
// workspace without any additional wiring. Env-var fallback in
// credential-vault stays as the secondary source.
setupRoutes.post("/oauth/supabase", async (c) => {
  const parsed = oauthSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { clientId, clientSecret } = parsed.data;
  const userId = c.get("userId");

  await setConfig("setup.supabase_oauth_client_id", clientId, { updatedBy: userId });
  await setEncryptedConfig("setup.supabase_oauth_client_secret", clientSecret, userId);

  // Mirror into oauth_apps (workspace_id=NULL, is_global=true → platform-wide)
  // under the integration_id the registry uses for Supabase mgmt OAuth so
  // integrations-oauth.ts oauthApps.get("supabase-mgmt") picks it up for
  // every workspace. oauth_apps has no partial-unique index on
  // (integration_id) where workspace_id IS NULL, so we DELETE-then-INSERT
  // to keep the global row authoritative without requiring a migration.
  try {
    await sql`
      DELETE FROM oauth_apps
      WHERE integration_id = 'supabase-mgmt' AND workspace_id IS NULL
    `;
    await sql`
      INSERT INTO oauth_apps (
        workspace_id, integration_id, client_id, client_secret_encrypted,
        credentials_format, extra_config, is_global
      ) VALUES (
        NULL, 'supabase-mgmt', ${clientId},
        pgp_sym_encrypt(${clientSecret}, ${ENCRYPTION_KEY}),
        'pgp_sym', '{}'::jsonb, true
      )
    `;
  } catch (err) {
    // Non-fatal: platform_config write already succeeded, and the
    // integrations-oauth route falls back to env vars when oauth_apps lookup
    // misses.
    console.warn("[setup/oauth/supabase] oauth_apps replace failed:", err);
  }

  recordAdminAction(c, {
    action: "setup_save_supabase_oauth",
    details: { clientId },
  }).catch(() => {});

  return c.json({ ok: true });
});

// ─── POST /api/setup/supabase ─────────────────────────────────────────────
setupRoutes.post("/supabase", async (c) => {
  const parsed = supabaseSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { url, serviceRoleKey } = parsed.data;
  const userId = c.get("userId");

  await setConfig("setup.supabase_url", url, { updatedBy: userId });
  await setEncryptedConfig("setup.supabase_service_role_key", serviceRoleKey, userId);

  recordAdminAction(c, {
    action: "setup_save_supabase",
    details: { url },
  }).catch(() => {});

  return c.json({ ok: true });
});

// ─── POST /api/setup/workspace-name ──────────────────────────────────────
setupRoutes.post("/workspace-name", async (c) => {
  const parsed = workspaceNameSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { name } = parsed.data;
  const userId = c.get("userId");

  // Store as a wizard-state value. The first workspace created during signup
  // is renamed lazily on next /admin/workspaces edit; persisting it here
  // gives the wizard a name to display without requiring schema changes.
  await setConfig("setup.workspace_name", name, { updatedBy: userId });

  recordAdminAction(c, {
    action: "setup_save_workspace_name",
    details: { name },
  }).catch(() => {});

  return c.json({ ok: true, name });
});

// ─── POST /api/setup/billing ──────────────────────────────────────────────
// Saves Stripe credentials so the operator can charge for paid plans. All
// fields optional — operator may save just the secret + webhook now and add
// price IDs later in /admin/billing.
setupRoutes.post("/billing", async (c) => {
  const parsed = billingSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { stripeSecretKey, stripeWebhookSecret, stripeProMonthlyPriceId, stripeBusinessMonthlyPriceId } = parsed.data;
  const userId = c.get("userId");

  if (stripeSecretKey) {
    await setEncryptedConfig("setup.stripe_secret_key", stripeSecretKey, userId);
  }
  if (stripeWebhookSecret) {
    await setEncryptedConfig("setup.stripe_webhook_secret", stripeWebhookSecret, userId);
  }
  // Price IDs are public, store plain
  if (stripeProMonthlyPriceId) {
    await setConfig("setup.stripe_pro_monthly_price_id", stripeProMonthlyPriceId, { updatedBy: userId });
  }
  if (stripeBusinessMonthlyPriceId) {
    await setConfig("setup.stripe_business_monthly_price_id", stripeBusinessMonthlyPriceId, { updatedBy: userId });
  }

  recordAdminAction(c, {
    action: "setup_save_billing",
    details: { has_secret: !!stripeSecretKey, has_webhook: !!stripeWebhookSecret },
  }).catch(() => {});

  return c.json({ ok: true });
});

// ─── POST /api/setup/signup-policy ────────────────────────────────────────
// Toggle whether new signups need admin approval. Stored in platform_config
// so the existing signupApproval helper picks it up without restart.
setupRoutes.post("/signup-policy", async (c) => {
  const parsed = signupPolicySchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { requireApproval } = parsed.data;
  const userId = c.get("userId");

  await setConfig(
    "setup.require_signup_approval",
    requireApproval,
    { updatedBy: userId },
  );

  recordAdminAction(c, {
    action: "setup_save_signup_policy",
    details: { requireApproval },
  }).catch(() => {});

  return c.json({ ok: true, requireApproval });
});

// ─── GET /api/setup/cloudflare/status ─────────────────────────────────────
// Server-side because cloudflared is a systemd service on the API host —
// the browser cannot probe it directly. Every probe falls back to a safe
// default so a missing tool never 500s the wizard.
async function probeBinary(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("which", [cmd], { stdio: "ignore" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

async function probeServiceActive(service: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("systemctl", ["is-active", service], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.on("close", () => resolve(out.trim() === "active"));
    child.on("error", () => resolve(false));
  });
}

setupRoutes.get("/cloudflare/status", async (c) => {
  const [binaryInstalled, serviceActive, configExists] = await Promise.all([
    probeBinary("cloudflared"),
    probeServiceActive("cloudflared"),
    fs
      .access("/etc/cloudflared/config.yml")
      .then(() => true)
      .catch(() => false),
  ]);

  let tunnelId: string | null = null;
  let tunnelHostname: string | null = null;
  if (configExists) {
    try {
      const cfg = await fs.readFile("/etc/cloudflared/config.yml", "utf-8");
      const idMatch = cfg.match(/^\s*tunnel:\s*([0-9a-f-]{36})\s*$/im);
      if (idMatch && idMatch[1]) tunnelId = idMatch[1];
      const hostMatch = cfg.match(/^\s*hostname:\s*([^\s]+)\s*$/m);
      if (hostMatch && hostMatch[1]) tunnelHostname = hostMatch[1];
    } catch {
      // ignore read errors — fall through with nulls
    }
  }

  const skipChoice = await getConfig("setup.cloudflare_skip");
  const skipped = skipChoice === true || skipChoice === "true";

  return c.json({
    binaryInstalled,
    serviceActive,
    tunnelConfigured: configExists,
    tunnelId,
    tunnelHostname,
    skipped,
    nextAction: !binaryInstalled
      ? "install_cloudflared"
      : !configExists
      ? "login_to_cloudflare"
      : !serviceActive
      ? "start_cloudflared_service"
      : "configured",
    loginUrl: "https://dash.cloudflare.com/?to=/:account/networks/tunnels",
  });
});

// ─── POST /api/setup/cloudflare ───────────────────────────────────────────
// Persist the operator's Cloudflare wizard choice. Two flows:
//   { action: "skip" }                  — operator chose direct ports 80/443
//   { action: "use_tunnel" }            — operator confirmed tunnel posture
const cloudflareChoiceSchema = z.object({
  action: z.enum(["skip", "use_tunnel"]),
});

setupRoutes.post("/cloudflare", async (c) => {
  const parsed = cloudflareChoiceSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { action } = parsed.data;
  const userId = c.get("userId");

  await setConfig("setup.cloudflare_skip", action === "skip", { updatedBy: userId });

  recordAdminAction(c, {
    action: "setup_save_cloudflare_choice",
    details: { action },
  }).catch(() => {});

  return c.json({ ok: true, action });
});

// ─── POST /api/setup/complete ─────────────────────────────────────────────
setupRoutes.post("/complete", async (c) => {
  const userId = c.get("userId");
  await setConfig("setup_completed_at", new Date().toISOString(), { updatedBy: userId });

  recordAdminAction(c, {
    action: "setup_completed",
  }).catch(() => {});

  return c.json({ ok: true });
});

// ─── GET /api/setup/status ────────────────────────────────────────────────
// Returns BOTH the wizard-facing camelCase contract (isPlatformAdmin,
// setupCompleted, workspaceName — used by WizardShell to gate access) AND
// the detailed snake_case shape used elsewhere. Secret values are NEVER
// returned in plaintext — always masked as bullet characters.
//
// Reaching this handler requires authMiddleware + platformAdminMiddleware
// (wildcard'd above), so any successful response implies the caller IS a
// platform admin — that's why isPlatformAdmin is always true here.
setupRoutes.get("/status", async (c) => {
  const [
    setupCompletedAt,
    workspaceName,
    aiProvider,
    aiProviderKey,
    googleClientId,
    googleClientSecret,
    githubClientId,
    githubClientSecret,
    supabaseUrl,
    supabaseKey,
    aiProviderBaseUrl,
    embeddingProvider,
    embeddingBaseUrl,
    embeddingModel,
    embeddingApiKey,
  ] = await Promise.all([
    getConfig("setup_completed_at"),
    getConfig("setup.workspace_name"),
    getConfig("setup.ai_provider"),
    getConfig("setup.ai_provider_key"),
    getConfig("setup.google_client_id"),
    getConfig("setup.google_client_secret"),
    getConfig("setup.github_client_id"),
    getConfig("setup.github_client_secret"),
    getConfig("setup.supabase_url"),
    getConfig("setup.supabase_service_role_key"),
    getConfig("setup.ai_provider_base_url"),
    getConfig("setup.embedding_provider"),
    getConfig("setup.embedding_base_url"),
    getConfig("setup.embedding_model"),
    getConfig("setup.embedding_api_key"),
  ]);

  const setupCompleted = !!(
    setupCompletedAt &&
    setupCompletedAt !== "null"
  );

  return c.json({
    // Wizard-facing contract (camelCase) — drives WizardShell access gate
    isPlatformAdmin: true,
    setupCompleted,
    workspaceName: typeof workspaceName === "string" ? workspaceName : null,

    // Detailed shape (snake_case) — used by admin pages / debugging
    setup_completed_at: setupCompletedAt ?? null,
    fields_configured: {
      ai_provider: !!(aiProvider && aiProvider !== "null"),
      ai_provider_key: !!(aiProviderKey && aiProviderKey !== "null"),
      google_oauth: !!(googleClientId && googleClientId !== "null"),
      github_oauth: !!(githubClientId && githubClientId !== "null"),
      supabase: !!(supabaseUrl && supabaseUrl !== "null"),
      embedding_provider: !!(embeddingProvider && embeddingProvider !== "null" && embeddingApiKey && embeddingApiKey !== "null"),
    },
    // Plain (non-secret) field values — safe to surface
    ai_provider: aiProvider ?? null,
    ai_provider_base_url: aiProviderBaseUrl ?? null,
    google_client_id: googleClientId ?? null,
    github_client_id: githubClientId ?? null,
    supabase_url: supabaseUrl ?? null,
    embedding_provider: embeddingProvider ?? null,
    embedding_base_url: embeddingBaseUrl ?? null,
    embedding_model: embeddingModel ?? null,
    // Masked secret indicators — NEVER plaintext
    ai_provider_key: masked(aiProviderKey as string),
    google_client_secret: masked(googleClientSecret as string),
    github_client_secret: masked(githubClientSecret as string),
    supabase_service_role_key: masked(supabaseKey as string),
    embedding_api_key: masked(embeddingApiKey as string),
  });
});
