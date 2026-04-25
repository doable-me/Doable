"use client";

import { useState } from "react";
import { Users, DollarSign, Zap, Globe, Building2, Github, ChevronDown, ChevronRight, Crown, Cpu, Key, AlertTriangle } from "lucide-react";
import {
  usePlatformUsageSummary,
  usePlatformUsers,
  usePlatformCopilotAccounts,
  usePlatformCustomProviders,
  usePlatformModels,
  type PlatformUser,
  type PlatformCopilotAccount,
  type PlatformCustomProvider,
  type PlatformSubscriptionUser,
  type PlatformSubscriptionOwner,
  type PlatformModelUsage,
} from "../hooks/use-usage";
import { formatTokenCount, formatCost } from "../utils/format-usage";

// ── Skeleton ──────────────────────────────────────────────────────────
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />;
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
    <div className="rounded-xl bg-card border border-border p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-md ${ACCENT_CLASSES[accent]}`}>{icon}</div>
        <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-20" />
      ) : (
        <div>
          <p className="text-lg font-semibold text-foreground tabular-nums">{value ?? "-"}</p>
          {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
        </div>
      )}
    </div>
  );
}

// ── Sub-tabs ──────────────────────────────────────────────────────────
type SubTab = "overview" | "copilot" | "providers" | "models";

const SUB_TABS: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
  { id: "overview", label: "Overview", icon: <Crown className="h-3.5 w-3.5" /> },
  { id: "copilot", label: "Copilot Subscriptions", icon: <Github className="h-3.5 w-3.5" /> },
  { id: "providers", label: "Custom Providers", icon: <Key className="h-3.5 w-3.5" /> },
  { id: "models", label: "Models", icon: <Cpu className="h-3.5 w-3.5" /> },
];

export function PlatformUsageTab() {
  const [active, setActive] = useState<SubTab>("overview");

  const { summary, loading: summaryLoading } = usePlatformUsageSummary();
  const { users, loading: usersLoading } = usePlatformUsers(100);
  const { accounts, loading: accountsLoading } = usePlatformCopilotAccounts();
  const { providers, loading: providersLoading } = usePlatformCustomProviders();
  const { models, loading: modelsLoading } = usePlatformModels();

  const empty = !summaryLoading && (!summary || summary.requestCount === 0);

  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center">
        <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No platform-wide usage data yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Description */}
      <p className="text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-2">
        <Globe className="h-3.5 w-3.5 inline mr-1.5 text-violet-400" />
        Platform-wide view — showing usage across all workspaces and users.
      </p>

      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              active === t.id
                ? "border-violet-400 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {active === "overview" && (
        <div className="space-y-6">
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

          <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
            <h3 className="text-sm font-medium text-foreground mb-5 flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" /> All Users Ranked by Tokens
            </h3>
            {usersLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <p className="text-xs text-muted-foreground">No users with usage data.</p>
            ) : (
              <PlatformUsersList users={users} />
            )}
          </div>
        </div>
      )}

      {active === "copilot" && (
        <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
            <Github className="h-4 w-4 text-blue-400" /> Copilot Subscriptions
          </h3>
          <p className="text-xs text-muted-foreground mb-5">
            One row per GitHub Copilot subscription. Expand to see which users are assigned and which models each user called.
          </p>
          {accountsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No Copilot accounts configured.</p>
          ) : (
            <SubscriptionsList
              items={accounts.map((a): SubscriptionRow => ({
                id: `copilot:${a.githubLogin}`,
                title: a.label || a.githubLogin,
                subtitle: `@${a.githubLogin}`,
                icon: <Github className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
                workspaceNames: a.workspaceNames,
                workspaceCount: a.workspaceCount,
                userCount: a.userCount,
                addedAt: a.addedAt,
                owners: a.owners,
                users: a.users,
                totalTokens: a.totalTokens,
                totalCostUsd: a.totalCostUsd,
                requestCount: a.requestCount,
              }))}
            />
          )}
        </div>
      )}

      {active === "providers" && (
        <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-1 flex items-center gap-2">
            <Key className="h-4 w-4 text-emerald-400" /> Custom Providers (BYOK)
          </h3>
          <p className="text-xs text-muted-foreground mb-5">
            Custom providers like OpenAI, Anthropic, Azure. Expand to see users and per-user model usage.
          </p>
          {providersLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <p className="text-xs text-muted-foreground">No custom providers configured.</p>
          ) : (
            <SubscriptionsList
              items={providers.map((p): SubscriptionRow => ({
                id: `prov:${p.providerType}:${p.label}`,
                title: p.label,
                subtitle: p.providerType,
                icon: <Key className="h-3.5 w-3.5 text-emerald-400 shrink-0" />,
                workspaceNames: p.workspaceNames,
                workspaceCount: p.workspaceCount,
                userCount: p.userCount,
                addedAt: p.addedAt,
                owners: p.owners,
                users: p.users,
                totalTokens: p.totalTokens,
                totalCostUsd: p.totalCostUsd,
                requestCount: p.requestCount,
              }))}
            />
          )}
        </div>
      )}

      {active === "models" && (
        <div className="bg-card backdrop-blur border border-border rounded-2xl p-5">
          <h3 className="text-sm font-medium text-foreground mb-5 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-violet-400" /> Model Usage Breakdown
          </h3>
          {modelsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : models.length === 0 ? (
            <p className="text-xs text-muted-foreground">No model usage data.</p>
          ) : (
            <PlatformModelsList models={models} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Platform Users List ───────────────────────────────────────────────
function PlatformUsersList({ users }: { users: PlatformUser[] }) {
  const maxTokens = Math.max(...users.map((u) => u.totalTokens), 1);

  return (
    <div className="space-y-2 pr-1">
      {users.map((u, i) => {
        const pct = (u.totalTokens / maxTokens) * 100;
        const rank = i + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

        return (
          <div
            key={`${u.userId}-${u.workspaceId}`}
            className="group relative rounded-xl bg-muted/50 p-3 hover:bg-muted transition-all duration-200"
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
                    {u.displayName || u.email}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="truncate">{u.displayName ? u.email : ""}</span>
                    <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[120px]">
                      {u.workspaceName}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">{u.requestCount} reqs</span>
                <span className="text-xs text-blue-400 font-medium tabular-nums">{formatTokenCount(u.totalTokens)}</span>
                <span className="text-xs text-foreground font-medium tabular-nums">{formatCost(u.totalCostUsd)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Hover popup: usage breakdown by source + models */}
            {u.sources && u.sources.length > 0 && (
              <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-[420px] max-w-[90vw] -translate-x-1/2 group-hover:block">
                <div className="rounded-xl border border-border bg-popover shadow-2xl p-3 max-h-[400px] overflow-y-auto pointer-events-auto">
                  <div className="text-[10px] uppercase text-muted-foreground mb-2 tracking-wider">
                    Usage breakdown — {u.displayName || u.email}
                  </div>
                  <div className="space-y-2">
                    {u.sources.map((s, idx) => (
                      <div key={`${s.kind}-${s.label}-${idx}`} className="rounded-lg bg-muted p-2">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {s.kind === "copilot" ? (
                              <Github className="h-3 w-3 text-blue-400 shrink-0" />
                            ) : s.kind === "provider" ? (
                              <Key className="h-3 w-3 text-emerald-400 shrink-0" />
                            ) : (
                              <Cpu className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="text-xs text-foreground font-medium truncate">{s.label}</span>
                            {s.githubLogin && (
                              <span className="text-[10px] text-muted-foreground truncate">@{s.githubLogin}</span>
                            )}
                            {s.providerType && (
                              <span className="text-[10px] text-muted-foreground uppercase">{s.providerType}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-blue-400 tabular-nums shrink-0">
                            {formatTokenCount(s.totalTokens)}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mb-1.5">
                          {s.ownerEmail ? (
                            <>
                              Owned by <span className="text-muted-foreground">{s.ownerDisplayName || s.ownerEmail}</span>
                              {s.ownerDisplayName && <span className="text-muted-foreground"> ({s.ownerEmail})</span>}
                            </>
                          ) : (
                            <span className="text-muted-foreground">No owner record</span>
                          )}
                        </div>
                        <div className="space-y-0.5">
                          {s.models.map((m) => (
                            <div
                              key={`${s.label}-${m.model}`}
                              className="flex items-center justify-between text-[11px] py-0.5"
                            >
                              <span className="text-foreground truncate">{m.model}</span>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] text-muted-foreground tabular-nums">{m.requestCount} reqs</span>
                                <span className="text-violet-400 tabular-nums">{formatTokenCount(m.totalTokens)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Generic Subscription / Provider List ──────────────────────────────
type SubscriptionRow = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  workspaceNames: string[];
  workspaceCount: number;
  userCount: number;
  addedAt: string | null;
  owners: PlatformSubscriptionOwner[];
  users: PlatformSubscriptionUser[];
  totalTokens: number;
  totalCostUsd: number;
  requestCount: number;
};

function formatAddedAt(iso: string | null): string {
  if (!iso) return "unknown";
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatOwners(owners: PlatformSubscriptionOwner[]): string {
  if (owners.length === 0) return "unknown owner";
  const labels = owners.map((o) => o.displayName || o.email);
  if (labels.length === 1) return labels[0] ?? "unknown owner";
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} + ${labels.length - 2} more`;
}

function SubscriptionsList({ items }: { items: SubscriptionRow[] }) {
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
      {items.map((row) => {
        const isExpanded = expandedIds.has(row.id);
        const hasUsers = row.users && row.users.length > 0;
        const isCopilot = row.id.startsWith("copilot:");
        // Warn if a single Copilot subscription is being used by more than one
        // person, or if the same GitHub login was added to the platform by
        // more than one local account. GitHub's terms restrict Copilot
        // Individual licenses to a single user — sharing can trigger
        // abuse-detection, rate limiting, or subscription suspension.
        const sharedActiveUsers = isCopilot && row.userCount > 1;
        const sharedOwners = isCopilot && row.owners.length > 1;
        const showCopilotShareWarning = sharedActiveUsers || sharedOwners;

        return (
          <div key={row.id} className="rounded-xl bg-muted/50 overflow-hidden">
            <button
              onClick={() => hasUsers && toggle(row.id)}
              className={`w-full text-left p-3 flex items-center justify-between ${
                hasUsers ? "hover:bg-muted cursor-pointer" : ""
              } transition-colors`}
              disabled={!hasUsers}
            >
              <div className="flex items-center gap-3 min-w-0">
                {hasUsers && (
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-sm text-foreground font-medium truncate flex items-center gap-2">
                    {row.icon}
                    {row.title}
                    <span className="text-[10px] text-muted-foreground">{row.subtitle}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3" />
                      <span className="truncate max-w-[260px]" title={row.workspaceNames.join(", ")}>
                        {row.workspaceCount === 0
                          ? "no workspaces"
                          : row.workspaceCount === 1
                            ? row.workspaceNames[0]
                            : `${row.workspaceCount} workspaces: ${row.workspaceNames.slice(0, 3).join(", ")}${row.workspaceCount > 3 ? ", …" : ""}`}
                      </span>
                    </span>
                    <span>
                      {row.userCount} user{row.userCount !== 1 ? "s" : ""}
                    </span>
                    <span title={row.owners.map((o) => o.email).join(", ")}>
                      added by <span className="text-muted-foreground">{formatOwners(row.owners)}</span>
                    </span>
                    <span>on {formatAddedAt(row.addedAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">{row.requestCount} reqs</span>
                <span className="text-xs text-blue-400 font-medium tabular-nums">{formatTokenCount(row.totalTokens)}</span>
                <span className="text-xs text-foreground font-medium tabular-nums">{formatCost(row.totalCostUsd)}</span>
              </div>
            </button>

            {showCopilotShareWarning && (
              <div className="mx-3 mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-100/90 leading-relaxed space-y-1">
                    <div className="font-medium text-amber-200">
                      {sharedActiveUsers
                        ? `This Copilot subscription is being used by ${row.userCount} different users.`
                        : `This GitHub account (@${row.title.replace(/'s GitHub$/, "")}) was added by ${row.owners.length} different people.`}
                      {" "}Risk: rate-limiting, abuse-detection flags, or subscription suspension.
                    </div>
                    <div className="text-amber-100/80">
                      GitHub&apos;s terms restrict Copilot Individual licenses to a single person — licenses are tied to one GitHub account and are not shareable. Sharing can cause GitHub to throttle or revoke Copilot access for that account.
                    </div>
                    <div className="text-amber-100/70">
                      <span className="font-medium">What to do:</span> use one Copilot subscription per user, or move everyone to a Copilot Business / Enterprise plan with per-seat assignments. Consider adding each user&apos;s own GitHub Copilot account to Doable instead of reusing one.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isExpanded && hasUsers && (
              <div className="px-4 pb-3 pt-1 border-t border-border/50">
                <div className="text-[10px] uppercase text-muted-foreground mb-2 tracking-wider">
                  Users on this {row.id.startsWith("copilot:") ? "subscription" : "provider"}
                </div>
                <div className="space-y-2">
                  {row.users.map((u) => (
                    <UserModelRow key={u.userId} user={u} parentId={row.id} />
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

function UserModelRow({ user, parentId }: { user: PlatformSubscriptionUser; parentId: string }) {
  const [open, setOpen] = useState(false);
  const hasModels = user.models && user.models.length > 0;

  return (
    <div className="rounded-lg bg-muted/40 overflow-hidden">
      <button
        onClick={() => hasModels && setOpen((v) => !v)}
        className={`w-full text-left py-1.5 px-2 flex items-center justify-between ${
          hasModels ? "hover:bg-muted cursor-pointer" : ""
        } transition-colors`}
        disabled={!hasModels}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasModels && (
            <span className="text-muted-foreground">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
          )}
          <div className="min-w-0">
            <div className="text-xs text-foreground truncate">{user.displayName || user.email}</div>
            {user.displayName && <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {user.models.length} model{user.models.length !== 1 ? "s" : ""}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{user.requestCount} reqs</span>
          <span className="text-xs text-blue-400 tabular-nums">{formatTokenCount(user.totalTokens)}</span>
        </div>
      </button>

      {open && hasModels && (
        <div className="px-3 pb-2 pt-1 border-t border-border/40 space-y-1">
          {user.models.map((m) => (
            <div
              key={`${parentId}-${user.userId}-${m.model}`}
              className="flex items-center justify-between text-[11px] py-0.5"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Cpu className="h-3 w-3 text-violet-400 shrink-0" />
                <span className="text-foreground truncate">{m.model}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-[10px] text-muted-foreground tabular-nums">{m.requestCount} reqs</span>
                <span className="text-violet-400 tabular-nums">{formatTokenCount(m.totalTokens)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
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
          <div key={m.model} className="rounded-xl bg-muted/50 overflow-hidden">
            <button
              onClick={() => hasUsers && toggle(m.model)}
              className={`w-full text-left p-3 ${hasUsers ? "hover:bg-muted cursor-pointer" : ""} transition-colors`}
              disabled={!hasUsers}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {hasUsers && (
                    <span className="text-muted-foreground">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  )}
                  <Cpu className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground font-medium truncate">{m.model}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                      {m.provider && (
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{m.provider}</span>
                      )}
                      <span>{m.userCount} user{m.userCount !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums">{m.requestCount} reqs</span>
                  <span className="text-xs text-blue-400 font-medium tabular-nums">{formatTokenCount(m.totalTokens)}</span>
                  <span className="text-xs text-foreground font-medium tabular-nums">{formatCost(m.totalCostUsd)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>

            {isExpanded && hasUsers && (
              <div className="px-4 pb-3 pt-1 border-t border-border/50">
                <div className="text-[10px] uppercase text-muted-foreground mb-2 tracking-wider">Used by</div>
                <div className="space-y-1.5">
                  {m.users.map((u) => (
                    <div
                      key={`${u.userId}-${u.workspaceName}`}
                      className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-foreground truncate">{u.displayName || u.email}</div>
                        <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1.5">
                          {u.displayName && <span>{u.email}</span>}
                          <span className="px-1.5 py-0.5 rounded bg-muted/60">{u.workspaceName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] text-muted-foreground tabular-nums">{u.requestCount} reqs</span>
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
