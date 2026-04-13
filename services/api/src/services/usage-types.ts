// ─── Usage Service Types ─────────────────────────────────

export interface UsageInsertParams {
  userId: string;
  workspaceId: string;
  projectId?: string;
  sessionId?: string;
  provider: "copilot" | "byok" | "local";
  providerLabel: string;
  model: string;
  mode?: string;
  promptTokens?: number;
  completionTokens?: number;
  thinkingTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  toolCallCount?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  estimatedCostUsd?: number;
  creditsConsumed?: number;
  durationMs?: number;
  ttftMs?: number;
  tokensAvailable?: boolean;
  byokProviderId?: string;
  isLocal?: boolean;
  error?: string;
}

export interface UsageSummary {
  requestCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  totalCostUsd: number;
  totalCredits: number;
  avgDurationMs: number;
  toolCallCount: number;
}

export interface UsagePeriod {
  period: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface UsageBreakdownItem {
  key: string;
  label?: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}
