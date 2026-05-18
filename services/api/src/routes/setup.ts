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

  const { provider, apiKey, baseUrl, model, setAsPlanDefault } = parsed.data;

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
        const storedModel = model ?? null;
        await sql`
          INSERT INTO workspace_ai_settings (
            workspace_id, default_provider_id, default_model, default_source, updated_by
          ) VALUES (
            ${adminWorkspace.id}, ${providerId}, ${storedModel}, 'custom', ${userId}
          )
          ON CONFLICT (workspace_id) DO UPDATE SET
            default_provider_id = EXCLUDED.default_provider_id,
            default_model = EXCLUDED.default_model,
            default_source = 'custom',
            updated_by = EXCLUDED.updated_by
        `;

        // platform_ai_defaults has 4 pre-seeded rows (free/pro/business/
        // enterprise) from migration 056 — UPDATE in place, never INSERT.
        if (setAsPlanDefault) {
          await sql`
            UPDATE platform_ai_defaults
            SET source = 'custom',
                provider_id = ${providerId},
                provider_model = ${storedModel},
                copilot_account_id = NULL,
                copilot_model = NULL,
                updated_by = ${userId},
                updated_at = now()
            WHERE plan IN ('free', 'pro', 'business', 'enterprise')
          `;
        }
      }
    } catch (err) {
      // Non-fatal — platform_config still has the values; admin can rebind in /admin
      // later. Logged for ops follow-up.
      console.warn("[setup] Failed to bind BYOK provider into workspace_ai_settings:", err);
    }
  }

  recordAdminAction(c, {
    action: "setup_save_ai_provider",
    details: { provider, model: model ?? null },
  }).catch(() => {});

  return c.json({ ok: true });
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
    },
    // Plain (non-secret) field values — safe to surface
    ai_provider: aiProvider ?? null,
    ai_provider_base_url: aiProviderBaseUrl ?? null,
    google_client_id: googleClientId ?? null,
    github_client_id: githubClientId ?? null,
    supabase_url: supabaseUrl ?? null,
    // Masked secret indicators — NEVER plaintext
    ai_provider_key: masked(aiProviderKey as string),
    google_client_secret: masked(googleClientSecret as string),
    github_client_secret: masked(githubClientSecret as string),
    supabase_service_role_key: masked(supabaseKey as string),
  });
});
