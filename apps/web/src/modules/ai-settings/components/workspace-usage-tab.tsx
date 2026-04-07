"use client";

import { useState } from "react";
import { Users, DollarSign, Zap, Clock, Hash, Server, Crown } from "lucide-react";
import {
  useWorkspaceUsageSummary,
  useWorkspaceMembers,
  useWorkspaceProviders,
} from "../hooks/use-usage";
import {
  formatTokenCount,
  formatCost,
  formatDuration,
} from "../utils/format-usage";

interface WorkspaceUsageTabProps {
  workspaceId: string | null;
}

// ── Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

// ── AnimatedValue ─────────────────────────────────────────────────────
function AnimatedValue({ value, loading }: { value: string; loading: boolean }) {
  if (loading) return <Skeleton className="h-8 w-24" />;
  return <div className="text-2xl font-bold tabular-nums text-white">{value}</div>;
}

// ── Provider colors ───────────────────────────────────────────────────
const PROVIDER_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899"];
const MEMBER_COLORS = ["#60a5fa", "#a78bfa", "#fbbf24", "#34d399", "#f87171", "#f472b6", "#38bdf8", "#c084fc"];

export function WorkspaceUsageTab({ workspaceId }: WorkspaceUsageTabProps) {
  const { summary, loading: summaryLoading } = useWorkspaceUsageSummary(workspaceId);
  const { members, loading: membersLoading } = useWorkspaceMembers(workspaceId);
  const { providers, loading: providersLoading } = useWorkspaceProviders(workspaceId);

  const loading = summaryLoading || membersLoading || providersLoading;
  const empty = !loading && (!summary || (summary.requestCount === 0 && summary.totalTokens === 0));

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 py-12 text-center">
        <Users className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500">No workspace usage data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Overview Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Zap className="h-3.5 w-3.5 text-blue-400" />}
          label="Total Tokens"
          value={summary ? formatTokenCount(summary.totalTokens) : undefined}
          loading={summaryLoading}
          accent="blue"
        />
        <StatCard
          icon={<DollarSign className="h-3.5 w-3.5 text-emerald-400" />}
          label="Total Cost"
          value={summary ? formatCost(summary.totalCostUsd) : undefined}
          loading={summaryLoading}
          accent="emerald"
        />
        <StatCard
          icon={<Hash className="h-3.5 w-3.5 text-violet-400" />}
          label="Total Requests"
          value={summary ? summary.requestCount.toLocaleString("en-US") : undefined}
          loading={summaryLoading}
          accent="violet"
        />
        <StatCard
          icon={<Clock className="h-3.5 w-3.5 text-amber-400" />}
          label="Avg Response"
          value={summary ? formatDuration(summary.avgDurationMs) : undefined}
          loading={summaryLoading}
          accent="amber"
        />
      </div>

      {/* ── Member Usage (bar chart + table) ── */}
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-5 flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-400" /> Member Usage
        </h3>
        {membersLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="text-xs text-zinc-500">No member usage data.</p>
        ) : (
          <MemberBars members={members} />
        )}
      </div>

      {/* ── Provider Distribution (donut + legend) ── */}
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-5 flex items-center gap-2">
          <Server className="h-4 w-4 text-violet-400" /> Provider Distribution
        </h3>
        {providersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
        ) : providers.length === 0 ? (
          <p className="text-xs text-zinc-500">No provider usage data.</p>
        ) : (
          <ProviderDonut providers={providers} />
        )}
      </div>
    </div>
  );
}

// ── Member Horizontal Bars ────────────────────────────────────────────
function MemberBars({
  members,
}: {
  members: { userId: string; displayName?: string | null; email: string; requestCount: number; totalTokens: number; totalCostUsd: number }[];
}) {
  const maxTokens = Math.max(...members.map((m) => m.totalTokens), 1);

  return (
    <div className="space-y-3">
      {members.map((m, i) => {
        const pct = (m.totalTokens / maxTokens) * 100;
        const isTop = i === 0;
        return (
          <div
            key={m.userId}
            className="group rounded-xl bg-zinc-800/40 p-3 hover:bg-zinc-800/60 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {isTop && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 font-medium truncate">
                    {m.displayName || m.email}
                  </div>
                  {m.displayName && (
                    <div className="text-[10px] text-zinc-500 truncate">{m.email}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-zinc-400 tabular-nums">{m.requestCount} reqs</span>
                <span className="text-xs text-zinc-400 tabular-nums">{formatTokenCount(m.totalTokens)}</span>
                <span className="text-xs text-zinc-300 font-medium tabular-nums">{formatCost(m.totalCostUsd)}</span>
              </div>
            </div>
            <div className="h-2 bg-zinc-700/50 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Provider Donut ────────────────────────────────────────────────────
function ProviderDonut({
  providers,
}: {
  providers: { provider: string; providerLabel?: string | null; requestCount: number; totalTokens: number; totalCostUsd: number; uniqueModels: number }[];
}) {
  const total = providers.reduce((s, p) => s + p.totalCostUsd, 0);
  const radius = 50;
  const strokeW = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = providers.map((p, i) => {
    const pct = total > 0 ? p.totalCostUsd / total : 1 / providers.length;
    const dash = circumference * pct;
    const seg = { dash, gap: circumference - dash, offset, color: PROVIDER_COLORS[i % PROVIDER_COLORS.length], pct };
    offset -= dash;
    return seg;
  });

  return (
    <div className="flex items-center gap-8 flex-wrap justify-center">
      <div className="relative w-36 h-36 shrink-0">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeDasharray={`${seg.dash} ${seg.gap}`}
              strokeDashoffset={seg.offset}
              className="transition-all duration-700 ease-out"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white">{formatCost(total)}</span>
          <span className="text-[10px] text-zinc-500">total cost</span>
        </div>
      </div>
      <div className="space-y-3 min-w-[200px]">
        {providers.map((p, i) => (
          <div key={p.provider} className="flex items-center gap-3">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: PROVIDER_COLORS[i % PROVIDER_COLORS.length] }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-zinc-200 font-medium">
                  {p.providerLabel || capitalize(p.provider)}
                </span>
                <span className="text-[10px] text-zinc-500 tabular-nums ml-2">
                  {formatCost(p.totalCostUsd)} ({total > 0 ? Math.round((p.totalCostUsd / total) * 100) : 0}%)
                </span>
              </div>
              <div className="flex gap-3 mt-0.5">
                <span className="text-[10px] text-zinc-500">{p.requestCount} reqs</span>
                <span className="text-[10px] text-zinc-500">{formatTokenCount(p.totalTokens)} tokens</span>
                <span className="text-[10px] text-zinc-500">{p.uniqueModels} models</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Internal helpers ──────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function StatCard({
  icon,
  label,
  value,
  loading,
  accent = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  loading: boolean;
  accent?: string;
}) {
  const ring = {
    blue: "group-hover:shadow-blue-500/10",
    emerald: "group-hover:shadow-emerald-500/10",
    violet: "group-hover:shadow-violet-500/10",
    amber: "group-hover:shadow-amber-500/10",
  }[accent] ?? "group-hover:shadow-blue-500/10";

  return (
    <div className={`group bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5 transition-all duration-300 hover:border-zinc-700 hover:shadow-lg ${ring}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-zinc-800/80">
          {icon}
        </div>
        <span className="text-zinc-400 text-xs uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="text-white text-2xl font-bold tabular-nums">{value}</div>
      )}
    </div>
  );
}
