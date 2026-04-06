// ─── Universal LLM Provider Bridge — Types ────────────────
// Pure type definitions for the provider catalog.
// Zero runtime cost, no dependencies.

export interface ProviderPreset {
  id: string;
  name: string;
  category: "cloud" | "local" | "gateway";
  subcategory:
    | "major"
    | "aggregator"
    | "specialized"
    | "regional"
    | "infrastructure"
    | "primary"
    | "secondary"
    | "frontend";
  sdkType: "openai" | "azure" | "anthropic";
  wireApi?: "completions" | "responses";
  defaultBaseUrl: string;
  baseUrlEditable: boolean;
  baseUrlTemplate?: boolean;
  authMethod: "api-key" | "bearer" | "azure-key" | "aws-sig" | "gcp-oauth" | "none";
  apiKeyPlaceholder?: string;
  apiKeyPrefix?: string;
  apiKeyHelpUrl?: string;
  supportsModelDiscovery: boolean;
  defaultModels: ModelPreset[];
  icon: string;
  description: string;
  capabilities: {
    streaming: boolean;
    toolCalling: boolean;
    vision: boolean;
    imageGeneration: boolean;
    video: boolean;
    audio: boolean;
    mcp: boolean;
  };
  warnings?: string[];
  tags: string[];
  defaultTimeoutMs?: number;
  freeTier?: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  contextWindow?: number;
  supportsTools: boolean;
  supportsVision: boolean;
  tier?: "fast" | "balanced" | "powerful";
}

export interface UsageMetrics {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  thinkingTokens: number | null;
  cacheCreationTokens: number | null;
  cacheReadTokens: number | null;
  toolCallCount: number;
  estimatedCostUsd: number | null;
  durationMs: number;
  ttftMs: number | null;
  tokensAvailable: boolean;
  byokProviderId: string | null;
  isLocal: boolean;
}
