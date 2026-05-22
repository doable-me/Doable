"use client";

import { useState, useRef } from "react";
import { BarChart3, TrendingUp, Activity, Layers } from "lucide-react";
import { formatTokenCount } from "../utils/format-usage";

// ── Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

// ── SVG Area Chart ────────────────────────────────────────────────────
export function AreaChart({
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
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!periods.length) {
    return (
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-400" /> Daily Usage
        </h3>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
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
    <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
      <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
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
              stroke="hsl(var(--border))" strokeWidth="0.5"
            />
            <text x={PX - 4} y={yl.y + 3} textAnchor="end" className="fill-[hsl(var(--muted-foreground))] text-[8px]">
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
              className="fill-[hsl(var(--popover))] stroke-[hsl(var(--border))]"
              strokeWidth="0.5"
            />
            <text
              x={Math.min(points[hoverIdx].x, W - PX - 50)}
              y={Math.max(points[hoverIdx].y - 17, 16)}
              textAnchor="middle"
              className="fill-[hsl(var(--popover-foreground))] text-[9px] font-medium"
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
              className="fill-[hsl(var(--muted-foreground))] text-[8px]"
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

export function TokenDonut({
  split,
  loading,
}: {
  split: { promptTokens: number; completionTokens: number; thinkingTokens: number; cachedTokens: number } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
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
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-400" /> Token Breakdown
        </h3>
        <div className="flex flex-col items-center py-6 text-muted-foreground">
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
    <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
      <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
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
            <span className="text-lg font-bold text-foreground">{formatTokenCount(total)}</span>
            <span className="text-[10px] text-muted-foreground">total</span>
          </div>
        </div>
        <div className="space-y-2.5 flex-1 min-w-0">
          {DONUT_COLORS.map((c, i) => (
            <div key={c.label} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${c.bg} shrink-0`} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-foreground">{c.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {formatTokenCount(values[i] ?? 0)} ({total > 0 ? Math.round(((values[i] ?? 0) / total) * 100) : 0}%)
                  </span>
                </div>
                <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
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
export function HourlyHeatmap({
  hours,
  loading,
}: {
  hours: { hour: number; requestCount: number; totalTokens: number; totalCostUsd: number }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
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
    if (count === 0) return "bg-muted";
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
    <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
      <h3 className="text-sm font-medium text-foreground mb-4 flex items-center gap-2">
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
              <div className="bg-popover text-popover-foreground border border-border text-[10px] rounded-md px-2 py-1 whitespace-nowrap shadow-lg">
                <div className="font-medium">{formatHour(h.hour)}</div>
                <div>{h.requestCount} requests</div>
                <div>{formatTokenCount(h.totalTokens)} tokens</div>
              </div>
            </div>
            {/* Hour label */}
            {h.hour % 3 === 0 && (
              <div className="text-[8px] text-muted-foreground text-center mt-1">{formatHour(h.hour)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
