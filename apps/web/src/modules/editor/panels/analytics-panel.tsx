"use client";

import { useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface Props {
  projectId: string;
  onClose: () => void;
}

type DateRange = "7d" | "30d" | "90d";

type SortColumn = "path" | "views" | "visitors" | "avgTime";

interface OverviewMetric {
  label: string;
  value: string;
  change: number;
  icon: typeof Users;
}

interface DailyData {
  date: string;
  visitors: number;
  pageViews: number;
}

interface TopPage {
  path: string;
  views: number;
  visitors: number;
  avgTime: string;
}

interface Referrer {
  source: string;
  type: string;
  visits: number;
  percent: number;
}

interface DeviceBreakdown {
  device: string;
  percent: number;
  icon: typeof Monitor;
  color: string;
}

// ─── Mock Data ──────────────────────────────────────────────

function generateDailyData(range: DateRange): DailyData[] {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const data: DailyData[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const base = isWeekend ? 80 : 140;
    const noise = Math.sin(i * 0.3) * 30 + Math.random() * 25;
    const trend = (days - i) * 1.2;

    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      visitors: Math.round(base + noise + trend),
      pageViews: Math.round((base + noise + trend) * 2.4),
    });
  }
  return data;
}

function getOverviewMetrics(range: DateRange): OverviewMetric[] {
  const multiplier = range === "7d" ? 1 : range === "30d" ? 4 : 12;
  return [
    {
      label: "Total Visitors",
      value: (1247 * multiplier).toLocaleString(),
      change: 12.5,
      icon: Users,
    },
    {
      label: "Page Views",
      value: (3891 * multiplier).toLocaleString(),
      change: 8.3,
      icon: Eye,
    },
    {
      label: "Avg. Session",
      value: "2m 34s",
      change: -3.1,
      icon: Clock,
    },
    {
      label: "Bounce Rate",
      value: "42.1%",
      change: -5.7,
      icon: ArrowUpRight,
    },
  ];
}

const TOP_PAGES: TopPage[] = [
  { path: "/", views: 1842, visitors: 1203, avgTime: "1m 45s" },
  { path: "/about", views: 643, visitors: 421, avgTime: "2m 12s" },
  { path: "/pricing", views: 587, visitors: 398, avgTime: "3m 08s" },
  { path: "/blog", views: 412, visitors: 287, avgTime: "4m 22s" },
  { path: "/contact", views: 298, visitors: 201, avgTime: "1m 15s" },
  { path: "/docs/getting-started", views: 189, visitors: 156, avgTime: "5m 31s" },
];

const REFERRERS: Referrer[] = [
  { source: "Direct", type: "direct", visits: 523, percent: 38 },
  { source: "Google Search", type: "search", visits: 412, percent: 30 },
  { source: "Twitter / X", type: "social", visits: 198, percent: 14 },
  { source: "GitHub", type: "social", visits: 124, percent: 9 },
  { source: "Product Hunt", type: "referral", visits: 78, percent: 6 },
  { source: "Other", type: "other", visits: 42, percent: 3 },
];

const DEVICES: DeviceBreakdown[] = [
  { device: "Desktop", percent: 62, icon: Monitor, color: "bg-purple-500" },
  { device: "Mobile", percent: 31, icon: Smartphone, color: "bg-violet-400" },
  { device: "Tablet", percent: 7, icon: Tablet, color: "bg-purple-300" },
];

// ─── Sub-components ─────────────────────────────────────────

function OverviewCard({ metric }: { metric: OverviewMetric }) {
  const Icon = metric.icon;
  const isPositive = metric.change > 0;
  // For bounce rate, down is good
  const isGood =
    metric.label === "Bounce Rate" ? !isPositive : isPositive;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div
          className={cn(
            "flex items-center gap-0.5 text-xs font-medium",
            isGood ? "text-emerald-500" : "text-red-400"
          )}
        >
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {Math.abs(metric.change)}%
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{metric.value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{metric.label}</p>
    </div>
  );
}

function TrafficChart({ data }: { data: DailyData[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [metric, setMetric] = useState<"visitors" | "pageViews">("visitors");

  const values = data.map((d) => d[metric]);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  // Build SVG path for the line chart
  const width = 800;
  const height = 200;
  const padding = { top: 10, bottom: 30, left: 0, right: 0 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const points = values.map((v, i) => ({
    x: padding.left + (i / (values.length - 1)) * chartWidth,
    y: padding.top + chartHeight - ((v - minValue) / range) * chartHeight,
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;

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
                ? "bg-purple-500/20 text-purple-400"
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
                ? "bg-purple-500/20 text-purple-400"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Page Views
          </button>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(168, 85, 247)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(168, 85, 247)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Horizontal grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const y = padding.top + chartHeight * (1 - pct);
            return (
              <line
                key={pct}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                className="text-border"
                strokeWidth="0.5"
              />
            );
          })}

          {/* Gradient area fill */}
          <path d={areaPath} fill="url(#areaGradient)" />

          {/* Line */}
          <path
            d={linePath}
            fill="none"
            stroke="rgb(168, 85, 247)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Hover dots */}
          {hoveredIndex !== null && points[hoveredIndex] && (
            <>
              <line
                x1={points[hoveredIndex].x}
                y1={padding.top}
                x2={points[hoveredIndex].x}
                y2={height - padding.bottom}
                stroke="rgb(168, 85, 247)"
                strokeWidth="1"
                strokeDasharray="4 2"
                opacity="0.4"
              />
              <circle
                cx={points[hoveredIndex].x}
                cy={points[hoveredIndex].y}
                r="4"
                fill="rgb(168, 85, 247)"
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
              left: `${(hoveredIndex / (data.length - 1)) * 100}%`,
              top: "-8px",
            }}
          >
            <p className="font-medium text-foreground">
              {data[hoveredIndex][metric].toLocaleString()}{" "}
              {metric === "visitors" ? "visitors" : "views"}
            </p>
            <p className="text-muted-foreground">{data[hoveredIndex].date}</p>
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
              {d.date}
            </span>
          ))}
      </div>
    </div>
  );
}

function TopPagesTable() {
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
    return [...TOP_PAGES].sort((a, b) => {
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
        case "avgTime":
          aVal = a.avgTime;
          bVal = b.avgTime;
          break;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [sortCol, sortDir]);

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortCol !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  };

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
                { key: "avgTime" as SortColumn, label: "Avg. Time" },
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
            {sorted.map((page) => (
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
                  {page.avgTime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReferrersSection() {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Traffic Sources</h3>
      </div>
      <div className="p-4 space-y-3">
        {REFERRERS.map((ref) => (
          <div key={ref.source}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {ref.source}
                </span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {ref.type}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {ref.visits.toLocaleString()} ({ref.percent}%)
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-400 transition-all duration-500"
                style={{ width: `${ref.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeviceBreakdownChart() {
  // CSS-based pie chart using conic-gradient
  const segments = DEVICES.reduce<{ device: string; start: number; end: number; color: string; icon: typeof Monitor }[]>(
    (acc, d) => {
      const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
      acc.push({
        device: d.device,
        start,
        end: start + d.percent * 3.6, // degrees
        color: d.color,
        icon: d.icon,
      });
      return acc;
    },
    []
  );

  const conicStops = segments
    .map((s) => {
      const colorMap: Record<string, string> = {
        "bg-purple-500": "rgb(168, 85, 247)",
        "bg-violet-400": "rgb(167, 139, 250)",
        "bg-purple-300": "rgb(196, 181, 253)",
      };
      const color = colorMap[s.color] || "rgb(168, 85, 247)";
      return `${color} ${s.start}deg ${s.end}deg`;
    })
    .join(", ");

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          Device Breakdown
        </h3>
      </div>
      <div className="flex items-center gap-6 p-4">
        {/* Pie chart */}
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${conicStops})`,
          }}
        >
          {/* Center hole for donut effect */}
          <div className="absolute inset-3 rounded-full bg-card" />
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2.5">
          {DEVICES.map((d) => {
            const Icon = d.icon;
            return (
              <div key={d.device} className="flex items-center gap-2.5">
                <div className={cn("h-2.5 w-2.5 rounded-sm", d.color)} />
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

// ─── Main Panel ─────────────────────────────────────────────

export function AnalyticsPanel({ projectId, onClose }: Props) {
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  const dailyData = useMemo(() => generateDailyData(dateRange), [dateRange]);
  const overviewMetrics = useMemo(() => getOverviewMetrics(dateRange), [dateRange]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-purple-500" />
          <h2 className="text-sm font-semibold text-foreground">Analytics</h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
            <Zap className="h-2.5 w-2.5" />
            Built-in analytics — no setup required
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Date Range Selector */}
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
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {range}
              </button>
            ))}
          </div>
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
              onClick={() => setAnalyticsEnabled((v) => !v)}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
                analyticsEnabled ? "bg-purple-500" : "bg-muted"
              )}
              role="switch"
              aria-checked={analyticsEnabled}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
                  analyticsEnabled && "translate-x-5"
                )}
              />
            </button>
          </div>

          {/* Overview Cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {overviewMetrics.map((metric) => (
              <OverviewCard key={metric.label} metric={metric} />
            ))}
          </div>

          {/* Traffic Chart */}
          <TrafficChart data={dailyData} />

          {/* Two-column layout: Top Pages + Referrers/Devices */}
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <TopPagesTable />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <ReferrersSection />
              <DeviceBreakdownChart />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
