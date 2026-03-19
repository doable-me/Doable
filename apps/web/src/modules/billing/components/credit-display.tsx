"use client";

import { cn } from "@/lib/utils";
import type { Credits } from "../hooks/use-billing";

interface CreditDisplayProps {
  credits: Credits | null;
  loading?: boolean;
  className?: string;
}

// Plan credit limits (matching PLAN_LIMITS in shared package)
const PLAN_DAILY_LIMITS: Record<string, number> = {
  free: 5,
  pro: 50,
  business: 200,
};

const PLAN_MONTHLY_LIMITS: Record<string, number> = {
  free: 0,
  pro: 100,
  business: 100,
};

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
  const used = Math.max(0, total - remaining);
  const percentage = total > 0 ? Math.min((remaining / total) * 100, 100) : 0;
  const isLow = remaining <= Math.ceil(total * 0.2);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-200">{label}</span>
        <span className={cn("tabular-nums text-zinc-400", isLow && "text-orange-400")}>
          {remaining} / {total} remaining
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function CreditDisplay({ credits, loading, className }: CreditDisplayProps) {
  if (loading) {
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
    return (
      <div className={cn("rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 text-center text-zinc-500", className)}>
        No credit information available. Subscribe to a plan to get started.
      </div>
    );
  }

  const totalAvailable =
    credits.daily_remaining + credits.monthly_remaining + credits.rollover_credits;

  // Determine plan limits from workspace context
  const dailyTotal = PLAN_DAILY_LIMITS.free ?? 5;
  const monthlyTotal = PLAN_MONTHLY_LIMITS.pro ?? 100;

  return (
    <div className={cn("space-y-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Credits</h3>
        <div className="rounded-full bg-brand-500/10 border border-brand-500/20 px-3 py-1 text-sm font-medium text-brand-400">
          {totalAvailable} available
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
        <p className="text-xs text-zinc-500">
          Daily credits reset:{" "}
          {new Date(credits.last_daily_reset).toLocaleString()}
        </p>
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
