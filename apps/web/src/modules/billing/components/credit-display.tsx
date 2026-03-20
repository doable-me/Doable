"use client";

import { cn } from "@/lib/utils";
import type { Credits } from "../hooks/use-billing";

interface CreditDisplayProps {
  credits: Credits | null;
  loading?: boolean;
  className?: string;
  compact?: boolean;
  onUpgrade?: () => void;
}

function CreditBar({
  label,
  remaining,
  total,
  color,
}: {
  label: string;
  remaining: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? Math.min((remaining / total) * 100, 100) : 0;
  const isLow = remaining <= Math.ceil(total * 0.2);
  const isEmpty = remaining === 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-200">{label}</span>
        <span className={cn(
          "tabular-nums text-zinc-400",
          isLow && !isEmpty && "text-orange-400",
          isEmpty && "text-red-400"
        )}>
          {remaining} / {total} remaining
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isEmpty ? "bg-red-500" : isLow ? "bg-orange-500" : color
          )}
          style={{ width: `${Math.max(percentage, 2)}%` }}
        />
      </div>
    </div>
  );
}

export function CreditDisplay({ credits, loading, className, compact, onUpgrade }: CreditDisplayProps) {
  if (loading) {
    if (compact) {
      return (
        <div className={cn("flex items-center", className)}>
          <div className="h-6 w-14 animate-pulse rounded-md bg-zinc-800" />
        </div>
      );
    }
    return (
      <div className={cn("space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6", className)}>
        <div className="h-5 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="space-y-3">
          <div className="h-2.5 w-full animate-pulse rounded bg-zinc-800" />
          <div className="h-2.5 w-full animate-pulse rounded bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!credits) {
    if (compact) return null;
    return (
      <div className={cn("rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-500", className)}>
        No credit information available. Subscribe to a plan to get started.
      </div>
    );
  }

  const totalAvailable = credits.total_available ?? (
    credits.daily_remaining + credits.monthly_remaining + credits.rollover_credits
  );
  const isOutOfCredits = totalAvailable === 0;
  const isLow = totalAvailable > 0 && totalAvailable <= Math.ceil(
    (credits.daily_total + credits.monthly_total) * 0.2
  );

  const dailyTotal = credits.daily_total ?? 5;
  const monthlyTotal = credits.monthly_total ?? 0;

  // ─── Compact mode (for editor toolbar) ──────────────────
  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
          isOutOfCredits && "bg-red-950/50 border border-red-800 text-red-400",
          isLow && !isOutOfCredits && "bg-orange-950/50 border border-orange-800 text-orange-400",
          !isLow && !isOutOfCredits && "bg-zinc-800 border border-zinc-700 text-zinc-300"
        )}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span className="tabular-nums">{totalAvailable}</span>
        </div>
        {isOutOfCredits && onUpgrade && (
          <button
            onClick={onUpgrade}
            className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
          >
            Upgrade
          </button>
        )}
      </div>
    );
  }

  // ─── Full display ───────────────────────────────────────
  return (
    <div className={cn("space-y-5 rounded-xl border bg-zinc-900/50 p-6", className,
      isOutOfCredits ? "border-red-800" : "border-zinc-800"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Credits</h3>
        <div className={cn(
          "rounded-full px-3 py-1 text-sm font-medium",
          isOutOfCredits && "bg-red-500/10 border border-red-500/20 text-red-400",
          isLow && !isOutOfCredits && "bg-orange-500/10 border border-orange-500/20 text-orange-400",
          !isLow && !isOutOfCredits && "bg-brand-500/10 border border-brand-500/20 text-brand-400"
        )}>
          {totalAvailable} available
        </div>
      </div>

      {/* Out of credits warning */}
      {isOutOfCredits && (
        <div className="flex items-start gap-3 rounded-lg border border-red-800 bg-red-950/30 p-4">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-300">Out of credits</p>
            <p className="mt-1 text-xs text-red-400/80">
              You have used all your available credits. Upgrade your plan or purchase additional credits to continue using AI features.
            </p>
            {onUpgrade && (
              <button
                onClick={onUpgrade}
                className="mt-3 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500 transition-colors"
              >
                Upgrade Plan
              </button>
            )}
          </div>
        </div>
      )}

      {/* Low credits warning */}
      {isLow && !isOutOfCredits && (
        <div className="flex items-start gap-3 rounded-lg border border-orange-800 bg-orange-950/30 p-4">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-medium text-orange-300">Credits running low</p>
            <p className="mt-1 text-xs text-orange-400/80">
              You have {totalAvailable} credit{totalAvailable !== 1 ? "s" : ""} remaining. Consider upgrading your plan or purchasing additional credits.
            </p>
          </div>
        </div>
      )}

      {/* Credit bars */}
      <div className="space-y-4">
        <CreditBar
          label="Daily Credits"
          remaining={credits.daily_remaining}
          total={dailyTotal}
          color="bg-blue-500"
        />
        {monthlyTotal > 0 && (
          <CreditBar
            label="Monthly Credits"
            remaining={credits.monthly_remaining}
            total={monthlyTotal}
            color="bg-brand-500"
          />
        )}
        {credits.rollover_credits > 0 && (
          <CreditBar
            label="Rollover Credits"
            remaining={credits.rollover_credits}
            total={credits.rollover_credits}
            color="bg-green-500"
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 pt-2">
        <CreditStat label="Daily" value={credits.daily_remaining} />
        <CreditStat label="Monthly" value={credits.monthly_remaining} />
        <CreditStat label="Rollover" value={credits.rollover_credits} />
      </div>

      {/* Reset times */}
      <div className="space-y-1">
        {credits.daily_reset_at && (
          <p className="text-xs text-zinc-500">
            Daily credits reset:{" "}
            {new Date(credits.daily_reset_at).toLocaleString()}
          </p>
        )}
        {credits.monthly_reset_at && monthlyTotal > 0 && (
          <p className="text-xs text-zinc-500">
            Monthly credits reset:{" "}
            {new Date(credits.monthly_reset_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Plan badge */}
      {credits.plan_type && (
        <div className="flex items-center justify-between border-t border-zinc-800 pt-4">
          <span className="text-xs text-zinc-500">Current plan</span>
          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium capitalize text-zinc-300">
            {credits.plan_type}
          </span>
        </div>
      )}
    </div>
  );
}

function CreditStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/30 p-3 text-center">
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

/**
 * Compact credit indicator for use in the editor toolbar.
 * Shows remaining credits with color-coded state.
 */
export function CreditToolbarIndicator({
  credits,
  loading,
  onUpgrade,
}: {
  credits: Credits | null;
  loading?: boolean;
  onUpgrade?: () => void;
}) {
  return (
    <CreditDisplay
      credits={credits}
      loading={loading}
      compact
      onUpgrade={onUpgrade}
    />
  );
}
