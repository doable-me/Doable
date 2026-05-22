"use client";

import { Monitor, Smartphone, Tablet } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReferrerData, DeviceData, RealtimeData } from "./analytics-types";

// ─── Referrers Section ──────────────────────────────────────

export function ReferrersSection({ referrers }: { referrers: ReferrerData[] }) {
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
                <span className="text-xs font-medium text-foreground">{ref.source}</span>
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

// ─── Device Breakdown Chart ─────────────────────────────────

export function DeviceBreakdownChart({ devices }: { devices: DeviceData[] }) {
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
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${conicStops})` }}
        >
          <div className="absolute inset-3 rounded-full bg-card" />
        </div>
        <div className="flex-1 space-y-2.5">
          {devices.map((d) => {
            const key = d.device.toLowerCase();
            const Icon = deviceIcons[key] || Monitor;
            const bgColor = deviceColors[key]?.bg || "bg-brand-500";
            return (
              <div key={d.device} className="flex items-center gap-2.5">
                <div className={cn("h-2.5 w-2.5 rounded-sm", bgColor)} />
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 text-xs text-foreground">{d.device}</span>
                <span className="text-xs font-medium text-foreground">{d.percent}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Horizontal Bar Section ─────────────────────────────────

export function HorizontalBarSection({
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

// ─── Realtime Section ───────────────────────────────────────

export function RealtimeSection({
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
        <p className="text-2xl font-bold text-foreground">{realtime.activeVisitors}</p>
        <p className="text-xs text-muted-foreground mb-3">
          active visitor{realtime.activeVisitors !== 1 ? "s" : ""} right now
        </p>

        {realtime.pages && realtime.pages.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Current pages:</p>
            {realtime.pages.slice(0, 5).map((page) => (
              <div key={page.path} className="flex items-center justify-between text-xs">
                <span className="font-mono text-foreground truncate mr-2">{page.path}</span>
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
