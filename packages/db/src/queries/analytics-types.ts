import type postgres from "postgres";

// ─── Row Types ───────────────────────────────────────────────

export interface PageViewRow {
  id: number;
  project_id: string;
  visitor_id: string;
  session_id: string;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  device_type: string | null;
  country: string | null;
  duration_ms: number;
  created_at: Date;
}

export interface AnalyticsEventRow {
  id: string;
  project_id: string;
  visitor_id: string | null;
  session_id: string;
  event_type: string;
  event_name: string | null;
  event_data: Record<string, unknown> | null;
  path: string;
  referrer: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  screen_width: number | null;
  screen_height: number | null;
  duration: number;
  timestamp: Date;
  created_at: Date;
}

export interface AnalyticsSettingsRow {
  project_id: string;
  enabled: boolean;
  updated_at: Date;
}

export interface AnalyticsDailyStatsRow {
  id: number;
  project_id: string;
  date: Date;
  total_visitors: number;
  unique_visitors: number;
  page_views: number;
  bounce_count: number;
  avg_duration_ms: number;
  visitors: number;
  sessions: number;
  bounces: number;
  total_duration: number;
  created_at: Date;
}

// ─── Query Result Types ──────────────────────────────────────

export interface AnalyticsOverview {
  visitors: number;
  pageViews: number;
  sessions: number;
  bounces: number;
  avgDuration: number;
  bounceRate: number;
}

export interface AnalyticsOverviewComparison {
  current: AnalyticsOverview;
  previous: AnalyticsOverview;
  changes: AnalyticsOverview;
}

export interface AnalyticsTimeseriesPoint {
  date: string;
  visitors: number;
  pageViews: number;
}

export interface AnalyticsTopPage {
  path: string;
  views: number;
  visitors: number;
  avgDuration: number;
}

export interface AnalyticsReferrer {
  source: string;
  type: string;
  visits: number;
  percent: number;
}

export interface AnalyticsBreakdownItem {
  name: string;
  count: number;
  percent: number;
}

export interface AnalyticsCustomEvent {
  id: string;
  event_name: string;
  event_data: Record<string, unknown> | null;
  path: string;
  visitor_id: string | null;
  session_id: string;
  created_at: Date;
}
