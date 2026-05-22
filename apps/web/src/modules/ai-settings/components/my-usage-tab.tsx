"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart3, Zap, DollarSign, Clock, Hash, CreditCard,
  TrendingUp, Activity, Layers,
} from "lucide-react";
import {
  useMyUsageSummary, useMyUsageHistory, useMyUsageBreakdown,
  useMyHourlyActivity, useMyTokenSplit, useMyCredits,
} from "../hooks/use-usage";
import { formatTokenCount, formatCost, formatDuration } from "../utils/format-usage";

import { AreaChart, TokenDonut, HourlyHeatmap } from "./usage-charts";

interface MyUsageTabProps {
  workspaceId: string | null;
}

// ── Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

// ── Animated Counter ──────────────────────────────────────────────────
function AnimatedValue({ value, loading }: { value: string; loading: boolean }) {
  const [display, setDisplay] = useState(value);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (loading) return;
    setAnimating(true);
    const t = setTimeout(() => { setDisplay(value); setAnimating(false); }, 60);
    return () => clearTimeout(t);
  }, [value, loading]);

  if (loading) return <Skeleton className="h-8 w-24" />;

  return (
    <div
      className={`text-2xl font-bold tabular-nums transition-all duration-500 ${
        animating ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
      }`}
    >
      {display}
    </div>
  );
}

// ── Glow Card ─────────────────────────────────────────────────────────
function GlowCard({
  icon: Icon,
  label,
  value,
  loading,
  accent = "blue",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  loading: boolean;
  accent?: "blue" | "emerald" | "violet" | "amber" | "rose";
}) {
  const ring = {
    blue: "group-hover:shadow-blue-500/10",
    emerald: "group-hover:shadow-emerald-500/10",
    violet: "group-hover:shadow-violet-500/10",
    amber: "group-hover:shadow-amber-500/10",
    rose: "group-hover:shadow-rose-500/10",
  }[accent];
  const iconColor = {
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  }[accent];

  return (
    <div
      className={`group relative bg-card backdrop-blur border border-border rounded-2xl p-5 transition-all duration-300 hover:border-border hover:shadow-lg ${ring}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg bg-muted`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <span className="text-muted-foreground text-xs uppercase tracking-wider font-medium">{label}</span>
      </div>
      <AnimatedValue value={value} loading={loading} />
    </div>
  );
}

// ── Credits Arc Gauge ─────────────────────────────────────────────────
function CreditsGauge({
  used,
  limit,
  label,
  loading,
}: {
  used: number;
  limit: number;
  label: string;
  loading: boolean;
}) {
  const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  const radius = 40;
  const stroke = 6;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);

  const color =
    pct > 0.9 ? "text-red-400 stroke-red-400" :
    pct > 0.7 ? "text-amber-400 stroke-amber-400" :
    "text-emerald-400 stroke-emerald-400";

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Skeleton className="h-24 w-24 rounded-full" />
        <Skeleton className="h-3 w-16" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle
            cx="50" cy="50" r={radius}
            fill="none" stroke="currentColor"
            strokeWidth={stroke}
            className="text-muted"
          />
          <circle
            cx="50" cy="50" r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={`${color} transition-all duration-1000 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-lg font-bold ${color.split(" ")[0]}`}>
            {limit > 0 ? Math.round(pct * 100) : "∞"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {limit > 0 ? "%" : ""}
          </span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-[10px] text-muted-foreground">
        {used.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : "Unlimited"}
      </span>
    </div>
  );
}

// ── SVG Area Chart ────────────────────────────────────────────────────
// ── Enhanced Breakdown Table ──────────────────────────────────────────
function BreakdownTable({
  title,
  keyHeader,
  items,
  loading,
  formatKey,
  accent = "#3b82f6",
}: {
  title: string;
  keyHeader: string;
  items: { key: string; label?: string; requestCount: number; totalTokens: number; totalCostUsd: number }[];
  loading: boolean;
  formatKey?: (item: { key: string; label?: string }) => string;
  accent?: string;
}) {
  const displayKey = formatKey ?? ((item: { key: string; label?: string }) => item.label || item.key);
  const maxTokens = Math.max(...items.map((i) => i.totalTokens), 1);

  if (loading) {
    return (
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <h3 className="text-sm font-medium text-foreground mb-2">{title}</h3>
        <p className="text-xs text-muted-foreground">No data</p>
      </div>
    );
  }

  return (
    <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
      <h3 className="text-sm font-medium text-foreground mb-4">{title}</h3>
      <div className="space-y-2.5">
        {items.map((item, i) => {
          const pct = (item.totalTokens / maxTokens) * 100;
          return (
            <div
              key={item.key}
              className="group relative rounded-xl bg-muted/50 p-3 hover:bg-muted transition-all duration-200"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-foreground font-medium truncate max-w-[140px]">
                  {displayKey(item)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatCost(item.totalCostUsd)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: accent }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">{item.requestCount} requests</span>
                <span className="text-[10px] text-muted-foreground">{formatTokenCount(item.totalTokens)} tokens</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────
export function MyUsageTab({ workspaceId }: MyUsageTabProps) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const { summary, loading: summaryLoading } = useMyUsageSummary(workspaceId);
  const { periods, loading: historyLoading } = useMyUsageHistory(workspaceId, period);
  const { breakdown, loading: breakdownLoading } = useMyUsageBreakdown(workspaceId);
  const { hours, loading: hourlyLoading } = useMyHourlyActivity(workspaceId, period);
  const { split, loading: splitLoading } = useMyTokenSplit(workspaceId);
  const { credits, loading: creditsLoading } = useMyCredits(workspaceId);

  const allEmpty =
    !summaryLoading && !historyLoading && !breakdownLoading &&
    !summary && !periods.length && !breakdown;

  if (allEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">No usage data yet</p>
        <p className="text-xs text-muted-foreground mt-1">Start using AI features to see your usage here.</p>
      </div>
    );
  }

  const periodOptions: ("7d" | "30d" | "90d")[] = ["7d", "30d", "90d"];

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <GlowCard
          icon={Zap}
          label="Today's Tokens"
          value={formatTokenCount(summary?.today.totalTokens ?? 0)}
          loading={summaryLoading}
          accent="blue"
        />
        <GlowCard
          icon={DollarSign}
          label="This Month's Cost"
          value={formatCost(summary?.thisMonth.totalCostUsd ?? 0)}
          loading={summaryLoading}
          accent="emerald"
        />
        <GlowCard
          icon={Hash}
          label="Monthly Requests"
          value={(summary?.thisMonth.requestCount ?? 0).toLocaleString()}
          loading={summaryLoading}
          accent="violet"
        />
        <GlowCard
          icon={Clock}
          label="Avg Response"
          value={formatDuration(summary?.thisMonth.avgDurationMs ?? 0)}
          loading={summaryLoading}
          accent="amber"
        />
        <GlowCard
          icon={CreditCard}
          label="Credits Used"
          value={credits ? `${credits.monthCredits.toLocaleString()}` : "0"}
          loading={creditsLoading}
          accent="rose"
        />
      </div>

      {/* ── Credits Gauges ── */}
      {(creditsLoading || credits) && (
        <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-5 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-rose-400" /> Credit Usage
            {credits?.planType && (
              <span className="ml-auto text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {credits.planType} plan
              </span>
            )}
          </h3>
          <div className="flex items-center justify-center gap-12">
            <CreditsGauge
              used={credits?.todayCredits ?? 0}
              limit={credits?.dailyLimit ?? 0}
              label="Today"
              loading={creditsLoading}
            />
            <CreditsGauge
              used={credits?.monthCredits ?? 0}
              limit={credits?.monthlyLimit ?? 0}
              label="This Month"
              loading={creditsLoading}
            />
          </div>
        </div>
      )}

      {/* ── Period Selector ── */}
      <div className="flex items-center gap-1 bg-card rounded-lg p-1 w-fit">
        {periodOptions.map((opt) => (
          <button
            key={opt}
            onClick={() => setPeriod(opt)}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              period === opt
                ? "bg-secondary text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* ── Area Chart ── */}
      <AreaChart periods={periods} loading={historyLoading} />

      {/* ── Donut + Heatmap side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TokenDonut split={split} loading={splitLoading} />
        <HourlyHeatmap hours={hours} loading={hourlyLoading} />
      </div>

      {/* ── Breakdown Tables ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <BreakdownTable
          title="By Project"
          keyHeader="Project"
          items={breakdown?.byProject ?? []}
          loading={breakdownLoading}
          formatKey={(item) => item.label || "Unknown Project"}
          accent="#3b82f6"
        />
        <BreakdownTable
          title="By Model"
          keyHeader="Model"
          items={breakdown?.byModel ?? []}
          loading={breakdownLoading}
          accent="#8b5cf6"
        />
        <BreakdownTable
          title="By Mode"
          keyHeader="Mode"
          items={breakdown?.byMode ?? []}
          loading={breakdownLoading}
          formatKey={(item) => item.key.charAt(0).toUpperCase() + item.key.slice(1)}
          accent="#f59e0b"
        />
      </div>
    </div>
  );
}
