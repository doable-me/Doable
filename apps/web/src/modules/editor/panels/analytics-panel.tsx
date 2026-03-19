"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  X,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  Eye,
  Clock,
  ArrowUpRight,
  Monitor,
  Smartphone,
  Tablet,
  ChevronUp,
  ChevronDown,
  Zap,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
}

type DateRange = "7d" | "30d" | "90d";
type SortColumn = "path" | "views" | "visitors" | "avgDuration";
type SortDirection = "asc" | "desc";

interface OverviewData {
  visitors: number;
  pageViews: number;
  sessions: number;
  avgDuration: number;
  bounceRate: number;
  changes: {
    visitors: number;
    pageViews: number;
    sessions: number;
    avgDuration: number;
    bounceRate: number;
  };
}

interface TimeseriesPoint {
  date: string;
  visitors: number;
  pageViews: number;
}

interface PageData {
  path: string;
  views: number;
  visitors: number;
  avgDuration: number;
}

interface ReferrerData {
  source: string;
  type: string;
  visits: number;
  percent: number;
}

interface DeviceData {
  device: string;
  count: number;
  percent: number;
}

interface BrowserData {
  browser: string;
  count: number;
  percent: number;
}

interface OsData {
  os: string;
  count: number;
  percent: number;
}

interface RealtimeData {
  activeVisitors: number;
  pages: { path: string; visitors: number }[];
}

interface AnalyticsSettings {
  enabled: boolean;
}

// ─── Helpers ────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── Skeleton Loaders ───────────────────────────────────────

function SkeletonCard() {
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

function SkeletonChart() {
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

function SkeletonTable() {
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

function SkeletonBars() {
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

// ─── Sub-components ─────────────────────────────────────────

function OverviewCard({
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
  // For bounce rate, lower is better
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
          {change !== 0 && (
            isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )
          )}
          {change === 0 ? "—" : `${Math.abs(change).toFixed(1)}%`}
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function TrafficChart({ data }: { data: TimeseriesPoint[] }) {
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

  // Build smooth bezier curve path
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

  // Y-axis labels
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    value: Math.round(minValue + range * pct),
    y: padding.top + chartHeight * (1 - pct),
  }));

  // Format date for display
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

          {/* Horizontal grid lines with y-axis values */}
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

          {/* Gradient area fill */}
          <path d={areaPath} fill="url(#areaGradient)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="hsl(var(--brand-500))"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Hover indicators */}
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

          {/* Invisible hover rects */}
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

        {/* Tooltip */}
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

      {/* X-axis labels */}
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

function TopPagesTable({ pages }: { pages: PageData[] }) {
  const [sortCol, setSortCol] = useState<SortColumn>("views");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir("desc");
      }
    },
    [sortCol]
  );

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortCol) {
        case "path":
          aVal = a.path;
          bVal = b.path;
          break;
        case "views":
          aVal = a.views;
          bVal = b.views;
          break;
        case "visitors":
          aVal = a.visitors;
          bVal = b.visitors;
          break;
        case "avgDuration":
          aVal = a.avgDuration;
          bVal = b.avgDuration;
          break;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [pages, sortCol, sortDir]);

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortCol !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

  if (pages.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Top Pages</h3>
        </div>
        <p className="p-4 text-center text-xs text-muted-foreground">No page data available yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Top Pages</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left">
              {[
                { key: "path" as SortColumn, label: "Page" },
                { key: "views" as SortColumn, label: "Views" },
                { key: "visitors" as SortColumn, label: "Unique Visitors" },
                { key: "avgDuration" as SortColumn, label: "Avg. Time" },
              ].map(({ key, label }) => (
                <th
                  key={key}
                  className="cursor-pointer select-none px-4 py-2 font-medium text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => handleSort(key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <SortIcon col={key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 10).map((page) => (
              <tr
                key={page.path}
                className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
              >
                <td className="px-4 py-2.5 font-mono text-foreground">
                  {page.path}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {page.views.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {page.visitors.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {formatDuration(page.avgDuration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReferrersSection({ referrers }: { referrers: ReferrerData[] }) {
  if (referrers.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Traffic Sources</h3>
        </div>
        <p className="p-4 text-center text-xs text-muted-foreground">No referrer data available yet.</p>
      </div>
    );
  }

  const typeBadgeColor: Record<string, string> = {
    direct: "bg-blue-500/10 text-blue-400",
    search: "bg-emerald-500/10 text-emerald-400",
    social: "bg-brand-500/10 text-brand-400",
    referral: "bg-amber-500/10 text-amber-400",
    other: "bg-muted text-muted-foreground",
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Traffic Sources</h3>
      </div>
      <div className="p-4 space-y-3">
        {referrers.map((ref) => (
          <div key={ref.source}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {ref.source}
                </span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    typeBadgeColor[ref.type] || typeBadgeColor.other
                  )}
                >
                  {ref.type}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {ref.visits.toLocaleString()} ({ref.percent}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500"
                style={{ width: `${ref.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeviceBreakdownChart({ devices }: { devices: DeviceData[] }) {
  if (devices.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Device Breakdown</h3>
        </div>
        <p className="p-4 text-center text-xs text-muted-foreground">No device data available yet.</p>
      </div>
    );
  }

  const deviceColors: Record<string, { bg: string; css: string }> = {
    desktop: { bg: "bg-brand-500", css: "hsl(var(--brand-500))" },
    mobile: { bg: "bg-brand-400", css: "hsl(var(--brand-400))" },
    tablet: { bg: "bg-brand-300", css: "hsl(var(--brand-300))" },
  };

  const deviceIcons: Record<string, typeof Monitor> = {
    desktop: Monitor,
    mobile: Smartphone,
    tablet: Tablet,
  };

  const segments = devices.reduce<{ device: string; start: number; end: number; color: string }[]>(
    (acc, d) => {
      const start = acc.length > 0 ? acc[acc.length - 1]!.end : 0;
      const key = d.device.toLowerCase();
      acc.push({
        device: d.device,
        start,
        end: start + d.percent * 3.6,
        color: deviceColors[key]?.css || "hsl(var(--brand-500))",
      });
      return acc;
    },
    []
  );

  const conicStops = segments
    .map((s) => `${s.color} ${s.start}deg ${s.end}deg`)
    .join(", ");

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Device Breakdown</h3>
      </div>
      <div className="flex items-center gap-6 p-4">
        {/* Donut chart */}
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${conicStops})`,
          }}
        >
          <div className="absolute inset-3 rounded-full bg-card" />
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2.5">
          {devices.map((d) => {
            const key = d.device.toLowerCase();
            const Icon = deviceIcons[key] || Monitor;
            const bgColor = deviceColors[key]?.bg || "bg-brand-500";
            return (
              <div key={d.device} className="flex items-center gap-2.5">
                <div className={cn("h-2.5 w-2.5 rounded-sm", bgColor)} />
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 text-xs text-foreground">
                  {d.device}
                </span>
                <span className="text-xs font-medium text-foreground">
                  {d.percent}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HorizontalBarSection({
  title,
  items,
}: {
  title: string;
  items: { name: string; count: number; percent: number }[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <p className="p-4 text-center text-xs text-muted-foreground">No data available yet.</p>
      </div>
    );
  }

  const maxPercent = Math.max(...items.map((i) => i.percent), 1);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-4 space-y-2.5">
        {items.slice(0, 5).map((item) => (
          <div key={item.name}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-foreground">{item.name}</span>
              <span className="text-xs text-muted-foreground">
                {item.count.toLocaleString()} ({item.percent}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-500"
                style={{ width: `${(item.percent / maxPercent) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RealtimeSection({
  realtime,
  loading,
}: {
  realtime: RealtimeData | null;
  loading: boolean;
}) {
  if (loading && !realtime) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
        <div className="h-4 w-40 rounded bg-muted mb-3" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-3 w-full rounded bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!realtime) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Real-time</h3>
      </div>
      <div className="p-4">
        <p className="text-2xl font-bold text-foreground">
          {realtime.activeVisitors}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          active visitor{realtime.activeVisitors !== 1 ? "s" : ""} right now
        </p>

        {realtime.pages && realtime.pages.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Current pages:</p>
            {realtime.pages.slice(0, 5).map((page) => (
              <div
                key={page.path}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono text-foreground truncate mr-2">
                  {page.path}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {page.visitors} visitor{page.visitors !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────

export function AnalyticsPanel({ projectId, onClose }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  // Data states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [pages, setPages] = useState<PageData[]>([]);
  const [referrers, setReferrers] = useState<ReferrerData[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [browsers, setBrowsers] = useState<BrowserData[]>([]);
  const [osData, setOsData] = useState<OsData[]>([]);

  // Settings
  const [settings, setSettings] = useState<AnalyticsSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

  // Realtime
  const [realtime, setRealtime] = useState<RealtimeData | null>(null);
  const [realtimeLoading, setRealtimeLoading] = useState(true);
  const realtimeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch analytics settings
  useEffect(() => {
    let cancelled = false;
    async function fetchSettings() {
      try {
        setSettingsLoading(true);
        const res = await apiFetch<{ data: AnalyticsSettings }>(
          `/analytics/projects/${projectId}/settings`
        );
        if (!cancelled) {
          setSettings(res.data);
        }
      } catch (err) {
        if (!cancelled) {
          // If settings endpoint fails, assume disabled
          setSettings({ enabled: false });
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    }
    fetchSettings();
    return () => { cancelled = true; };
  }, [projectId]);

  // Toggle analytics enabled
  const handleToggleEnabled = useCallback(async () => {
    if (!settings || togglingEnabled) return;
    const newEnabled = !settings.enabled;
    try {
      setTogglingEnabled(true);
      await apiFetch<{ data: { enabled: boolean; updatedAt: string } }>(
        `/analytics/projects/${projectId}/settings`,
        {
          method: "PUT",
          body: JSON.stringify({ enabled: newEnabled }),
        }
      );
      setSettings({ enabled: newEnabled });
    } catch (err) {
      // Revert on error
      console.error("Failed to toggle analytics:", err);
    } finally {
      setTogglingEnabled(false);
    }
  }, [projectId, settings, togglingEnabled]);

  // Fetch all analytics data when enabled and date range changes
  useEffect(() => {
    if (!settings?.enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [
          overviewRes,
          timeseriesRes,
          pagesRes,
          referrersRes,
          devicesRes,
          browsersRes,
          osRes,
        ] = await Promise.all([
          apiFetch<{ data: OverviewData }>(
            `/analytics/projects/${projectId}/overview?range=${dateRange}`
          ),
          apiFetch<{ data: TimeseriesPoint[] }>(
            `/analytics/projects/${projectId}/timeseries?range=${dateRange}`
          ),
          apiFetch<{ data: PageData[] }>(
            `/analytics/projects/${projectId}/pages?range=${dateRange}`
          ),
          apiFetch<{ data: ReferrerData[] }>(
            `/analytics/projects/${projectId}/referrers?range=${dateRange}`
          ),
          apiFetch<{ data: DeviceData[] }>(
            `/analytics/projects/${projectId}/devices?range=${dateRange}`
          ),
          apiFetch<{ data: BrowserData[] }>(
            `/analytics/projects/${projectId}/browsers?range=${dateRange}`
          ),
          apiFetch<{ data: OsData[] }>(
            `/analytics/projects/${projectId}/os?range=${dateRange}`
          ),
        ]);

        if (!cancelled) {
          setOverview(overviewRes.data);
          setTimeseries(timeseriesRes.data);
          setPages(pagesRes.data);
          setReferrers(referrersRes.data);
          setDevices(devicesRes.data);
          setBrowsers(browsersRes.data);
          setOsData(osRes.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load analytics"
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [projectId, dateRange, settings?.enabled]);

  // Fetch realtime data every 30 seconds
  useEffect(() => {
    if (!settings?.enabled) {
      setRealtimeLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchRealtime() {
      try {
        if (!cancelled) setRealtimeLoading(true);
        const res = await apiFetch<{ data: RealtimeData }>(
          `/analytics/projects/${projectId}/realtime`
        );
        if (!cancelled) {
          setRealtime(res.data);
        }
      } catch {
        // Silently fail realtime — not critical
      } finally {
        if (!cancelled) {
          setRealtimeLoading(false);
        }
      }
    }

    fetchRealtime();
    realtimeTimerRef.current = setInterval(fetchRealtime, 30_000);

    return () => {
      cancelled = true;
      if (realtimeTimerRef.current) {
        clearInterval(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
    };
  }, [projectId, settings?.enabled]);

  // Retry handler
  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    // Trigger re-fetch by toggling a dep — we'll just call fetchData inline
    const doRetry = async () => {
      try {
        const [
          overviewRes,
          timeseriesRes,
          pagesRes,
          referrersRes,
          devicesRes,
          browsersRes,
          osRes,
        ] = await Promise.all([
          apiFetch<{ data: OverviewData }>(
            `/analytics/projects/${projectId}/overview?range=${dateRange}`
          ),
          apiFetch<{ data: TimeseriesPoint[] }>(
            `/analytics/projects/${projectId}/timeseries?range=${dateRange}`
          ),
          apiFetch<{ data: PageData[] }>(
            `/analytics/projects/${projectId}/pages?range=${dateRange}`
          ),
          apiFetch<{ data: ReferrerData[] }>(
            `/analytics/projects/${projectId}/referrers?range=${dateRange}`
          ),
          apiFetch<{ data: DeviceData[] }>(
            `/analytics/projects/${projectId}/devices?range=${dateRange}`
          ),
          apiFetch<{ data: BrowserData[] }>(
            `/analytics/projects/${projectId}/browsers?range=${dateRange}`
          ),
          apiFetch<{ data: OsData[] }>(
            `/analytics/projects/${projectId}/os?range=${dateRange}`
          ),
        ]);
        setOverview(overviewRes.data);
        setTimeseries(timeseriesRes.data);
        setPages(pagesRes.data);
        setReferrers(referrersRes.data);
        setDevices(devicesRes.data);
        setBrowsers(browsersRes.data);
        setOsData(osRes.data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load analytics"
        );
      } finally {
        setLoading(false);
      }
    };
    doRetry();
  }, [projectId, dateRange]);

  // Determine if analytics has data
  const hasData = overview && (overview.visitors > 0 || overview.pageViews > 0);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand-500" />
          <h2 className="text-sm font-semibold text-foreground">Analytics</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-400">
            <Zap className="h-2.5 w-2.5" />
            Built-in analytics
          </span>
          {/* Real-time active visitors badge */}
          {settings?.enabled && realtime && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              {realtime.activeVisitors} live
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
          {settings?.enabled && (
            <div className="flex rounded-md border border-border bg-muted/30">
              {(["7d", "30d", "90d"] as DateRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors",
                    range === "7d" && "rounded-l-md",
                    range === "90d" && "rounded-r-md",
                    dateRange === range
                      ? "bg-brand-500/20 text-brand-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {range}
                </button>
              ))}
            </div>
          )}
          {/* Close */}
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Close analytics"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-4 p-4">
          {/* Enable Analytics Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Enable analytics for this project
              </p>
              <p className="text-xs text-muted-foreground">
                Track visitors, page views, and engagement — privacy-friendly, no
                cookie banner needed.
              </p>
            </div>
            <button
              onClick={handleToggleEnabled}
              disabled={settingsLoading || togglingEnabled}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
                settingsLoading || togglingEnabled
                  ? "opacity-50 cursor-not-allowed"
                  : "",
                settings?.enabled ? "bg-brand-500" : "bg-muted"
              )}
              role="switch"
              aria-checked={settings?.enabled ?? false}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                  settings?.enabled && "translate-x-5"
                )}
              />
            </button>
          </div>

          {/* When analytics is disabled */}
          {!settingsLoading && !settings?.enabled && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Analytics is disabled
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Enable analytics to track visitor counts, page views, session duration,
                traffic sources, device breakdown, and more. All data is collected
                in a privacy-friendly way — no cookies or consent banners required.
              </p>
            </div>
          )}

          {/* When analytics is enabled */}
          {settings?.enabled && (
            <>
              {/* Error state */}
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                  <AlertCircle className="mx-auto h-6 w-6 text-red-400 mb-2" />
                  <p className="text-sm font-medium text-red-400 mb-1">
                    Failed to load analytics
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">{error}</p>
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </button>
                </div>
              )}

              {/* Loading skeletons */}
              {loading && !error && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                  <SkeletonChart />
                  <div className="grid gap-4 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      <SkeletonTable />
                    </div>
                    <div className="space-y-4 lg:col-span-2">
                      <SkeletonBars />
                      <SkeletonBars />
                    </div>
                  </div>
                </>
              )}

              {/* Loaded with no data */}
              {!loading && !error && !hasData && (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                  <Eye className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">
                    No data yet
                  </h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Analytics will appear once your published site receives visitors.
                    Make sure your project is published and accessible.
                  </p>
                </div>
              )}

              {/* Loaded with data */}
              {!loading && !error && hasData && overview && (
                <>
                  {/* Overview Cards */}
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <OverviewCard
                      label="Total Visitors"
                      value={formatNumber(overview.visitors)}
                      change={overview.changes.visitors}
                      icon={Users}
                    />
                    <OverviewCard
                      label="Page Views"
                      value={formatNumber(overview.pageViews)}
                      change={overview.changes.pageViews}
                      icon={Eye}
                    />
                    <OverviewCard
                      label="Avg. Session"
                      value={formatDuration(overview.avgDuration)}
                      change={overview.changes.avgDuration}
                      icon={Clock}
                    />
                    <OverviewCard
                      label="Bounce Rate"
                      value={`${overview.bounceRate.toFixed(1)}%`}
                      change={overview.changes.bounceRate}
                      icon={ArrowUpRight}
                    />
                  </div>

                  {/* Traffic Chart */}
                  <TrafficChart data={timeseries} />

                  {/* Two-column layout: Top Pages + Referrers/Devices */}
                  <div className="grid gap-4 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      <TopPagesTable pages={pages} />
                    </div>
                    <div className="space-y-4 lg:col-span-2">
                      <ReferrersSection referrers={referrers} />
                      <DeviceBreakdownChart devices={devices} />
                    </div>
                  </div>

                  {/* Browser & OS Breakdown */}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <HorizontalBarSection
                      title="Browser Distribution"
                      items={browsers.map((b) => ({
                        name: b.browser,
                        count: b.count,
                        percent: b.percent,
                      }))}
                    />
                    <HorizontalBarSection
                      title="Operating System"
                      items={osData.map((o) => ({
                        name: o.os,
                        count: o.count,
                        percent: o.percent,
                      }))}
                    />
                  </div>

                  {/* Real-time Section */}
                  <RealtimeSection
                    realtime={realtime}
                    loading={realtimeLoading}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
