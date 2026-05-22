/**
 * Provider Discovery Service
 *
 * Validates provider connections, discovers available models,
 * and performs health checks. Uses native fetch with AbortController
 * timeouts — no external dependencies.
 *
 * Part of the Universal LLM Provider Bridge (PRD 23, Phase 4).
 */

export type { ValidationResult, DiscoveredModel, ProviderConfig } from "./provider-discovery-helpers.js";
import type { ValidationResult, DiscoveredModel, ProviderConfig, CacheEntry } from "./provider-discovery-helpers.js";
import { classifyError, buildHeaders, buildModelsUrl, parseModelsResponse, presetModelsToDiscovered } from "./provider-discovery-helpers.js";
import { PROVIDER_BY_ID } from "@doable/shared/ai/provider-catalog.js";


// ─── Discovery Service ────────────────────────────────

export class ProviderDiscoveryService {
  private modelCache: Map<string, CacheEntry>;
  private static CACHE_TTL_MS = 5 * 60 * 1000;       // 5 minutes
  private static VALIDATE_TIMEOUT_MS = 3_000;          // 3s hard cap
  private static DISCOVER_TIMEOUT_MS = 5_000;          // 5s for model discovery
  private static PING_TIMEOUT_MS = 500;                // 500ms

  constructor() {
    this.modelCache = new Map();
  }

  /**
   * Validate a provider connection — tests auth + connectivity.
   * Hard 3-second timeout. Returns structured result with latency
   * and error classification.
   */
  async validateProvider(config: ProviderConfig): Promise<ValidationResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      ProviderDiscoveryService.VALIDATE_TIMEOUT_MS,
    );

    const start = performance.now();

    try {
      const url = buildModelsUrl(config);
      const headers = buildHeaders(config);

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      const latencyMs = Math.round(performance.now() - start);

      if (response.ok) {
        // Try to parse model list from the response
        let models: DiscoveredModel[] | undefined;
        try {
          const body = await response.json();
          models = parseModelsResponse(body, config.type);
          if (models.length === 0) models = undefined;
        } catch {
          // Response wasn't JSON or parsing failed — that's fine
        }

        return {
          ok: true,
          latencyMs,
          models,
        };
      }

      // Some OpenAI-compatible providers (MiniMax, certain gateways) don't
      // expose GET /models. If we have a validationModel hint, fall back to
      // a tiny chat.completions ping which authenticates *and* exercises the
      // path the client will actually use.
      if (response.status === 404 && config.type === "openai" && config.validationModel) {
        return await this.validateViaChatPing(config, start);
      }

      // Non-2xx response — classify the error
      let errorMessage: string | undefined;
      try {
        const body = await response.text();
        // Try to extract a message from JSON error responses
        const parsed = JSON.parse(body);
        errorMessage =
          parsed?.error?.message ||
          parsed?.message ||
          parsed?.detail ||
          `HTTP ${response.status}`;
      } catch {
        errorMessage = `HTTP ${response.status} ${response.statusText}`;
      }

      const { code, message } = classifyError(null, response.status);

      return {
        ok: false,
        latencyMs,
        error: code,
        errorMessage: errorMessage || message,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const { code, message } = classifyError(err);

      return {
        ok: false,
        latencyMs,
        error: code,
        errorMessage: message,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fallback validation for providers without GET /models.
   * Sends a single-token chat.completions request to verify the API key.
   */
  private async validateViaChatPing(
    config: ProviderConfig,
    start: number,
  ): Promise<ValidationResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      ProviderDiscoveryService.VALIDATE_TIMEOUT_MS,
    );

    try {
      const base = config.baseUrl.replace(/\/+$/, "");
      const url = `${base}/chat/completions`;
      const headers = {
        ...buildHeaders(config),
        "Content-Type": "application/json",
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.validationModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
          stream: false,
        }),
        signal: controller.signal,
      });

      const latencyMs = Math.round(performance.now() - start);

      if (response.ok) {
        // We don't parse models from a chat ping — caller will use preset
        // defaults via a separate path.
        return { ok: true, latencyMs };
      }

      let errorMessage: string | undefined;
      try {
        const body = await response.text();
        const parsed = JSON.parse(body);
        errorMessage =
          parsed?.error?.message ||
          parsed?.message ||
          parsed?.detail ||
          `HTTP ${response.status}`;
      } catch {
        errorMessage = `HTTP ${response.status} ${response.statusText}`;
      }

      const { code, message } = classifyError(null, response.status);
      return {
        ok: false,
        latencyMs,
        error: code,
        errorMessage: errorMessage || message,
      };
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      const { code, message } = classifyError(err);
      return { ok: false, latencyMs, error: code, errorMessage: message };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Discover models from a provider's /v1/models endpoint.
   * Uses cache with 5-min TTL. Falls back to catalog preset defaults
   * if the live fetch fails.
   */
  async discoverModels(
    config: ProviderConfig,
    providerId?: string,
    presetId?: string,
  ): Promise<DiscoveredModel[]> {
    // 1. Check cache first
    if (providerId) {
      const cached = this.modelCache.get(providerId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.models;
      }
    }

    // 2. Fetch from provider
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      ProviderDiscoveryService.DISCOVER_TIMEOUT_MS,
    );

    try {
      const url = buildModelsUrl(config);
      const headers = buildHeaders(config);

      const response = await fetch(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (response.ok) {
        const body = await response.json();
        const models = parseModelsResponse(body, config.type);

        // Update cache
        if (providerId && models.length > 0) {
          this.modelCache.set(providerId, {
            models,
            expiresAt: Date.now() + ProviderDiscoveryService.CACHE_TTL_MS,
          });
        }

        if (models.length > 0) {
          return models;
        }
      }

      // Non-OK response or empty model list — fall through to defaults
    } catch {
      // Network error, timeout, etc. — fall through to defaults
    } finally {
      clearTimeout(timeoutId);
    }

    // 3. Fall back to preset defaults from the catalog
    if (presetId) {
      const preset = PROVIDER_BY_ID[presetId as keyof typeof PROVIDER_BY_ID];
      if (preset) {
        return presetModelsToDiscovered(preset);
      }
    }

    // No cache, no live data, no preset — return empty
    return [];
  }

  /**
   * Quick ping — HEAD request with 500ms timeout.
   * Returns true if the server is reachable (any 2xx or 4xx response
   * means the server is running, even if auth fails).
   */
  async ping(baseUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      ProviderDiscoveryService.PING_TIMEOUT_MS,
    );

    try {
      const url = `${baseUrl.replace(/\/+$/, "")}/models`;

      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });

      // Any 2xx or 4xx means the server is running
      // (4xx = server is up but we might not be authenticated)
      return response.status < 500;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Clear cache for a specific provider or all providers.
   */
  clearCache(providerId?: string): void {
    if (providerId) {
      this.modelCache.delete(providerId);
    } else {
      this.modelCache.clear();
    }
  }

  /**
   * Get cache stats for monitoring.
   */
  getCacheStats(): { size: number; providers: string[] } {
    const now = Date.now();
    // Clean up expired entries while we're at it
    for (const [key, entry] of this.modelCache) {
      if (entry.expiresAt <= now) {
        this.modelCache.delete(key);
      }
    }
    return {
      size: this.modelCache.size,
      providers: Array.from(this.modelCache.keys()),
    };
  }
}

// ─── Singleton ────────────────────────────────────────

export const providerDiscovery = new ProviderDiscoveryService();
