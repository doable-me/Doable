/**
 * Seed the platform_config setup.* keys from environment variables at boot.
 *
 * Purpose: an admin who exports e.g. MINIMAX_API_KEY before running
 * docker/setup.sh shouldn't have to type the key again in the wizard. On first
 * boot we copy the key into platform_config (encrypted via setEncryptedConfig)
 * and pre-fill the matching provider / baseUrl / model so /setup/status reports
 * AI as already configured.
 *
 * Invariants:
 *   - Never overwrites a key that's already set. If setup.ai_provider_key has a
 *     value, we leave it alone — the admin already configured something.
 *   - Never logs the plaintext key.
 *   - Idempotent: safe to call on every boot.
 *   - Runs ONLY when DOABLE_KEK is available (the encrypt call would throw
 *     otherwise; we guard so the API still boots without a KEK in test).
 *
 * Provider precedence: the SOURCES array order. The first non-empty env
 * match wins. Operators set only the env var(s) for the providers whose
 * keys they actually hold — the wizard at /setup supports 50+ providers
 * regardless (PROVIDER_CATALOG in @doable/shared).
 *
 * NOTE: Doable does NOT bundle, ship, or proxy any third-party API keys.
 * Every key in this file is a BYOK (bring-your-own-key) seed — the
 * operator must obtain it from the provider themselves.
 *
 * To add a new env-seedable provider: append to SOURCES below. baseUrl is
 * required for "custom" provider type (every OpenAI-compatible endpoint).
 * Match the provider id (anthropic/openai/custom) and baseUrl to the entry
 * in packages/shared/src/ai/provider-data-*.ts so the wizard recognizes it.
 */

import { getConfig, setConfig, setEncryptedConfig } from "./platformConfig.js";
import { sql } from "../db/index.js";

interface SeedSource {
  envVar: string;
  provider: "anthropic" | "openai" | "custom";
  baseUrl?: string;
  model?: string;
  label: string; // for log lines, never the key
}

const SOURCES: readonly SeedSource[] = [
  // ─── Major cloud providers ──────────────────────────────────
  { envVar: "ANTHROPIC_API_KEY",   provider: "anthropic",                                                                model: "claude-sonnet-4-6",  label: "Anthropic Claude" },
  { envVar: "OPENAI_API_KEY",      provider: "openai",                                                                   model: "gpt-4o",             label: "OpenAI GPT-4o" },
  { envVar: "GEMINI_API_KEY",      provider: "custom",    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-2.5-pro", label: "Google Gemini" },

  // ─── Aggregators (one key → many models) ────────────────────
  { envVar: "OPENROUTER_API_KEY",  provider: "custom",    baseUrl: "https://openrouter.ai/api/v1",                        label: "OpenRouter" },
  { envVar: "TOGETHER_API_KEY",    provider: "custom",    baseUrl: "https://api.together.xyz/v1",                         label: "Together AI" },
  { envVar: "FIREWORKS_API_KEY",   provider: "custom",    baseUrl: "https://api.fireworks.ai/inference/v1",               label: "Fireworks AI" },
  { envVar: "OPENCODE_ZEN_API_KEY",provider: "custom",    baseUrl: "https://opencode.ai/zen/v1",                          label: "OpenCode Zen" },

  // ─── Specialty / fast-inference clouds ──────────────────────
  { envVar: "GROQ_API_KEY",        provider: "custom",    baseUrl: "https://api.groq.com/openai/v1",                      label: "Groq" },
  { envVar: "CEREBRAS_API_KEY",    provider: "custom",    baseUrl: "https://api.cerebras.ai/v1",                          label: "Cerebras" },
  { envVar: "DEEPSEEK_API_KEY",    provider: "custom",    baseUrl: "https://api.deepseek.com",                            label: "DeepSeek" },
  { envVar: "MISTRAL_API_KEY",     provider: "custom",    baseUrl: "https://api.mistral.ai/v1",                           label: "Mistral AI" },
  { envVar: "COHERE_API_KEY",      provider: "custom",    baseUrl: "https://api.cohere.ai/compatibility/v1",              label: "Cohere" },
  { envVar: "XAI_API_KEY",         provider: "custom",    baseUrl: "https://api.x.ai/v1",                                 label: "xAI Grok" },
  { envVar: "PERPLEXITY_API_KEY",  provider: "custom",    baseUrl: "https://api.perplexity.ai",                           label: "Perplexity" },
  { envVar: "DEEPINFRA_API_KEY",   provider: "custom",    baseUrl: "https://api.deepinfra.com/v1/openai",                 label: "DeepInfra" },
  { envVar: "NVIDIA_API_KEY",      provider: "custom",    baseUrl: "https://integrate.api.nvidia.com/v1",                 label: "NVIDIA NIM" },

  // ─── Regional clouds ────────────────────────────────────────
  { envVar: "MINIMAX_API_KEY",     provider: "custom",    baseUrl: "https://api.minimax.io/v1",                           model: "MiniMax-M2.7",       label: "MiniMax M2.7" },
  { envVar: "MOONSHOT_API_KEY",    provider: "custom",    baseUrl: "https://api.moonshot.ai/v1",                          label: "Moonshot/Kimi" },
  { envVar: "ZHIPU_API_KEY",       provider: "custom",    baseUrl: "https://open.bigmodel.cn/api/paas/v4",                label: "Zhipu GLM" },

  // ─── Tier 6: Local OpenAI-compatible (no key — base URL only) ─
  // These don't fit the api-key model; operators set baseUrl directly via
  // the wizard. Seeding from env would require a different "no-auth" path —
  // skipped here. (Ollama, LM Studio, vLLM, llama.cpp, Jan, LocalAI, etc.)
];

export async function seedAiProviderFromEnv(): Promise<void> {
  // If a key is already set in platform_config, don't touch it. The admin
  // already made a choice; env vars are bootstrap, not override.
  const existing = await getConfig("setup.ai_provider_key");
  if (existing && existing !== "null") {
    return;
  }

  const source = SOURCES.find((s) => {
    const v = process.env[s.envVar];
    return typeof v === "string" && v.trim().length > 0;
  });
  if (!source) return;

  const key = process.env[source.envVar];
  if (!key) return; // narrowing — find() guarantees non-empty above

  try {
    await setConfig("setup.ai_provider", source.provider);
    if (source.baseUrl) {
      await setConfig("setup.ai_provider_base_url", source.baseUrl);
    }
    if (source.model) {
      await setConfig("setup.ai_model", source.model);
    }
    await setEncryptedConfig("setup.ai_provider_key", key.trim());

    // Also upsert platform_ai_defaults for all 4 plans so that
    // applyPlatformAiDefault (called at first workspace creation) has a row
    // to work from. provider_id is left null here; platform-ai-bootstrap.ts
    // will create the ai_providers row in the target workspace on demand.
    if (source.model) {
      const providerModel = source.model;
      for (const plan of ["free", "pro", "business", "enterprise"]) {
        await sql`
          INSERT INTO platform_ai_defaults (plan, source, provider_id, provider_model, copilot_account_id, copilot_model, updated_by)
          VALUES (${plan}, 'custom', NULL, ${providerModel}, NULL, NULL, NULL)
          ON CONFLICT (plan) DO NOTHING
        `;
      }
    }

    console.log(
      `[seed] Pre-configured ${source.label} from $${source.envVar} (wizard Step 2 ready).`,
    );
  } catch (err) {
    // Encryption failure means KEK isn't available yet (e.g. test) — leave
    // platform_config untouched. Never log the key on error.
    console.warn(
      `[seed] Could not seed AI provider from env ($${source.envVar}): ${(err as Error).message}`,
    );
  }
}
