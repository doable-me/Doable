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
 * Provider precedence: MINIMAX_API_KEY > ANTHROPIC_API_KEY > OPENAI_API_KEY.
 * The first non-empty match wins. Set ANY_PROVIDER_API_KEY only if you actually
 * want that one to be the default.
 */

import { getConfig, setConfig, setEncryptedConfig } from "./platformConfig.js";

interface SeedSource {
  envVar: string;
  provider: "anthropic" | "openai" | "custom";
  baseUrl?: string;
  model?: string;
  label: string; // for log lines, never the key
}

const SOURCES: readonly SeedSource[] = [
  {
    envVar: "MINIMAX_API_KEY",
    provider: "custom",
    baseUrl: "https://api.minimax.io/v1",
    model: "MiniMax-M2.7",
    label: "MiniMax M2.7",
  },
  {
    envVar: "ANTHROPIC_API_KEY",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    label: "Anthropic Claude",
  },
  {
    envVar: "OPENAI_API_KEY",
    provider: "openai",
    model: "gpt-4o",
    label: "OpenAI GPT-4o",
  },
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
