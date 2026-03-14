"use client";

import { cn } from "@/lib/utils";
import type { Credits } from "../hooks/use-billing";

interface CreditDisplayProps {
  credits: Credits | null;
  loading?: boolean;
  className?: string;
}

function CreditBar({
  label,
  used,
  total,
  color,
}: {
  label: string;
  used: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isLow = percentage > 80;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("tabular-nums", isLow && "text-orange-600 dark:text-orange-400")}>
          {used} / {total}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
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
      <div className={cn("space-y-4 rounded-xl border p-6", className)}>
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
      <div className={cn("rounded-xl border p-6 text-center text-muted-foreground", className)}>
        No credit information available
      </div>
    );
  }

  const totalAvailable =
    credits.daily_remaining + credits.monthly_remaining + credits.rollover_credits;

  return (
    <div className={cn("space-y-5 rounded-xl border p-6", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Credits</h3>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          {totalAvailable} available
        </div>
      </div>

      <div className="space-y-4">
        <CreditBar
          label="Daily Credits"
          used={credits.daily_remaining}
          total={credits.daily_remaining + 0} // We show remaining as the value
          color="bg-blue-500"
        />
        <CreditBar
          label="Monthly Credits"
          used={credits.monthly_remaining}
          total={credits.monthly_remaining + 0}
          color="bg-purple-500"
        />
        {credits.rollover_credits > 0 && (
          <CreditBar
            label="Rollover Credits"
            used={credits.rollover_credits}
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

function CreditStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
