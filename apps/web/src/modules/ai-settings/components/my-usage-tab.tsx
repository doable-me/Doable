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

interface MyUsageTabProps {
  workspaceId: string | null;
}

// ── Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
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
      className={`group relative bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5 transition-all duration-300 hover:border-zinc-700 hover:shadow-lg ${ring}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`p-1.5 rounded-lg bg-zinc-800/80`}>
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <span className="text-zinc-400 text-xs uppercase tracking-wider font-medium">{label}</span>
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
            className="text-zinc-800"
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
          <span className="text-[10px] text-zinc-500">
            {limit > 0 ? "%" : ""}
          </span>
        </div>
      </div>
      <span className="text-xs text-zinc-400 font-medium">{label}</span>
      <span className="text-[10px] text-zinc-500">
        {used.toLocaleString()} / {limit > 0 ? limit.toLocaleString() : "Unlimited"}
      </span>
    </div>
  );
}

// ── SVG Area Chart ────────────────────────────────────────────────────
function AreaChart({
  periods,
  loading,
}: {
  periods: { period: string; totalTokens: number }[];
  loading: boolean;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (loading) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!periods.length) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-400" /> Daily Usage
        </h3>
        <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
          <BarChart3 className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-xs">No usage data for this period</p>
        </div>
      </div>
    );
  }

  const W = 600, H = 180, PX = 40, PY = 20;
  const maxTokens = Math.max(...periods.map((p) => p.totalTokens), 1);
  const points = periods.map((p, i) => ({
    x: PX + (i / Math.max(periods.length - 1, 1)) * (W - PX * 2),
    y: PY + (1 - p.totalTokens / maxTokens) * (H - PY * 2),
    tokens: p.totalTokens,
    date: p.period,
  }));

  // Smooth bezier path
  const pathD = points.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = points[i - 1]!;
    const cpx = (prev.x + pt.x) / 2;
    return `${acc} C ${cpx} ${prev.y}, ${cpx} ${pt.y}, ${pt.x} ${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1]!.x} ${H - PY} L ${points[0]!.x} ${H - PY} Z`;

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  // Y-axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    y: PY + (1 - pct) * (H - PY * 2),
    label: formatTokenCount(Math.round(maxTokens * pct)),
  }));

  // X-axis labels  
  const labelInterval = periods.length > 30 ? 7 : periods.length > 14 ? 3 : 1;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let closest = 0;
    let minDist = Infinity;
    points.forEach((pt, i) => {
      const dist = Math.abs(pt.x - x);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setHoverIdx(closest);
  };

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-blue-400" /> Daily Usage
      </h3>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#818cf8" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yLabels.map((yl, i) => (
          <g key={i}>
            <line
              x1={PX} y1={yl.y} x2={W - PX} y2={yl.y}
              stroke="#27272a" strokeWidth="0.5"
            />
            <text x={PX - 4} y={yl.y + 3} textAnchor="end" className="fill-zinc-600 text-[8px]">
              {yl.label}
            </text>
          </g>
        ))}

        {/* Area fill with animation */}
        <path d={areaD} fill="url(#areaGrad)" className="animate-[fadeIn_0.8s_ease-out]" />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="url(#lineGrad)"
          strokeWidth="2"
          strokeLinecap="round"
          className="animate-[fadeIn_0.6s_ease-out]"
        />

        {/* Dots */}
        {points.map((pt, i) => (
          <circle
            key={i}
            cx={pt.x} cy={pt.y} r={hoverIdx === i ? 4 : 2}
            className={`transition-all duration-200 ${
              hoverIdx === i
                ? "fill-blue-400 stroke-blue-400/30"
                : "fill-blue-500/60 stroke-none"
            }`}
            strokeWidth={hoverIdx === i ? 6 : 0}
          />
        ))}

        {/* Hover line & tooltip */}
        {hoverIdx !== null && points[hoverIdx] && (
          <>
            <line
              x1={points[hoverIdx].x} y1={PY}
              x2={points[hoverIdx].x} y2={H - PY}
              stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.5"
            />
            <rect
              x={Math.min(points[hoverIdx].x - 50, W - PX - 100)}
              y={Math.max(points[hoverIdx].y - 32, 2)}
              width="100" height="22" rx="4"
              className="fill-zinc-800"
            />
            <text
              x={Math.min(points[hoverIdx].x, W - PX - 50)}
              y={Math.max(points[hoverIdx].y - 17, 16)}
              textAnchor="middle"
              className="fill-white text-[9px] font-medium"
            >
              {formatDateLabel(points[hoverIdx].date)}: {formatTokenCount(points[hoverIdx].tokens)}
            </text>
          </>
        )}

        {/* X-axis labels */}
        {points.map((pt, i) =>
          i % labelInterval === 0 ? (
            <text
              key={i}
              x={pt.x} y={H - 2}
              textAnchor="middle"
              className="fill-zinc-500 text-[8px]"
            >
              {formatDateLabel(pt.date)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────
const DONUT_COLORS = [
  { stroke: "#3b82f6", label: "Prompt", bg: "bg-blue-500" },
  { stroke: "#8b5cf6", label: "Completion", bg: "bg-violet-500" },
  { stroke: "#f59e0b", label: "Thinking", bg: "bg-amber-500" },
  { stroke: "#10b981", label: "Cached", bg: "bg-emerald-500" },
];

function TokenDonut({
  split,
  loading,
}: {
  split: { promptTokens: number; completionTokens: number; thinkingTokens: number; cachedTokens: number } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <Skeleton className="h-4 w-28 mb-4" />
        <div className="flex items-center justify-center">
          <Skeleton className="h-36 w-36 rounded-full" />
        </div>
      </div>
    );
  }

  const values = split
    ? [split.promptTokens, split.completionTokens, split.thinkingTokens, split.cachedTokens]
    : [0, 0, 0, 0];
  const total = values.reduce((a, b) => a + b, 0);

  if (total === 0) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-400" /> Token Breakdown
        </h3>
        <div className="flex flex-col items-center py-6 text-zinc-500">
          <Layers className="h-6 w-6 mb-2 opacity-40" />
          <p className="text-xs">No token data</p>
        </div>
      </div>
    );
  }

  const radius = 50;
  const strokeW = 14;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = values.map((v, i) => {
    const pct = v / total;
    const dash = circumference * pct;
    const seg = { dash, gap: circumference - dash, offset, color: DONUT_COLORS[i]!.stroke, pct, value: v };
    offset -= dash;
    return seg;
  });

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4 text-violet-400" /> Token Breakdown
      </h3>
      <div className="flex items-center gap-6">
        <div className="relative w-36 h-36 shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            {segments.map((seg, i) =>
              seg.value > 0 ? (
                <circle
                  key={i}
                  cx="60" cy="60" r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                  strokeDasharray={`${seg.dash} ${seg.gap}`}
                  strokeDashoffset={seg.offset}
                  className="transition-all duration-700 ease-out"
                  style={{ animationDelay: `${i * 100}ms` }}
                />
              ) : null
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-white">{formatTokenCount(total)}</span>
            <span className="text-[10px] text-zinc-500">total</span>
          </div>
        </div>
        <div className="space-y-2.5 flex-1 min-w-0">
          {DONUT_COLORS.map((c, i) => (
            <div key={c.label} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${c.bg} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-zinc-300">{c.label}</span>
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    {formatTokenCount(values[i] ?? 0)} ({total > 0 ? Math.round(((values[i] ?? 0) / total) * 100) : 0}%)
                  </span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out`}
                    style={{
                      width: `${total > 0 ? ((values[i] ?? 0) / total) * 100 : 0}%`,
                      backgroundColor: c.stroke,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Hourly Heatmap ────────────────────────────────────────────────────
function HourlyHeatmap({
  hours,
  loading,
}: {
  hours: { hour: number; requestCount: number; totalTokens: number; totalCostUsd: number }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="flex gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 h-10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const maxReqs = Math.max(...hours.map((h) => h.requestCount), 1);

  const getIntensity = (count: number) => {
    if (count === 0) return "bg-zinc-800/60";
    const pct = count / maxReqs;
    if (pct > 0.75) return "bg-blue-500";
    if (pct > 0.5) return "bg-blue-500/70";
    if (pct > 0.25) return "bg-blue-500/40";
    return "bg-blue-500/20";
  };

  const formatHour = (h: number) => {
    if (h === 0) return "12a";
    if (h === 12) return "12p";
    return h < 12 ? `${h}a` : `${h - 12}p`;
  };

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-emerald-400" /> Hourly Activity
      </h3>
      <div className="flex gap-[3px]">
        {hours.map((h) => (
          <div key={h.hour} className="flex-1 group relative">
            <div
              className={`h-10 rounded-md ${getIntensity(h.requestCount)} transition-all duration-300 hover:ring-1 hover:ring-blue-400/50`}
            />
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block z-20 pointer-events-none">
              <div className="bg-zinc-700 text-white text-[10px] rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                <div className="font-medium">{formatHour(h.hour)}</div>
                <div>{h.requestCount} requests</div>
                <div>{formatTokenCount(h.totalTokens)} tokens</div>
              </div>
            </div>
            {/* Hour label */}
            {h.hour % 3 === 0 && (
              <div className="text-[8px] text-zinc-500 text-center mt-1">{formatHour(h.hour)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
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
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-2">{title}</h3>
        <p className="text-xs text-zinc-500">No data</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
      <h3 className="text-sm font-medium text-white mb-4">{title}</h3>
      <div className="space-y-2.5">
        {items.map((item, i) => {
          const pct = (item.totalTokens / maxTokens) * 100;
          return (
            <div
              key={item.key}
              className="group relative rounded-xl bg-zinc-800/40 p-3 hover:bg-zinc-800/60 transition-all duration-200"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-zinc-200 font-medium truncate max-w-[140px]">
                  {displayKey(item)}
                </span>
                <span className="text-xs text-zinc-400 tabular-nums">{formatCost(item.totalCostUsd)}</span>
              </div>
              <div className="h-1.5 bg-zinc-700/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: accent }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-zinc-500">{item.requestCount} requests</span>
                <span className="text-[10px] text-zinc-500">{formatTokenCount(item.totalTokens)} tokens</span>
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
        <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
          <h3 className="text-sm font-medium text-white mb-5 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-rose-400" /> Credit Usage
            {credits?.planType && (
              <span className="ml-auto text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
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
      <div className="flex items-center gap-1 bg-zinc-900/50 rounded-lg p-1 w-fit">
        {periodOptions.map((opt) => (
          <button
            key={opt}
            onClick={() => setPeriod(opt)}
            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              period === opt
                ? "bg-zinc-700 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
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
