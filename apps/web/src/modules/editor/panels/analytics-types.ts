// ─── Types ──────────────────────────────────────────────────

export interface AnalyticsPanelProps {
  projectId: string;
  onClose: () => void;
}

export type DateRange = "7d" | "30d" | "90d";
export type SortColumn = "path" | "views" | "visitors" | "avgDuration";
export type SortDirection = "asc" | "desc";

export interface OverviewData {
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

export interface TimeseriesPoint {
  date: string;
  visitors: number;
  pageViews: number;
}

export interface PageData {
  path: string;
  views: number;
  visitors: number;
  avgDuration: number;
}

export interface ReferrerData {
  source: string;
  type: string;
  visits: number;
  percent: number;
}

export interface DeviceData {
  device: string;
  count: number;
  percent: number;
}

export interface BrowserData {
  browser: string;
  count: number;
  percent: number;
}

export interface OsData {
  os: string;
  count: number;
  percent: number;
}

export interface RealtimeData {
  activeVisitors: number;
  pages: { path: string; visitors: number }[];
}

export interface AnalyticsSettings {
  enabled: boolean;
}

// ─── Helpers ────────────────────────────────────────────────

export function formatDuration(ms: number): string {
  if (ms <= 0) return "0s";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
