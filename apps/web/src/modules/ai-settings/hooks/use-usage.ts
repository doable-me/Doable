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

// ── Admin: Member model breakdown ──────────────────────────────────────

export interface MemberModelUsage {
  userId: string;
  email: string;
  displayName: string | null;
  model: string;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export function useMemberModelBreakdown(workspaceId: string | null) {
  const [data, setData] = useState<MemberModelUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: MemberModelUsage[] }>(
        `/workspaces/${workspaceId}/usage/members/models`
      );
      setData(res.data);
    } catch (err) {
      console.error("Failed to load member model breakdown:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

// ── Admin: Copilot account usage ───────────────────────────────────────

export interface CopilotAccountUsage {
  copilotAccountId: string;
  label: string;
  githubLogin: string;
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  requestCount: number;
  totalTokens: number;
  totalCostUsd: number;
}

export function useCopilotAccountUsage(workspaceId: string | null) {
  const [data, setData] = useState<CopilotAccountUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: CopilotAccountUsage[] }>(
        `/workspaces/${workspaceId}/usage/copilot-accounts`
      );
      setData(res.data);
    } catch (err) {
      console.error("Failed to load copilot account usage:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

// ── Admin: Top token consumers ─────────────────────────────────────────

export interface TopConsumer {
  userId: string;
  email: string;
  displayName: string | null;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  thinkingTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

export function useTopTokenConsumers(workspaceId: string | null, limit: number = 10) {
  const [data, setData] = useState<TopConsumer[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ data: TopConsumer[] }>(
        `/workspaces/${workspaceId}/usage/top-consumers?limit=${limit}`
      );
      setData(res.data);
    } catch (err) {
      console.error("Failed to load top consumers:", err);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, limit]);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM-WIDE HOOKS (for platform admins - cross-workspace visibility)
// ═══════════════════════════════════════════════════════════════════════════

export interface PlatformUsageSummary extends UsageSummary {
  workspaceCount: number;
  userCount: number;
}

export interface PlatformUserSource {
  kind: "copilot" | "provider" | "direct";
  label: string;
  githubLogin: string | null;
  providerType: string | null;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  totalTokens: number;
  requestCount: number;
  models: PlatformUserModelUsage[];
}

export interface PlatformUser {
  userId: string;
  email: string;
  displayName: string | null;
  workspaceId: string;
  workspaceName: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalCostUsd: number;
  requestCount: number;
  lastUsedAt: string;
  sources: PlatformUserSource[];
}

export interface PlatformUserModelUsage {
  model: string;
  totalTokens: number;
  requestCount: number;
}

export interface PlatformSubscriptionUser {
  userId: string;
  email: string;
  displayName: string | null;
  totalTokens: number;
  requestCount: number;
  models: PlatformUserModelUsage[];
}

export interface PlatformSubscriptionOwner {
  email: string;
  displayName: string | null;
}

export interface PlatformCopilotAccount {
  githubLogin: string;
  label: string;
  workspaceNames: string[];
  workspaceCount: number;
  userCount: number;
  addedAt: string | null;
  owners: PlatformSubscriptionOwner[];
  users: PlatformSubscriptionUser[];
  totalTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

export interface PlatformCustomProvider {
  providerType: string;
  label: string;
  workspaceNames: string[];
  workspaceCount: number;
  userCount: number;
  addedAt: string | null;
  owners: PlatformSubscriptionOwner[];
  users: PlatformSubscriptionUser[];
  totalTokens: number;
  totalCostUsd: number;
  requestCount: number;
}

export function usePlatformUsageSummary() {
  const [summary, setSummary] = useState<PlatformUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PlatformUsageSummary }>("/workspaces/platform/usage");
      setSummary(res.data);
    } catch (err) {
      console.error("Failed to load platform usage summary:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { summary, loading, refresh };
}

export function usePlatformUsers(limit: number = 50) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PlatformUser[] }>(`/workspaces/platform/usage/users?limit=${limit}`);
      setUsers(res.data);
    } catch (err) {
      console.error("Failed to load platform users:", err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { refresh(); }, [refresh]);
  return { users, loading, refresh };
}

export function usePlatformCopilotAccounts() {
  const [accounts, setAccounts] = useState<PlatformCopilotAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PlatformCopilotAccount[] }>("/workspaces/platform/usage/copilot-accounts");
      setAccounts(res.data);
    } catch (err) {
      console.error("Failed to load platform copilot accounts:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { accounts, loading, refresh };
}

export function usePlatformCustomProviders() {
  const [providers, setProviders] = useState<PlatformCustomProvider[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PlatformCustomProvider[] }>("/workspaces/platform/usage/custom-providers");
      setProviders(res.data);
    } catch (err) {
      console.error("Failed to load platform custom providers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { providers, loading, refresh };
}

export interface PlatformModelUsage {
  model: string;
  provider: string | null;
  totalTokens: number;
  totalCostUsd: number;
  requestCount: number;
  userCount: number;
  users: Array<{
    userId: string;
    email: string;
    displayName: string | null;
    workspaceName: string;
    totalTokens: number;
    requestCount: number;
  }>;
}

export function usePlatformModels() {
  const [models, setModels] = useState<PlatformModelUsage[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PlatformModelUsage[] }>("/workspaces/platform/usage/models");
      setModels(res.data);
    } catch (err) {
      console.error("Failed to load platform models:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { models, loading, refresh };
}
