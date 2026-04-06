"use client";

import { useState } from "react";
import { BarChart3, Zap, DollarSign, Clock, Hash } from "lucide-react";
import { useMyUsageSummary, useMyUsageHistory, useMyUsageBreakdown } from "../hooks/use-usage";
import { formatTokenCount, formatCost, formatDuration } from "../utils/format-usage";

interface MyUsageTabProps {
  workspaceId: string | null;
}

// ── Skeleton Pulse ────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

// ── Summary Card ──────────────────────────────────────────────────────
function SummaryCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-zinc-400 text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="text-white text-2xl font-bold">{value}</div>
      )}
    </div>
  );
}

// ── Bar Chart (pure CSS) ──────────────────────────────────────────────
function UsageChart({
  periods,
  loading,
}: {
  periods: { period: string; totalTokens: number }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <Skeleton className="h-4 w-28 mb-4" />
        <div className="flex items-end gap-1 h-40">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${20 + Math.random() * 60}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (!periods.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-white mb-4">Daily Usage</h3>
        <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
          <BarChart3 className="h-8 w-8 mb-2" />
          <p className="text-xs">No usage data for this period</p>
        </div>
      </div>
    );
  }

  const maxTokens = Math.max(...periods.map((p) => p.totalTokens), 1);

  // Format date label: "Apr 1"
  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Show every Nth label to avoid overlap
  const labelInterval = periods.length > 30 ? 7 : periods.length > 14 ? 3 : 1;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-medium text-white mb-4">Daily Usage</h3>
      <div className="flex items-end gap-[2px] h-40">
        {periods.map((p, i) => {
          const pct = (p.totalTokens / maxTokens) * 100;
          const isMax = p.totalTokens === maxTokens && p.totalTokens > 0;
          return (
            <div key={p.period} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 hidden group-hover:block z-10 pointer-events-none">
                <div className="bg-zinc-700 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap">
                  {formatDateLabel(p.period)}: {formatTokenCount(p.totalTokens)} tokens
                </div>
              </div>
              {/* Max label always visible */}
              {isMax && (
                <div className="text-[10px] text-zinc-400 mb-0.5 whitespace-nowrap">
                  {formatTokenCount(p.totalTokens)}
                </div>
              )}
              {/* Bar */}
              <div
                className="w-full bg-blue-500 rounded-t-sm min-h-[2px] transition-all"
                style={{ height: `${Math.max(pct, 1)}%` }}
              />
            </div>
          );
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex gap-[2px] mt-1">
        {periods.map((p, i) => (
          <div key={p.period} className="flex-1 text-center">
            {i % labelInterval === 0 ? (
              <span className="text-[9px] text-zinc-500">{formatDateLabel(p.period)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Breakdown Table ───────────────────────────────────────────────────
function BreakdownTable({
  title,
  keyHeader,
  items,
  loading,
  formatKey,
}: {
  title: string;
  keyHeader: string;
  items: { key: string; label?: string; requestCount: number; totalTokens: number; totalCostUsd: number }[];
  loading: boolean;
  formatKey?: (item: { key: string; label?: string }) => string;
}) {
  const displayKey = formatKey ?? ((item: { key: string; label?: string }) => item.label || item.key);

  if (loading) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <Skeleton className="h-4 w-24 mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-white mb-2">{title}</h3>
        <p className="text-xs text-zinc-500">No data</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <h3 className="text-sm font-medium text-white mb-3">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-zinc-500 uppercase tracking-wide">
            <th className="text-left pb-2 font-medium">{keyHeader}</th>
            <th className="text-right pb-2 font-medium">Requests</th>
            <th className="text-right pb-2 font-medium">Tokens</th>
            <th className="text-right pb-2 font-medium">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {items.map((item) => (
            <tr key={item.key}>
              <td className="py-2 text-zinc-200 truncate max-w-[160px]">{displayKey(item)}</td>
              <td className="py-2 text-right text-zinc-400">{item.requestCount.toLocaleString()}</td>
              <td className="py-2 text-right text-zinc-400">{formatTokenCount(item.totalTokens)}</td>
              <td className="py-2 text-right text-zinc-400">{formatCost(item.totalCostUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export function MyUsageTab({ workspaceId }: MyUsageTabProps) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const { summary, loading: summaryLoading } = useMyUsageSummary(workspaceId);
  const { periods, loading: historyLoading } = useMyUsageHistory(workspaceId, period);
  const { breakdown, loading: breakdownLoading } = useMyUsageBreakdown(workspaceId);

  const allEmpty =
    !summaryLoading &&
    !historyLoading &&
    !breakdownLoading &&
    !summary &&
    !periods.length &&
    !breakdown;

  if (allEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <BarChart3 className="h-10 w-10 text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-400">No usage data yet</p>
        <p className="text-xs text-zinc-500 mt-1">Start using AI features to see your usage here.</p>
      </div>
    );
  }

  const periodOptions: ("7d" | "30d" | "90d")[] = ["7d", "30d", "90d"];

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={Zap}
          label="Today's Tokens"
          value={formatTokenCount(summary?.today.totalTokens ?? 0)}
          loading={summaryLoading}
        />
        <SummaryCard
          icon={DollarSign}
          label="This Month's Cost"
          value={formatCost(summary?.thisMonth.totalCostUsd ?? 0)}
          loading={summaryLoading}
        />
        <SummaryCard
          icon={Hash}
          label="Monthly Requests"
          value={(summary?.thisMonth.requestCount ?? 0).toLocaleString()}
          loading={summaryLoading}
        />
        <SummaryCard
          icon={Clock}
          label="Avg Response"
          value={formatDuration(summary?.thisMonth.avgDurationMs ?? 0)}
          loading={summaryLoading}
        />
      </div>

      {/* ── Period Selector ── */}
      <div className="flex items-center gap-1">
        {periodOptions.map((opt) => (
          <button
            key={opt}
            onClick={() => setPeriod(opt)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              period === opt
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* ── Usage Chart ── */}
      <UsageChart periods={periods} loading={historyLoading} />

      {/* ── Breakdown Tables ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BreakdownTable
          title="By Project"
          keyHeader="Project"
          items={breakdown?.byProject ?? []}
          loading={breakdownLoading}
          formatKey={(item) => item.label || "Unknown Project"}
        />
        <BreakdownTable
          title="By Model"
          keyHeader="Model"
          items={breakdown?.byModel ?? []}
          loading={breakdownLoading}
        />
        <BreakdownTable
          title="By Mode"
          keyHeader="Mode"
          items={breakdown?.byMode ?? []}
          loading={breakdownLoading}
          formatKey={(item) => item.key.charAt(0).toUpperCase() + item.key.slice(1)}
        />
      </div>
    </div>
  );
}
