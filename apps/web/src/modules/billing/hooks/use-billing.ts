"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface Credits {
  id: string;
  workspace_id: string;
  daily_remaining: number;
  monthly_remaining: number;
  rollover_credits: number;
  last_daily_reset: string | null;
  last_monthly_reset: string | null;
}

export interface UsageEntry {
  id: string;
  workspace_id: string;
  user_id: string;
  project_id: string | null;
  credits_used: number;
  action: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
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
  current_period_end: string | null;
  cancel_at: string | null;
}

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
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
    if (!workspaceId) return;
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
    if (!workspaceId) return;
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

export function useBillingActions(workspaceId: string | undefined) {
  const [loading, setLoading] = useState(false);

  const subscribe = async (planId: string, interval: "monthly" | "yearly" = "monthly") => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/subscribe`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ workspaceId, planId, interval }),
      });
      const data = await res.json();
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } finally {
      setLoading(false);
    }
  };

  const openPortal = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ workspaceId }),
      });
      const data = await res.json();
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } finally {
      setLoading(false);
    }
  };

  const topUp = async (credits: number) => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/top-up`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ workspaceId, credits }),
      });
      const data = await res.json();
      if (data.data?.url) {
        window.location.href = data.data.url;
      }
    } finally {
      setLoading(false);
    }
  };

  return { subscribe, openPortal, topUp, loading };
}
