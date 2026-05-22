"use client";

/**
 * ErrorRecoveryCard — shown when the AI stream hits a fatal error.
 * Every error state has at least one recovery CTA — no dead ends.
 * Preserves Doable's existing design tokens.
 */

import { AlertCircle, RotateCcw, Settings, Zap, Clock, Wifi } from "lucide-react";
import { useState, useEffect } from "react";

export type ErrorKind =
  | "timeout"
  | "rate_limit"
  | "auth"
  | "build_failed"
  | "network"
  | "unavailable"
  | "generic";

interface ErrorRecoveryCardProps {
  kind: ErrorKind;
  message?: string;
  /** Only for rate_limit — seconds until retry is allowed */
  retryAfterSeconds?: number;
  onRetry?: () => void;
  onAutoFix?: () => void;
  onSwitchModel?: () => void;
  onDismiss?: () => void;
}

// ─── Rate-limit countdown banner ─────────────────────────────
function RateLimitCountdown({
  retryAfterSeconds,
  onRetry,
}: {
  retryAfterSeconds: number;
  onRetry?: () => void;
}) {
  const [remaining, setRemaining] = useState(retryAfterSeconds);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setRemaining(retryAfterSeconds);
    setDone(false);
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          setDone(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [retryAfterSeconds]);

  const pct = Math.max(0, Math.min(100, ((retryAfterSeconds - remaining) / retryAfterSeconds) * 100));

  return (
    <div className="mt-2 flex items-center gap-2">
      <Clock className="h-3 w-3 text-amber-400 shrink-0" />
      {done ? (
        <span className="text-xs text-amber-400">Ready — you can retry now</span>
      ) : (
        <span className="text-xs text-muted-foreground">
          Auto-retrying in <span className="text-amber-400 font-medium">{remaining}s</span>
        </span>
      )}
      {/* Progress fill */}
      <div className="flex-1 h-0.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-amber-400/60 transition-all duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      {done && onRetry && (
        <button
          onClick={onRetry}
          className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
        >
          Retry now
        </button>
      )}
    </div>
  );
}

// ─── Config per error kind ────────────────────────────────────
function getConfig(kind: ErrorKind, message?: string) {
  switch (kind) {
    case "timeout":
      return {
        title: "Connection timed out",
        description: message ?? "The AI took too long to respond. Your work is safe.",
        primaryLabel: "Try again",
        icon: Wifi,
        colorClass: "border-amber-500/20 bg-amber-500/5",
        iconClass: "text-amber-400",
        primaryClass: "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20",
      };
    case "rate_limit":
      return {
        title: "Rate limit reached",
        description: message ?? "Too many requests. Please wait a moment.",
        primaryLabel: "Retry now",
        icon: Clock,
        colorClass: "border-amber-500/20 bg-amber-500/5",
        iconClass: "text-amber-400",
        primaryClass: "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20",
      };
    case "auth":
      return {
        title: "Authentication failed",
        description: message ?? "Could not authenticate with the AI provider. Check your API key.",
        primaryLabel: "Check API key",
        icon: Settings,
        colorClass: "border-red-500/20 bg-red-500/5",
        iconClass: "text-red-400",
        primaryClass: "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20",
      };
    case "build_failed":
      return {
        title: "Build failed",
        description: message ?? "The AI encountered errors during the build. It can try to fix them automatically.",
        primaryLabel: "Fix automatically",
        icon: Zap,
        colorClass: "border-red-500/20 bg-red-500/5",
        iconClass: "text-red-400",
        primaryClass: "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20",
      };
    case "network":
      return {
        title: "Network error",
        description: message ?? "Lost connection to the server. Check your internet and reconnect.",
        primaryLabel: "Reconnect",
        icon: Wifi,
        colorClass: "border-red-500/20 bg-red-500/5",
        iconClass: "text-red-400",
        primaryClass: "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20",
      };
    case "unavailable":
      return {
        title: "AI model unavailable",
        description: message ?? "The selected model is not responding. Try switching to a different model.",
        primaryLabel: "Switch model",
        icon: AlertCircle,
        colorClass: "border-red-500/20 bg-red-500/5",
        iconClass: "text-red-400",
        primaryClass: "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20",
      };
    default:
      return {
        title: "Something went wrong",
        description: message ?? "An unexpected error occurred. Please try again.",
        primaryLabel: "Try again",
        icon: AlertCircle,
        colorClass: "border-red-500/20 bg-red-500/5",
        iconClass: "text-red-400",
        primaryClass: "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-500/20",
      };
  }
}

// ─── Main component ───────────────────────────────────────────
export function ErrorRecoveryCard({
  kind,
  message,
  retryAfterSeconds,
  onRetry,
  onAutoFix,
  onSwitchModel,
  onDismiss,
}: ErrorRecoveryCardProps) {
  const cfg = getConfig(kind, message);
  const Icon = cfg.icon;

  const handlePrimary = () => {
    if (kind === "build_failed" && onAutoFix) return onAutoFix();
    if (kind === "unavailable" && onSwitchModel) return onSwitchModel();
    if (kind === "auth" && onSwitchModel) return onSwitchModel(); // reuse settings handler
    onRetry?.();
  };

  return (
    <div className={`mx-3 mb-2 rounded-lg border p-3 ${cfg.colorClass}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.iconClass}`} />

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${cfg.iconClass}`}>{cfg.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {cfg.description}
          </p>

          {/* Rate-limit countdown */}
          {kind === "rate_limit" && retryAfterSeconds !== undefined && (
            <RateLimitCountdown
              retryAfterSeconds={retryAfterSeconds}
              onRetry={onRetry}
            />
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={handlePrimary}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${cfg.primaryClass}`}
            >
              <RotateCcw className="h-3 w-3" />
              {cfg.primaryLabel}
            </button>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
