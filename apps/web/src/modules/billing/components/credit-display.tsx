"use client";

import { cn } from "@/lib/utils";
import type { Credits } from "../hooks/use-billing";

interface CreditDisplayProps {
  credits: Credits | null;
  loading?: boolean;
  onUpgrade?: () => void;
  className?: string;
}

// Plan credit limits (matching PLAN_LIMITS in shared package)
const PLAN_DAILY_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  business: 200,
  enterprise: 2_147_483_647,
};

const PLAN_MONTHLY_LIMITS: Record<string, number> = {
  free: 0,
  pro: 500,
  business: 3000,
  enterprise: 2_147_483_647,
};

const UNLIMITED_THRESHOLD = 2_000_000_000;

function isUnlimited(value: number): boolean {
  return value >= UNLIMITED_THRESHOLD;
}

function formatCredits(value: number): string {
  return isUnlimited(value) ? "Unlimited" : value.toLocaleString();
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
  const unlimited = isUnlimited(total);
  // BUG-BILLING-001: clamp `used` at 0 — if the API ever reports remaining
  // > total (e.g. plan-limit mismatch, top-up credits showing as monthly),
  // we must never display a negative "used" number like "-400 / 100".
  const used = Math.max(0, total - remaining);
  const percentage = unlimited ? 0 : total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isLow = !unlimited && remaining <= Math.ceil(total * 0.2);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn("tabular-nums text-muted-foreground", isLow && "text-orange-400")}>
          {unlimited ? "Unlimited" : `${used} / ${total} used`}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", isLow ? "bg-gradient-to-r from-orange-500 to-red-500" : color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function CreditDisplay({ credits, loading, className }: CreditDisplayProps) {
  if (loading) {
    return (
      <div className={cn("space-y-4 rounded-xl border border-border bg-card p-6", className)}>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!credits) {
    return (
      <div className={cn("rounded-xl border border-border bg-card p-6 text-center text-muted-foreground", className)}>
        No credit information available. Subscribe to a plan to get started.
      </div>
    );
  }

  const totalAvailable =
    credits.daily_remaining + credits.monthly_remaining + credits.rollover_credits;
  const showUnlimited = isUnlimited(totalAvailable) || isUnlimited(credits.daily_remaining);

  // BUG-BILLING-001: Prefer the totals reported by the API (credits.*_total)
  // over the hardcoded PLAN_*_LIMITS table. When the API reports a different
  // monthly total than the local table (e.g. after a plan change or top-up),
  // using the stale local value made `used = total - remaining` go negative
  // (UI showed "-400 / 100 used"). Fall back to the table only if the API
  // didn't supply a total.
  const planKey = (credits as any).plan_type ?? "free";
  const dailyTotal =
    credits.daily_total > 0
      ? credits.daily_total
      : PLAN_DAILY_LIMITS[planKey] ?? PLAN_DAILY_LIMITS.free ?? 5;
  const monthlyTotal =
    credits.monthly_total > 0
      ? credits.monthly_total
      : PLAN_MONTHLY_LIMITS[planKey] ?? PLAN_MONTHLY_LIMITS.free ?? 0;

  return (
    <div className={cn("space-y-5 rounded-xl border border-border bg-card p-6", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Credits</h3>
        <div className="rounded-full bg-brand-500/10 border border-brand-500/20 px-3 py-1 text-sm font-medium text-brand-400">
          {showUnlimited ? "Unlimited" : `${totalAvailable} available`}
        </div>
      </div>

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

      <div className="grid grid-cols-3 gap-3 pt-2">
        <CreditStat label="Daily" value={credits.daily_remaining} />
        <CreditStat label="Monthly" value={credits.monthly_remaining} />
        <CreditStat label="Rollover" value={credits.rollover_credits} />
      </div>

      {credits.last_daily_reset && (
        <p className="text-xs text-muted-foreground">
          Daily credits reset:{" "}
          {new Date(credits.last_daily_reset).toLocaleString()}
        </p>
      )}
    </div>
  );
}

/** Compact credit indicator for the editor toolbar */
export function CreditToolbarIndicator({
  credits,
  loading,
  onUpgrade,
}: {
  credits: Credits | null;
  loading?: boolean;
  onUpgrade?: () => void;
}) {
  if (loading || !credits) return null;

  const total = credits.daily_remaining + credits.monthly_remaining + credits.rollover_credits;
  const unlimited = isUnlimited(total) || isUnlimited(credits.daily_remaining);
  const isLow = !unlimited && credits.daily_remaining <= 1 && total <= 2;

  return (
    <button
      onClick={onUpgrade}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
        isLow
          ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 hover:bg-orange-500/25"
          : "bg-secondary text-muted-foreground hover:bg-accent"
      )}
      title={unlimited ? "Unlimited credits" : `${total} credits remaining`}
    >
      <span className="tabular-nums">{unlimited ? "∞" : total}</span>
      <span className="text-muted-foreground">credits</span>
    </button>
  );
}

function CreditStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-secondary border border-border p-3 text-center">
      <p className="text-2xl font-bold tabular-nums text-foreground">{formatCredits(value)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
