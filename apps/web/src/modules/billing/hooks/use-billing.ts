"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Credits {
  id?: string;
  workspace_id?: string;
  daily_remaining: number;
  daily_total: number;
  monthly_remaining: number;
  monthly_total: number;
  rollover_credits: number;
  total_available: number;
  daily_reset_at: string | null;
  monthly_reset_at: string | null;
  plan_type: string;
  // Legacy fields for backward compat
  last_daily_reset?: string | null;
  last_monthly_reset?: string | null;
}

export interface UsageEntry {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  credits_used: number;
  credits_consumed?: number;
  action: string;
  action_type?: string;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  model?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CreditUsageHistory {
  rows: UsageEntry[];
  total: number;
  dailyBreakdown: { date: string; total: number }[];
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  dailyCredits: number;
  monthlyCredits: number;
  maxProjects: number;
  maxMembers: number;
}

export interface Subscription {
  plan: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  stripe_subscription_id: string | null;
}

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("doable_access_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function usePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/billing/plans`)
      .then((r) => r.json())
      .then((res) => setPlans(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return { plans, loading };
}

export function useCredits(workspaceId: string | undefined) {
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/billing/credits?workspaceId=${workspaceId}`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((res) => setCredits(res.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { credits, loading, refresh };
}

export function useUsage(workspaceId: string | undefined) {
  const [usage, setUsage] = useState<UsageEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    fetch(`${API_URL}/billing/usage?workspaceId=${workspaceId}`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((res) => setUsage(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  return { usage, loading };
}

export function useCreditUsage(workspaceId: string | undefined, days: number = 30) {
  const [data, setData] = useState<CreditUsageHistory | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/billing/credits/usage?workspaceId=${workspaceId}&days=${days}`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((res) => setData(res.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId, days]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, refresh };
}

export function useCurrentPlan(workspaceId: string | undefined) {
  const [plan, setPlan] = useState<string>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    // Get workspace to determine current plan
    const token =
      typeof window !== "undefined" ? localStorage.getItem("doable_access_token") : null;
    fetch(`${API_URL}/workspaces/${workspaceId}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })
      .then((r) => r.json())
      .then((res) => setPlan(res.data?.plan ?? "free"))
      .catch(() => setPlan("free"))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  return { plan, loading };
}

export function useSubscription(workspaceId: string | undefined) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`${API_URL}/billing/subscription?workspaceId=${workspaceId}`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((res) => setSubscription(res.data ?? null))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { subscription, loading, refresh };
}

export function useBillingActions(workspaceId: string | undefined) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const subscribe = async (planId: string, interval: "monthly" | "yearly" = "monthly") => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/subscribe`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ workspaceId, planId, interval }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start checkout");
        return;
      }
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError("Checkout URL not available. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const openPortal = async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to open billing portal");
        return;
      }
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError("Portal URL not available. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const topUp = async (credits: number) => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/top-up`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ workspaceId, credits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start top-up checkout");
        return;
      }
      if (data.data?.url) {
        window.location.href = data.data.url;
      } else {
        setError("Top-up URL not available. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return { subscribe, openPortal, topUp, loading, error, clearError };
}
