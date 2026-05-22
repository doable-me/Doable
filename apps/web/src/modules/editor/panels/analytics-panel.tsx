"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  BarChart3,
  Users,
  Eye,
  Clock,
  ArrowUpRight,
  Zap,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import type {
  AnalyticsPanelProps,
  DateRange,
  OverviewData,
  TimeseriesPoint,
  PageData,
  ReferrerData,
  DeviceData,
  BrowserData,
  OsData,
  AnalyticsSettings,
  RealtimeData,
} from "./analytics-types";
import { formatDuration, formatNumber } from "./analytics-types";
import {
  SkeletonCard,
  SkeletonChart,
  SkeletonTable,
  SkeletonBars,
  OverviewCard,
  TrafficChart,
  TopPagesTable,
} from "./analytics-charts";
import {
  ReferrersSection,
  DeviceBreakdownChart,
  HorizontalBarSection,
  RealtimeSection,
} from "./analytics-sections";

// ─── Main Panel ─────────────────────────────────────────────

export function AnalyticsPanel({ projectId, onClose }: AnalyticsPanelProps) {
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [pages, setPages] = useState<PageData[]>([]);
  const [referrers, setReferrers] = useState<ReferrerData[]>([]);
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [browsers, setBrowsers] = useState<BrowserData[]>([]);
  const [osData, setOsData] = useState<OsData[]>([]);

  const [settings, setSettings] = useState<AnalyticsSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [togglingEnabled, setTogglingEnabled] = useState(false);

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
        if (!cancelled) setSettings(res.data);
      } catch {
        if (!cancelled) setSettings({ enabled: false });
      } finally {
        if (!cancelled) setSettingsLoading(false);
      }
    }
    fetchSettings();
    return () => { cancelled = true; };
  }, [projectId]);

  // Toggle enabled
  const handleToggleEnabled = useCallback(async () => {
    if (!settings || togglingEnabled) return;
    const newEnabled = !settings.enabled;
    try {
      setTogglingEnabled(true);
      await apiFetch<{ data: { enabled: boolean; updatedAt: string } }>(
        `/analytics/projects/${projectId}/settings`,
        { method: "PUT", body: JSON.stringify({ enabled: newEnabled }) }
      );
      setSettings({ enabled: newEnabled });
    } catch (err) {
      console.error("Failed to toggle analytics:", err);
    } finally {
      setTogglingEnabled(false);
    }
  }, [projectId, settings, togglingEnabled]);

  // Fetch helper
  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [overviewRes, timeseriesRes, pagesRes, referrersRes, devicesRes, browsersRes, osRes] =
        await Promise.all([
          apiFetch<{ data: OverviewData }>(`/analytics/projects/${projectId}/overview?range=${dateRange}`),
          apiFetch<{ data: TimeseriesPoint[] }>(`/analytics/projects/${projectId}/timeseries?range=${dateRange}`),
          apiFetch<{ data: PageData[] }>(`/analytics/projects/${projectId}/pages?range=${dateRange}`),
          apiFetch<{ data: ReferrerData[] }>(`/analytics/projects/${projectId}/referrers?range=${dateRange}`),
          apiFetch<{ data: DeviceData[] }>(`/analytics/projects/${projectId}/devices?range=${dateRange}`),
          apiFetch<{ data: BrowserData[] }>(`/analytics/projects/${projectId}/browsers?range=${dateRange}`),
          apiFetch<{ data: OsData[] }>(`/analytics/projects/${projectId}/os?range=${dateRange}`),
        ]);
      setOverview(overviewRes.data);
      setTimeseries(timeseriesRes.data);
      setPages(pagesRes.data);
      setReferrers(referrersRes.data);
      setDevices(devicesRes.data);
      setBrowsers(browsersRes.data);
      setOsData(osRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [projectId, dateRange]);

  // Fetch data when enabled and date range changes
  useEffect(() => {
    if (!settings?.enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      await fetchAllData();
    };
    run();
    return () => { cancelled = true; };
  }, [settings?.enabled, fetchAllData]);

  // Realtime polling
  useEffect(() => {
    if (!settings?.enabled) {
      setRealtimeLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchRealtime() {
      try {
        if (!cancelled) setRealtimeLoading(true);
        const res = await apiFetch<{ data: RealtimeData }>(`/analytics/projects/${projectId}/realtime`);
        if (!cancelled) setRealtime(res.data);
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setRealtimeLoading(false);
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

  const handleRetry = useCallback(() => {
    setError(null);
    fetchAllData();
  }, [fetchAllData]);

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
              <p className="text-sm font-medium text-foreground">Enable analytics for this project</p>
              <p className="text-xs text-muted-foreground">Track visitors, page views, and engagement — privacy-friendly, no cookie banner needed.</p>
            </div>
            <button
              onClick={handleToggleEnabled}
              disabled={settingsLoading || togglingEnabled}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
                settingsLoading || togglingEnabled ? "opacity-50 cursor-not-allowed" : "",
                settings?.enabled ? "bg-brand-500" : "bg-muted"
              )}
              role="switch"
              aria-checked={settings?.enabled ?? false}
            >
              <span className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200", settings?.enabled && "translate-x-5")} />
            </button>
          </div>

          {/* Disabled state */}
          {!settingsLoading && !settings?.enabled && (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
              <h3 className="text-sm font-semibold text-foreground mb-1">Analytics is disabled</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Enable analytics to track visitor counts, page views, session duration, traffic sources, device breakdown, and more. All data is collected in a privacy-friendly way — no cookies or consent banners required.
              </p>
            </div>
          )}

          {/* Enabled state */}
          {settings?.enabled && (
            <>
              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                  <AlertCircle className="mx-auto h-6 w-6 text-red-400 mb-2" />
                  <p className="text-sm font-medium text-red-400 mb-1">Failed to load analytics</p>
                  <p className="text-xs text-muted-foreground mb-3">{error}</p>
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                </div>
              )}

              {loading && !error && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                  </div>
                  <SkeletonChart />
                  <div className="grid gap-4 lg:grid-cols-5">
                    <div className="lg:col-span-3"><SkeletonTable /></div>
                    <div className="space-y-4 lg:col-span-2"><SkeletonBars /><SkeletonBars /></div>
                  </div>
                </>
              )}

              {!loading && !error && !hasData && (
                <div className="rounded-lg border border-border bg-card p-8 text-center">
                  <Eye className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-sm font-semibold text-foreground mb-1">No data yet</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Analytics will appear once your published site receives visitors. Make sure your project is published and accessible.
                  </p>
                </div>
              )}

              {!loading && !error && hasData && overview && (
                <>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <OverviewCard label="Total Visitors" value={formatNumber(overview.visitors)} change={overview.changes.visitors} icon={Users} />
                    <OverviewCard label="Page Views" value={formatNumber(overview.pageViews)} change={overview.changes.pageViews} icon={Eye} />
                    <OverviewCard label="Avg. Session" value={formatDuration(overview.avgDuration)} change={overview.changes.avgDuration} icon={Clock} />
                    <OverviewCard label="Bounce Rate" value={`${overview.bounceRate.toFixed(1)}%`} change={overview.changes.bounceRate} icon={ArrowUpRight} />
                  </div>

                  <TrafficChart data={timeseries} />

                  <div className="grid gap-4 lg:grid-cols-5">
                    <div className="lg:col-span-3"><TopPagesTable pages={pages} /></div>
                    <div className="space-y-4 lg:col-span-2">
                      <ReferrersSection referrers={referrers} />
                      <DeviceBreakdownChart devices={devices} />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <HorizontalBarSection title="Browser Distribution" items={browsers.map((b) => ({ name: b.browser, count: b.count, percent: b.percent }))} />
                    <HorizontalBarSection title="Operating System" items={osData.map((o) => ({ name: o.os, count: o.count, percent: o.percent }))} />
                  </div>

                  <RealtimeSection realtime={realtime} loading={realtimeLoading} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
