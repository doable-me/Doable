"use client";

import { useState } from "react";
import { Users, DollarSign, Zap, Hash, Globe, Building2, Github, ChevronDown, ChevronRight, Crown, Cpu } from "lucide-react";
import {
  usePlatformUsageSummary,
  usePlatformUsers,
  usePlatformCopilotAccounts,
  usePlatformModels,
  type PlatformUser,
  type PlatformCopilotAccount,
  type PlatformModelUsage,
} from "../hooks/use-usage";
import { formatTokenCount, formatCost } from "../utils/format-usage";

// ── Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-zinc-800 ${className}`} />;
}

// ── Stat Card ─────────────────────────────────────────────────────────
const ACCENT_CLASSES: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-400",
  emerald: "bg-emerald-500/10 text-emerald-400",
  violet: "bg-violet-500/10 text-violet-400",
  amber: "bg-amber-500/10 text-amber-400",
};

function StatCard({
  icon,
  label,
  value,
  subValue,
  loading,
  accent = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  subValue?: string;
  loading?: boolean;
  accent?: "blue" | "emerald" | "violet" | "amber";
}) {
  return (
    <div className="rounded-xl bg-zinc-900/80 border border-zinc-800 p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-md ${ACCENT_CLASSES[accent]}`}>{icon}</div>
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <div>
          <p className="text-lg font-semibold text-white tabular-nums">{value ?? "-"}</p>
          {subValue && <p className="text-xs text-zinc-500">{subValue}</p>}
        </div>
      )}
    </div>
  );
}

export function PlatformUsageTab() {
  const { summary, loading: summaryLoading } = usePlatformUsageSummary();
  const { users, loading: usersLoading } = usePlatformUsers(100);
  const { accounts, loading: accountsLoading } = usePlatformCopilotAccounts();
  const { models, loading: modelsLoading } = usePlatformModels();

  const loading = summaryLoading || usersLoading || accountsLoading;
  const empty = !loading && (!summary || summary.requestCount === 0);

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 py-12 text-center">
        <Globe className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500">No platform-wide usage data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2">
        <Globe className="h-3.5 w-3.5 inline mr-1.5 text-violet-400" />
        Platform-wide view — showing usage across all workspaces and users.
      </p>

      {/* ── Overview Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Total Tokens"
          value={summary ? formatTokenCount(summary.totalTokens) : undefined}
          loading={summaryLoading}
          accent="blue"
        />
        <StatCard
          icon={<DollarSign className="h-3.5 w-3.5" />}
          label="Total Cost"
          value={summary ? formatCost(summary.totalCostUsd) : undefined}
          loading={summaryLoading}
          accent="emerald"
        />
        <StatCard
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Workspaces"
          value={summary ? summary.workspaceCount.toLocaleString("en-US") : undefined}
          loading={summaryLoading}
          accent="violet"
        />
        <StatCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Active Users"
          value={summary ? summary.userCount.toLocaleString("en-US") : undefined}
          loading={summaryLoading}
          accent="amber"
        />
      </div>

      {/* ── All Users ── */}
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-5 flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-400" /> All Users Ranked by Tokens
        </h3>
        {usersLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <p className="text-xs text-zinc-500">No users with usage data.</p>
        ) : (
          <PlatformUsersList users={users} />
        )}
      </div>

      {/* ── Model Usage Breakdown ── */}
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-5 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-violet-400" /> Model Usage Breakdown
        </h3>
        {modelsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : models.length === 0 ? (
          <p className="text-xs text-zinc-500">No model usage data.</p>
        ) : (
          <PlatformModelsList models={models} />
        )}
      </div>

      {/* ── Copilot Accounts ── */}
      <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-sm font-medium text-white mb-5 flex items-center gap-2">
          <Github className="h-4 w-4 text-blue-400" /> All Copilot Accounts
        </h3>
        {accountsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-xs text-zinc-500">No Copilot accounts configured.</p>
        ) : (
          <PlatformCopilotAccountsList accounts={accounts} />
        )}
      </div>
    </div>
  );
}

// ── Platform Users List ───────────────────────────────────────────────
function PlatformUsersList({ users }: { users: PlatformUser[] }) {
  const maxTokens = Math.max(...users.map((u) => u.totalTokens), 1);

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
      {users.map((u, i) => {
        const pct = (u.totalTokens / maxTokens) * 100;
        const rank = i + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

        return (
          <div
            key={`${u.userId}-${u.workspaceId}`}
            className="group rounded-xl bg-zinc-800/40 p-3 hover:bg-zinc-800/60 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {medal ? (
                  <span className="text-sm shrink-0">{medal}</span>
                ) : (
                  <span className="text-xs text-zinc-500 w-5 shrink-0 tabular-nums">#{rank}</span>
                )}
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 font-medium truncate">
                    {u.displayName || u.email}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span className="truncate">{u.displayName ? u.email : ""}</span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400 truncate max-w-[120px]">
                      {u.workspaceName}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-zinc-400 tabular-nums">{u.requestCount} reqs</span>
                <span className="text-xs text-blue-400 font-medium tabular-nums">{formatTokenCount(u.totalTokens)}</span>
                <span className="text-xs text-zinc-300 font-medium tabular-nums">{formatCost(u.totalCostUsd)}</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-zinc-700/50 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Platform Copilot Accounts List ────────────────────────────────────
function PlatformCopilotAccountsList({ accounts }: { accounts: PlatformCopilotAccount[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {accounts.map((acc) => {
        const isExpanded = expandedIds.has(acc.copilotAccountId);
        const hasUsers = acc.users && acc.users.length > 0;

        return (
          <div
            key={acc.copilotAccountId}
            className="rounded-xl bg-zinc-800/40 overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => hasUsers && toggle(acc.copilotAccountId)}
              className={`w-full text-left p-3 flex items-center justify-between ${
                hasUsers ? "hover:bg-zinc-800/60 cursor-pointer" : ""
              } transition-colors`}
              disabled={!hasUsers}
            >
              <div className="flex items-center gap-3 min-w-0">
                {hasUsers && (
                  <span className="text-zinc-500">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-sm text-zinc-200 font-medium truncate flex items-center gap-2">
                    <Github className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    {acc.label || acc.githubLogin}
                    <span className="text-[10px] text-zinc-500">@{acc.githubLogin}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{acc.workspaceName}</span>
                    <span>• {acc.userCount} user{acc.userCount !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-zinc-400 tabular-nums">{acc.requestCount} reqs</span>
                <span className="text-xs text-blue-400 font-medium tabular-nums">{formatTokenCount(acc.totalTokens)}</span>
                <span className="text-xs text-zinc-300 font-medium tabular-nums">{formatCost(acc.totalCostUsd)}</span>
              </div>
            </button>

            {/* Expanded user list */}
            {isExpanded && hasUsers && (
              <div className="px-4 pb-3 pt-1 border-t border-zinc-700/50">
                <div className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">Users on this account</div>
                <div className="space-y-1.5">
                  {acc.users.map((u) => (
                    <div
                      key={u.userId}
                      className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/30"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-300 truncate">
                          {u.displayName || u.email}
                        </div>
                        {u.displayName && (
                          <div className="text-[10px] text-zinc-500 truncate">{u.email}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-zinc-500 tabular-nums">{u.requestCount} reqs</span>
                        <span className="text-xs text-blue-400 tabular-nums">{formatTokenCount(u.totalTokens)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Platform Models List ──────────────────────────────────────────────
function PlatformModelsList({ models }: { models: PlatformModelUsage[] }) {
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const maxTokens = Math.max(...models.map((m) => m.totalTokens), 1);

  const toggle = (model: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {models.map((m) => {
        const isExpanded = expandedModels.has(m.model);
        const pct = (m.totalTokens / maxTokens) * 100;
        const hasUsers = m.users && m.users.length > 0;

        return (
          <div key={m.model} className="rounded-xl bg-zinc-800/40 overflow-hidden">
            <button
              onClick={() => hasUsers && toggle(m.model)}
              className={`w-full text-left p-3 ${hasUsers ? "hover:bg-zinc-800/60 cursor-pointer" : ""} transition-colors`}
              disabled={!hasUsers}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {hasUsers && (
                    <span className="text-zinc-500">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  )}
                  <Cpu className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-zinc-200 font-medium truncate">{m.model}</div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                      {m.provider && <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400">{m.provider}</span>}
                      <span>{m.userCount} user{m.userCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-zinc-400 tabular-nums">{m.requestCount} reqs</span>
                  <span className="text-xs text-blue-400 font-medium tabular-nums">{formatTokenCount(m.totalTokens)}</span>
                  <span className="text-xs text-zinc-300 font-medium tabular-nums">{formatCost(m.totalCostUsd)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-700/50 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>

            {isExpanded && hasUsers && (
              <div className="px-4 pb-3 pt-1 border-t border-zinc-700/50">
                <div className="text-[10px] uppercase text-zinc-500 mb-2 tracking-wider">Used by</div>
                <div className="space-y-1.5">
                  {m.users.map((u) => (
                    <div
                      key={`${u.userId}-${u.workspaceName}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-zinc-800/30"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-300 truncate">{u.displayName || u.email}</div>
                        <div className="text-[10px] text-zinc-500 truncate flex items-center gap-1.5">
                          {u.displayName && <span>{u.email}</span>}
                          <span className="px-1.5 py-0.5 rounded bg-zinc-700/40">{u.workspaceName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-zinc-500 tabular-nums">{u.requestCount} reqs</span>
                        <span className="text-xs text-violet-400 tabular-nums">{formatTokenCount(u.totalTokens)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}