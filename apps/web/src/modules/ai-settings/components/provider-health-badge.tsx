"use client";

interface ProviderHealthBadgeProps {
  status: "healthy" | "degraded" | "down" | "unknown";
  latencyMs?: number;
}

const STATUS_CONFIG: Record<
  ProviderHealthBadgeProps["status"],
  { color: string; label: string }
> = {
  healthy: { color: "bg-green-400", label: "Healthy" },
  degraded: { color: "bg-yellow-400", label: "Degraded" },
  down: { color: "bg-red-400", label: "Down" },
  unknown: { color: "bg-zinc-500", label: "Unknown" },
};

export function ProviderHealthBadge({ status, latencyMs }: ProviderHealthBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`h-2 w-2 rounded-full ${config.color}`} />
      <span>{config.label}</span>
      {latencyMs !== undefined && (
        <span className="text-muted-foreground tabular-nums">{latencyMs}ms</span>
      )}
    </span>
  );
}
