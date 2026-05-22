"use client";

import { useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TimeseriesPoint,
} from "./analytics-types";
import { formatNumber } from "./analytics-types";
export { TopPagesTable } from "./analytics-top-pages";

// ─── Skeleton Loaders ───────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-4 w-4 rounded bg-muted" />
        <div className="h-3 w-10 rounded bg-muted" />
      </div>
      <div className="mt-2 h-7 w-20 rounded bg-muted" />
      <div className="mt-1 h-3 w-16 rounded bg-muted" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="h-6 w-32 rounded bg-muted" />
      </div>
      <div className="h-[200px] w-full rounded bg-muted" />
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="rounded-lg border border-border bg-card animate-pulse">
      <div className="border-b border-border px-4 py-3">
        <div className="h-4 w-20 rounded bg-muted" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 w-full rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}

export function SkeletonBars() {
  return (
    <div className="rounded-lg border border-border bg-card animate-pulse">
      <div className="border-b border-border px-4 py-3">
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
      <div className="p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-1.5 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Overview Card ──────────────────────────────────────────

export function OverviewCard({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  change: number;
  icon: typeof Users;
}) {
  const isPositive = change > 0;
  const isGood = label === "Bounce Rate" ? !isPositive : isPositive;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div
          className={cn(
            "flex items-center gap-0.5 text-xs font-medium",
            change === 0
              ? "text-muted-foreground"
              : isGood
                ? "text-emerald-500"
                : "text-red-400"
          )}
        >
          {change !== 0 &&
            (isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            ))}
          {change === 0 ? "—" : `${Math.abs(change).toFixed(1)}%`}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Traffic Chart ──────────────────────────────────────────

export function TrafficChart({ data }: { data: TimeseriesPoint[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [metric, setMetric] = useState<"visitors" | "pageViews">("visitors");

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-foreground">Traffic Overview</h3>
        <p className="mt-4 text-center text-xs text-muted-foreground">No traffic data available yet.</p>
      </div>
    );
  }

  const values = data.map((d) => d[metric]);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  const width = 800;
  const height = 200;
  const padding = { top: 10, bottom: 30, left: 0, right: 0 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = values.map((v, i) => ({
    x: padding.left + (i / Math.max(values.length - 1, 1)) * chartWidth,
    y: padding.top + chartHeight - ((v - minValue) / range) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1]!;
      const cpx = (prev.x + p.x) / 2;
      return `C ${cpx} ${prev.y}, ${cpx} ${p.y}, ${p.x} ${p.y}`;
    })
    .join(" ");

  const lastPoint = points[points.length - 1]!;
  const firstPoint = points[0]!;
  const areaPath = `${linePath} L ${lastPoint.x} ${height - padding.bottom} L ${firstPoint.x} ${height - padding.bottom} Z`;

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    value: Math.round(minValue + range * pct),
    y: padding.top + chartHeight * (1 - pct),
  }));

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Traffic Overview</h3>
        <div className="flex rounded-md border border-border bg-muted/30">
          <button
            onClick={() => setMetric("visitors")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium transition-colors rounded-l-md",
              metric === "visitors"
                ? "bg-brand-500/20 text-brand-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Visitors
          </button>
          <button
            onClick={() => setMetric("pageViews")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium transition-colors rounded-r-md",
              metric === "pageViews"
                ? "bg-brand-500/20 text-brand-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Page Views
          </button>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--brand-500))" stopOpacity="0.3" />
              <stop offset="100%" stopColor="hsl(var(--brand-500))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yLabels.map((label, idx) => (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={label.y}
                x2={width - padding.right}
                y2={label.y}
                stroke="currentColor"
                className="text-border"
                strokeWidth="0.5"
              />
              <text
                x={width - padding.right - 4}
                y={label.y - 4}
                textAnchor="end"
                className="text-muted-foreground"
                fill="currentColor"
                fontSize="9"
              >
                {formatNumber(label.value)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill="url(#areaGradient)" />

          <path
            d={linePath}
            fill="none"
            stroke="hsl(var(--brand-500))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {hoveredIndex !== null && points[hoveredIndex] && (
            <>
              <line
                x1={points[hoveredIndex].x}
                y1={padding.top}
                x2={points[hoveredIndex].x}
                y2={height - padding.bottom}
                stroke="hsl(var(--brand-500))"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.4"
              />
              <circle
                cx={points[hoveredIndex].x}
                cy={points[hoveredIndex].y}
                r="4"
                fill="hsl(var(--brand-500))"
                stroke="hsl(var(--card))"
                strokeWidth="2"
              />
            </>
          )}

          {points.map((p, i) => (
            <rect
              key={i}
              x={p.x - chartWidth / values.length / 2}
              y={0}
              width={chartWidth / values.length}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(i)}
            />
          ))}
        </svg>

        {hoveredIndex !== null && data[hoveredIndex] && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${(hoveredIndex / Math.max(data.length - 1, 1)) * 100}%`,
              top: "-8px",
            }}
          >
            <p className="font-medium text-foreground">
              {data[hoveredIndex][metric].toLocaleString()}{" "}
              {metric === "visitors" ? "visitors" : "views"}
            </p>
            <p className="text-muted-foreground">{formatDate(data[hoveredIndex].date)}</p>
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between px-0.5">
        {data
          .filter((_, i) => {
            const step = Math.max(1, Math.floor(data.length / 7));
            return i % step === 0 || i === data.length - 1;
          })
          .map((d) => (
            <span key={d.date} className="text-[10px] text-muted-foreground">
              {formatDate(d.date)}
            </span>
          ))}
      </div>
    </div>
  );
}


