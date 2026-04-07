"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────

export interface UsageSummary {
  requestCount: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  totalCostUsd: number;
  totalCredits: number;
  avgDurationMs: number;
  toolCallCount: number;
}

export interface UsagePeriod {
  period: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface UsageBreakdownItem {
  key: string;
  label?: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface MemberUsage {
  userId: string;
  email: string;
  displayName: string | null;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface ProviderUsage {
  provider: string;
  providerLabel: string | null;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
  uniqueModels: number;
}

// ── Hooks ──────────────────────────────────────────────────────────────

export function useMyUsageSummary(workspaceId: string | null) {
  const [summary, setSummary] = useState<{
    today: UsageSummary;
    thisWeek: UsageSummary;
    thisMonth: UsageSummary;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: { today: UsageSummary; thisWeek: UsageSummary; thisMonth: UsageSummary } }>(
        `/workspaces/${workspaceId}/usage/me`
      );
      setSummary(res.data);
    } catch (err) {
      console.error("Failed to load usage summary:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { summary, loading, refresh };
}

export function useMyUsageHistory(workspaceId: string | null, period: "7d" | "30d" | "90d") {
  const [periods, setPeriods] = useState<UsagePeriod[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      const res = await apiFetch<{ data: { periods: UsagePeriod[] } }>(
        `/workspaces/${workspaceId}/usage/me/history?groupBy=day&from=${from.toISOString()}&to=${to.toISOString()}`
      );
      setPeriods(res.data.periods);
    } catch (err) {
      console.error("Failed to load usage history:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => { refresh(); }, [refresh]);

  return { periods, loading, refresh };
}

export function useMyUsageBreakdown(workspaceId: string | null) {
  const [breakdown, setBreakdown] = useState<{
    byProject: UsageBreakdownItem[];
    byModel: UsageBreakdownItem[];
    byMode: UsageBreakdownItem[];
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: { byProject: UsageBreakdownItem[]; byModel: UsageBreakdownItem[]; byMode: UsageBreakdownItem[] } }>(
        `/workspaces/${workspaceId}/usage/me/breakdown`
      );
      setBreakdown(res.data);
    } catch (err) {
      console.error("Failed to load usage breakdown:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { breakdown, loading, refresh };
}

export function useWorkspaceUsageSummary(workspaceId: string | null) {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: UsageSummary }>(
        `/workspaces/${workspaceId}/usage`
      );
      setSummary(res.data);
    } catch (err) {
      console.error("Failed to load workspace usage summary:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { summary, loading, refresh };
}

export function useWorkspaceMembers(workspaceId: string | null) {
  const [members, setMembers] = useState<MemberUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: MemberUsage[] }>(
        `/workspaces/${workspaceId}/usage/members`
      );
      setMembers(res.data);
    } catch (err) {
      console.error("Failed to load workspace members usage:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { members, loading, refresh };
}

export function useWorkspaceProviders(workspaceId: string | null) {
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: ProviderUsage[] }>(
        `/workspaces/${workspaceId}/usage/providers`
      );
      setProviders(res.data);
    } catch (err) {
      console.error("Failed to load workspace providers usage:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { providers, loading, refresh };
}

// ── New hooks: hourly, token split, credits ────────────────────────────

export interface HourlyActivity {
  hour: number;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export interface TokenSplit {
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
}

export interface CreditInfo {
  todayCredits: number;
  monthCredits: number;
  dailyLimit: number;
  monthlyLimit: number;
  planType: string;
}

export function useMyHourlyActivity(workspaceId: string | null, period: "7d" | "30d" | "90d") {
  const [hours, setHours] = useState<HourlyActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - days);
      const res = await apiFetch<{ data: HourlyActivity[] }>(
        `/workspaces/${workspaceId}/usage/me/hourly?from=${from.toISOString()}&to=${to.toISOString()}`
      );
      setHours(res.data);
    } catch (err) {
      console.error("Failed to load hourly activity:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, period]);

  useEffect(() => { refresh(); }, [refresh]);
  return { hours, loading, refresh };
}

export function useMyTokenSplit(workspaceId: string | null) {
  const [split, setSplit] = useState<TokenSplit | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: TokenSplit }>(
        `/workspaces/${workspaceId}/usage/me/tokens`
      );
      setSplit(res.data);
    } catch (err) {
      console.error("Failed to load token split:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { split, loading, refresh };
}

export function useMyCredits(workspaceId: string | null) {
  const [credits, setCredits] = useState<CreditInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: CreditInfo }>(
        `/workspaces/${workspaceId}/usage/me/credits`
      );
      setCredits(res.data);
    } catch (err) {
      console.error("Failed to load credits:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { credits, loading, refresh };
}
