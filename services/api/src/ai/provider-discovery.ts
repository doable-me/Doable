/**
 * Provider Discovery Service
 *
 * Validates provider connections, discovers available models,
 * and performs health checks. Uses native fetch with AbortController
 * timeouts — no external dependencies.
 *
 * Part of the Universal LLM Provider Bridge (PRD 23, Phase 4).
 */

import { PROVIDER_BY_ID } from "@doable/shared/ai/provider-catalog.js";
import type { ProviderPreset, ModelPreset } from "@doable/shared/ai/provider-types.js";

// ─── Types ─────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  latencyMs: number;
  error?: "invalid_api_key" | "unreachable" | "timeout" | "rate_limited" | "unknown";
  errorMessage?: string;
  providerName?: string;
  models?: DiscoveredModel[];
}

export interface DiscoveredModel {
  id: string;
  name?: string;
  contextWindow?: number;
  capabilities?: { vision?: boolean; tools?: boolean };
}

export interface ProviderConfig {
  type: "openai" | "azure" | "anthropic";
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  azure?: { apiVersion?: string };
}

// ─── Cache Entry ──────────────────────────────────────

interface CacheEntry {
  models: DiscoveredModel[];
  expiresAt: number;
}

// ─── Error Classification ─────────────────────────────

type ErrorCode = NonNullable<ValidationResult["error"]>;

function classifyError(err: unknown, status?: number): { code: ErrorCode; message: string } {
  // HTTP status-based classification
  if (status !== undefined) {
    if (status === 401 || status === 403) {
      return { code: "invalid_api_key", message: `Authentication failed (HTTP ${status})` };
    }
    if (status === 429) {
      return { code: "rate_limited", message: "Rate limited by provider" };
    }
    if (status >= 500) {
      return { code: "unknown", message: `Provider returned HTTP ${status}` };
    }
  }

  // Network / timeout error classification
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();

    if (err.name === "AbortError" || msg.includes("abort")) {
      return { code: "timeout", message: "Request timed out" };
    }
    if (
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("enetunreach") ||
      msg.includes("ehostunreach") ||
      msg.includes("fetch failed")
    ) {
      return { code: "unreachable", message: `Cannot reach provider: ${err.message}` };
    }

    return { code: "unknown", message: err.message };
  }

  return { code: "unknown", message: String(err) };
}

// ─── Header Builders ──────────────────────────────────

function buildHeaders(config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
  };

  const token = config.apiKey || config.bearerToken;

  switch (config.type) {
    case "anthropic":
      if (config.apiKey) {
        headers["x-api-key"] = config.apiKey;
      }
      // Anthropic requires anthropic-version header
      headers["anthropic-version"] = "2023-06-01";
      break;

    case "azure":
      if (config.apiKey) {
        headers["api-key"] = config.apiKey;
      }
      break;

    case "openai":
    default:
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      break;
  }

  return headers;
}

// ─── URL Builders ─────────────────────────────────────

function buildModelsUrl(config: ProviderConfig): string {
  const base = config.baseUrl.replace(/\/+$/, "");

  switch (config.type) {
    case "anthropic":
      return `${base}/v1/models`;

    case "azure": {
      const apiVersion = config.azure?.apiVersion || "2024-06-01";
      return `${base}/models?api-version=${apiVersion}`;
    }

    case "openai":
    default:
      // Most OpenAI-compatible providers serve models at /models
      // If the base URL already ends in /v1, append /models
      // If it doesn't, try /v1/models (some providers need it)
      if (base.endsWith("/v1")) {
        return `${base}/models`;
      }
      return `${base}/models`;
  }
}

// ─── Model Parsing ────────────────────────────────────

interface RawModelData {
  id?: string;
  name?: string;
  context_window?: number;
  context_length?: number;
  max_context_length?: number;
}

function parseModelsResponse(data: unknown, type: ProviderConfig["type"]): DiscoveredModel[] {
  if (!data || typeof data !== "object") return [];

  let rawModels: RawModelData[] = [];

  // OpenAI / Azure format: { data: [{ id, ... }] }
  if ("data" in data && Array.isArray((data as { data: unknown }).data)) {
    rawModels = (data as { data: RawModelData[] }).data;
  }
  // Anthropic format: { data: [{ id, display_name, ... }] }
  // Same structure, handled above

  // Ollama /api/tags format: { models: [{ name, ... }] }
  else if ("models" in data && Array.isArray((data as { models: unknown }).models)) {
    rawModels = (data as { models: RawModelData[] }).models;
  }
  // Plain array format
  else if (Array.isArray(data)) {
    rawModels = data;
  }

  return rawModels
    .filter((m) => m.id || m.name)
    .map((m) => {
      const model: DiscoveredModel = {
        id: m.id || m.name || "",
      };

      if (m.name && m.name !== m.id) {
        model.name = m.name;
      }

      const ctx = m.context_window || m.context_length || m.max_context_length;
      if (ctx && typeof ctx === "number") {
        model.contextWindow = ctx;
      }

      return model;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

function presetModelsToDiscovered(preset: ProviderPreset): DiscoveredModel[] {
  return preset.defaultModels.map((m: ModelPreset) => ({
    id: m.id,
    name: m.name,
    contextWindow: m.contextWindow,
    capabilities: {
      vision: m.supportsVision,
      tools: m.supportsTools,
    },
  }));
}

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
