"use client";

import { useState } from "react";
import { Users, DollarSign, Zap, Clock, Hash, Server, Crown, Cpu, Github, ChevronDown, ChevronRight, Trophy } from "lucide-react";
import {
  useWorkspaceUsageSummary,
  useWorkspaceMembers,
  useWorkspaceProviders,
  useMemberModelBreakdown,
  useCopilotAccountUsage,
  useTopTokenConsumers,
  type MemberModelUsage,
  type CopilotAccountUsage,
  type TopConsumer,
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
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
}

// ── Colors ───────────────────────────────────────────────────────────
const PROVIDER_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899"];
const MEMBER_COLORS = ["#60a5fa", "#a78bfa", "#fbbf24", "#34d399", "#f87171", "#f472b6", "#38bdf8", "#c084fc"];
const MODEL_COLORS = ["#818cf8", "#fb923c", "#4ade80", "#f472b6", "#22d3ee", "#a3e635"];

export function WorkspaceUsageTab({ workspaceId }: WorkspaceUsageTabProps) {
  const { summary, loading: summaryLoading } = useWorkspaceUsageSummary(workspaceId);
  const { members, loading: membersLoading } = useWorkspaceMembers(workspaceId);
  const { providers, loading: providersLoading } = useWorkspaceProviders(workspaceId);
  const { data: memberModels, loading: memberModelsLoading } = useMemberModelBreakdown(workspaceId);
  const { data: copilotAccounts, loading: copilotAccountsLoading } = useCopilotAccountUsage(workspaceId);
  const { data: topConsumers, loading: topConsumersLoading } = useTopTokenConsumers(workspaceId, 10);

  const loading = summaryLoading || membersLoading || providersLoading;
  const empty = !loading && (!summary || (summary.requestCount === 0 && summary.totalTokens === 0));

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No workspace usage data yet</p>
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

      {/* ── Top Token Consumers ── */}
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <h3 className="text-sm font-medium text-foreground mb-5 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-400" /> Top Token Consumers
        </h3>
        {topConsumersLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : topConsumers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No usage data yet.</p>
        ) : (
          <TopConsumersList consumers={topConsumers} />
        )}
      </div>

      {/* ── Member Usage with Model Breakdown ── */}
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <h3 className="text-sm font-medium text-foreground mb-5 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-violet-400" /> Member Usage by Model
        </h3>
        {membersLoading || memberModelsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <p className="text-xs text-muted-foreground">No member usage data.</p>
        ) : (
          <MemberModelBreakdown members={members} memberModels={memberModels} />
        )}
      </div>

      {/* ── Copilot Account Usage ── */}
      {copilotAccounts.length > 0 && (
        <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-5 flex items-center gap-2">
            <Github className="h-4 w-4 text-blue-400" /> Copilot Account Usage
          </h3>
          {copilotAccountsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <CopilotAccountsList accounts={copilotAccounts} />
          )}
        </div>
      )}

      {/* ── Provider Distribution (donut + legend) ── */}
      <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
        <h3 className="text-sm font-medium text-foreground mb-5 flex items-center gap-2">
          <Server className="h-4 w-4 text-violet-400" /> Provider Distribution
        </h3>
        {providersLoading ? (
          <div className="flex items-center justify-center py-8">
            <Skeleton className="h-32 w-32 rounded-full" />
          </div>
        ) : providers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No provider usage data.</p>
        ) : (
          <ProviderDonut providers={providers} />
        )}
      </div>
    </div>
  );
}

// ── Top Consumers List ────────────────────────────────────────────────
function TopConsumersList({ consumers }: { consumers: TopConsumer[] }) {
  const maxTokens = Math.max(...consumers.map((c) => c.totalTokens), 1);
  
  return (
    <div className="space-y-3">
      {consumers.map((c, i) => {
        const pct = (c.totalTokens / maxTokens) * 100;
        const rank = i + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
        
        return (
          <div
            key={c.userId}
            className="group rounded-xl bg-muted/50 p-3 hover:bg-muted transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {medal ? (
                  <span className="text-sm shrink-0">{medal}</span>
                ) : (
                  <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums">#{rank}</span>
                )}
                <div className="min-w-0">
                  <div className="text-sm text-foreground font-medium truncate">
                    {c.displayName || c.email}
                  </div>
                  {c.displayName && (
                    <div className="text-[10px] text-muted-foreground truncate">{c.email}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">{c.requestCount} reqs</span>
                <span className="text-xs text-blue-400 font-medium tabular-nums">{formatTokenCount(c.totalTokens)}</span>
                <span className="text-xs text-foreground font-medium tabular-nums">{formatCost(c.totalCostUsd)}</span>
              </div>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-blue-500 to-violet-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Token breakdown tooltip-style info */}
            <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
              <span>Prompt: {formatTokenCount(c.promptTokens)}</span>
              <span>Output: {formatTokenCount(c.completionTokens)}</span>
              {c.thinkingTokens > 0 && <span>Thinking: {formatTokenCount(c.thinkingTokens)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Member Model Breakdown ────────────────────────────────────────────
function MemberModelBreakdown({
  members,
  memberModels,
}: {
  members: { userId: string; displayName?: string | null; email: string; requestCount: number; totalTokens: number; totalCostUsd: number }[];
  memberModels: MemberModelUsage[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  
  // Group models by user
  const modelsByUser = new Map<string, MemberModelUsage[]>();
  for (const mm of memberModels) {
    if (!modelsByUser.has(mm.userId)) modelsByUser.set(mm.userId, []);
    modelsByUser.get(mm.userId)!.push(mm);
  }
  
  const maxTokens = Math.max(...members.map((m) => m.totalTokens), 1);
  
  const toggle = (userId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {members.map((m, i) => {
        const pct = (m.totalTokens / maxTokens) * 100;
        const isTop = i === 0;
        const isExpanded = expanded.has(m.userId);
        const userModels = modelsByUser.get(m.userId) || [];
        const hasModels = userModels.length > 0;
        
        return (
          <div key={m.userId} className="rounded-xl bg-muted/50 overflow-hidden">
            <div
              className={`p-3 ${hasModels ? "cursor-pointer hover:bg-muted" : ""} transition-all duration-200`}
              onClick={() => hasModels && toggle(m.userId)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {hasModels && (
                    isExpanded ? 
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> :
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  {isTop && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                  <div className="min-w-0">
                    <div className="text-sm text-foreground font-medium truncate">
                      {m.displayName || m.email}
                    </div>
                    {m.displayName && (
                      <div className="text-[10px] text-muted-foreground truncate">{m.email}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums">{m.requestCount} reqs</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatTokenCount(m.totalTokens)}</span>
                  <span className="text-xs text-foreground font-medium tabular-nums">{formatCost(m.totalCostUsd)}</span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: MEMBER_COLORS[i % MEMBER_COLORS.length],
                  }}
                />
              </div>
            </div>
            
            {/* Expanded model breakdown */}
            {isExpanded && userModels.length > 0 && (
              <div className="px-3 pb-3 pt-1 border-t border-border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Models used</div>
                <div className="space-y-1.5">
                  {userModels.map((mm, j) => (
                    <div key={mm.model} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: MODEL_COLORS[j % MODEL_COLORS.length] }}
                      />
                      <span className="text-xs text-foreground flex-1 truncate">{mm.model}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{mm.requestCount} reqs</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{formatTokenCount(mm.totalTokens)}</span>
                      <span className="text-[10px] text-foreground tabular-nums">{formatCost(mm.totalCostUsd)}</span>
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

// ── Copilot Accounts List ─────────────────────────────────────────────
function CopilotAccountsList({ accounts }: { accounts: CopilotAccountUsage[] }) {
  // Group by account
  const byAccount = new Map<string, { label: string; githubLogin: string; users: CopilotAccountUsage[]; totalTokens: number; totalCostUsd: number }>();
  
  for (const acc of accounts) {
    if (!byAccount.has(acc.copilotAccountId)) {
      byAccount.set(acc.copilotAccountId, {
        label: acc.label,
        githubLogin: acc.githubLogin,
        users: [],
        totalTokens: 0,
        totalCostUsd: 0,
      });
    }
    const entry = byAccount.get(acc.copilotAccountId)!;
    entry.users.push(acc);
    entry.totalTokens += acc.totalTokens;
    entry.totalCostUsd += acc.totalCostUsd;
  }
  
  const accountList = Array.from(byAccount.entries()).sort((a, b) => b[1].totalCostUsd - a[1].totalCostUsd);
  const maxCost = Math.max(...accountList.map(([, a]) => a.totalCostUsd), 1);

  return (
    <div className="space-y-4">
      {accountList.map(([accountId, account], i) => (
        <div key={accountId} className="rounded-xl bg-muted/50 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Github className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-foreground font-medium truncate">{account.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">@{account.githubLogin}</div>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums">{formatTokenCount(account.totalTokens)}</span>
              <span className="text-xs text-foreground font-medium tabular-nums">{formatCost(account.totalCostUsd)}</span>
            </div>
          </div>
          
          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
              style={{ width: `${(account.totalCostUsd / maxCost) * 100}%` }}
            />
          </div>
          
          {/* Users who used this account */}
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Used by</div>
          <div className="flex flex-wrap gap-2">
            {account.users.map((u) => (
              <div
                key={u.userId}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted text-xs"
              >
                <span className="text-foreground">{u.userDisplayName || u.userEmail}</span>
                <span className="text-muted-foreground">{formatTokenCount(u.totalTokens)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
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
          <span className="text-lg font-bold text-foreground">{formatCost(total)}</span>
          <span className="text-[10px] text-muted-foreground">total cost</span>
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
                <span className="text-xs text-foreground font-medium">
                  {p.providerLabel || capitalize(p.provider)}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums ml-2">
                  {formatCost(p.totalCostUsd)} ({total > 0 ? Math.round((p.totalCostUsd / total) * 100) : 0}%)
                </span>
              </div>
              <div className="flex gap-3 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{p.requestCount} reqs</span>
                <span className="text-[10px] text-muted-foreground">{formatTokenCount(p.totalTokens)} tokens</span>
                <span className="text-[10px] text-muted-foreground">{p.uniqueModels} models</span>
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
    <div className={`group bg-card backdrop-blur border border-border rounded-2xl p-5 transition-all duration-300 hover:border-border hover:shadow-lg ${ring}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-muted">
          {icon}
        </div>
        <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <div className="text-foreground text-2xl font-bold tabular-nums">{value}</div>
      )}
    </div>
  );
}
