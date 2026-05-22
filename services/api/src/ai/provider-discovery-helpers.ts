/**
 * Provider discovery types and helper functions.
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
  /**
   * When set, the validator will fall back to a tiny chat.completions
   * request using this model id if GET /models is unavailable (e.g. 404).
   * Required for providers like MiniMax that don't expose model discovery.
   */
  validationModel?: string;
}

// ─── Cache Entry ──────────────────────────────────────

export interface CacheEntry {
  models: DiscoveredModel[];
  expiresAt: number;
}

// ─── Error Classification ─────────────────────────────

type ErrorCode = NonNullable<ValidationResult["error"]>;

export function classifyError(err: unknown, status?: number): { code: ErrorCode; message: string } {
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

export function buildHeaders(config: ProviderConfig): Record<string, string> {
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

export function buildModelsUrl(config: ProviderConfig): string {
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

export function parseModelsResponse(data: unknown, type: ProviderConfig["type"]): DiscoveredModel[] {
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

export function presetModelsToDiscovered(preset: ProviderPreset): DiscoveredModel[] {
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
