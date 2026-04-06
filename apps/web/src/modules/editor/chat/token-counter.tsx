"use client";

import { useState, memo } from "react";
import { Zap, ChevronDown, ChevronUp } from "lucide-react";
import {
  formatTokenCount,
  formatCost,
  formatDuration,
  formatCostWithLocal,
} from "@/modules/ai-settings/utils/format-usage";

export interface UsageData {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  model: string;
  tokensAvailable: boolean;
  isLocal?: boolean;
  toolCallCount?: number;
}

interface TokenCounterProps {
  usage?: UsageData | null;
}

/**
 * Per-message usage display shown below AI responses.
 *
 * Collapsed: lightning bolt 1,234 tokens . $0.003 . 2.1s
 * Expanded: detailed breakdown of prompt/completion tokens, model, tool calls.
 *
 * Renders nothing when usage is missing or null.
 */
export const TokenCounter = memo(function TokenCounter({ usage }: TokenCounterProps) {
  const [expanded, setExpanded] = useState(false);

  if (!usage) return null;

  const isLocal = usage.isLocal ?? false;
  const estimated = !usage.tokensAvailable;
  const tokenLabel = estimated
    ? `~${formatTokenCount(usage.totalTokens)} tokens (estimated)`
    : `${formatTokenCount(usage.totalTokens)} tokens`;

  const costLabel = formatCostWithLocal(usage.estimatedCostUsd, isLocal);
  const durationLabel = formatDuration(usage.durationMs);

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors select-none"
      >
        <Zap className="h-3 w-3" />
        <span>{tokenLabel}</span>
        <span className="mx-0.5">&middot;</span>
        <span>{costLabel}</span>
        <span className="mx-0.5">&middot;</span>
        <span>{durationLabel}</span>
        {expanded ? (
          <ChevronUp className="h-2.5 w-2.5 ml-0.5" />
        ) : (
          <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
        )}
      </button>

      {expanded && (
        <div className="mt-1 ml-4 space-y-0.5 text-[10px] text-muted-foreground/50">
          <div>
            Prompt: {formatTokenCount(usage.promptTokens)} tokens
          </div>
          <div>
            Completion: {formatTokenCount(usage.completionTokens)} tokens
          </div>
          <div>Model: {usage.model || "unknown"}</div>
          {(usage.toolCallCount ?? 0) > 0 && (
            <div>Tool calls: {usage.toolCallCount}</div>
          )}
          {isLocal && <div>Provider: local (no cost)</div>}
          {estimated && (
            <div className="text-amber-500/60">
              Token counts are estimated (provider did not report usage)
            </div>
          )}
        </div>
      )}
    </div>
  );
});
