"use client";

import { Users, DollarSign, Zap, Clock, Hash, Server } from "lucide-react";
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

export function WorkspaceUsageTab({ workspaceId }: WorkspaceUsageTabProps) {
  const { summary, loading: summaryLoading } = useWorkspaceUsageSummary(workspaceId);
  const { members, loading: membersLoading } = useWorkspaceMembers(workspaceId);
  const { providers, loading: providersLoading } = useWorkspaceProviders(workspaceId);

  const loading = summaryLoading || membersLoading || providersLoading;
  const empty = !loading && (!summary || (summary.requestCount === 0 && summary.totalTokens === 0));

  if (empty) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700 py-12 text-center">
        <Users className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-500">No workspace usage data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Overview Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Zap className="h-4 w-4 text-zinc-500" />}
          label="Total Tokens"
          value={summary ? formatTokenCount(summary.totalTokens) : undefined}
          loading={summaryLoading}
        />
        <StatCard
          icon={<DollarSign className="h-4 w-4 text-zinc-500" />}
          label="Total Cost"
          value={summary ? formatCost(summary.totalCostUsd) : undefined}
          loading={summaryLoading}
        />
        <StatCard
          icon={<Hash className="h-4 w-4 text-zinc-500" />}
          label="Total Requests"
          value={summary ? summary.requestCount.toLocaleString("en-US") : undefined}
          loading={summaryLoading}
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-zinc-500" />}
          label="Avg Response"
          value={summary ? formatDuration(summary.avgDurationMs) : undefined}
          loading={summaryLoading}
        />
      </div>

      {/* ── Member Leaderboard ── */}
      <section>
        <h3 className="text-sm font-medium text-white mb-3">Member Usage</h3>
        {membersLoading ? (
          <TableSkeleton rows={3} cols={4} />
        ) : members.length === 0 ? (
          <p className="text-xs text-zinc-500">No member usage data.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Member</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Requests</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Tokens</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {members.map((m) => (
                  <tr key={m.userId} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="text-zinc-200 text-sm">{m.displayName || m.email}</div>
                      {m.displayName && (
                        <div className="text-zinc-500 text-xs">{m.email}</div>
                      )}
                    </td>
                    <td className="text-right text-zinc-300 px-3 py-2.5 tabular-nums">
                      {m.requestCount.toLocaleString("en-US")}
                    </td>
                    <td className="text-right text-zinc-300 px-3 py-2.5 tabular-nums">
                      {formatTokenCount(m.totalTokens)}
                    </td>
                    <td className="text-right text-zinc-300 px-3 py-2.5 tabular-nums">
                      {formatCost(m.totalCostUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Provider Distribution ── */}
      <section>
        <h3 className="text-sm font-medium text-white mb-3">Provider Usage</h3>
        {providersLoading ? (
          <TableSkeleton rows={2} cols={5} />
        ) : providers.length === 0 ? (
          <p className="text-xs text-zinc-500">No provider usage data.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Provider</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Requests</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Tokens</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Cost</th>
                  <th className="text-right text-zinc-500 text-xs uppercase tracking-wider px-3 py-2">Models</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {providers.map((p) => (
                  <tr key={p.provider} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="px-3 py-2.5 flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                      <span className="text-zinc-200">
                        {p.providerLabel || capitalize(p.provider)}
                      </span>
                    </td>
                    <td className="text-right text-zinc-300 px-3 py-2.5 tabular-nums">
                      {p.requestCount.toLocaleString("en-US")}
                    </td>
                    <td className="text-right text-zinc-300 px-3 py-2.5 tabular-nums">
                      {formatTokenCount(p.totalTokens)}
                    </td>
                    <td className="text-right text-zinc-300 px-3 py-2.5 tabular-nums">
                      {formatCost(p.totalCostUsd)}
                    </td>
                    <td className="text-right text-zinc-300 px-3 py-2.5 tabular-nums">
                      {p.uniqueModels}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  loading: boolean;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-zinc-400 text-xs uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-zinc-800 rounded animate-pulse" />
      ) : (
        <div className="text-white text-2xl font-bold">{value}</div>
      )}
    </div>
  );
}

function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 overflow-hidden">
      <div className="divide-y divide-zinc-800">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-3 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className={`h-4 bg-zinc-800 rounded animate-pulse ${j === 0 ? "w-32" : "w-16 ml-auto"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
