"use client";

import { useState, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────

interface SyncStatus {
  connected: boolean;
  status: "synced" | "ahead" | "behind" | "diverged" | "conflict" | "disconnected";
  lastSyncedAt: string | null;
  repoUrl: string | null;
  branch: string;
  repoOwner: string | null;
  repoName: string | null;
  aheadCount?: number;
  behindCount?: number;
  uncommittedChanges?: boolean;
  conflictedFiles?: string[];
}

interface GitHubButtonProps {
  status: SyncStatus | null;
  pushing: boolean;
  pulling: boolean;
  onPush: (message: string, force?: boolean) => Promise<void>;
  onPull: () => Promise<void>;
  onConnect: () => void;
  onDisconnect: () => void;
  onResolveConflicts?: (strategy: "ours" | "theirs") => Promise<void>;
  onAbortMerge?: () => Promise<void>;
  error: string | null;
  onClearError: () => void;
}

// ─── Helpers ────────────────────────────────────────────────

function getStatusIndicator(status: SyncStatus | null): {
  color: string;
  label: string;
} {
  if (!status || !status.connected) {
    return { color: "bg-gray-400", label: "Not connected" };
  }

  switch (status.status) {
    case "synced":
      return { color: "bg-green-500", label: "Synced" };
    case "ahead":
      return { color: "bg-blue-500", label: "Ahead" };
    case "behind":
      return { color: "bg-amber-500", label: "Behind" };
    case "diverged":
    case "conflict":
      return { color: "bg-red-500", label: "Diverged" };
    default:
      return { color: "bg-gray-400", label: "Disconnected" };
  }
}

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// ─── Component ──────────────────────────────────────────────

export function GitHubButton({
  status,
  pushing,
  pulling,
  onPush,
  onPull,
  onConnect,
  onDisconnect,
  onResolveConflicts,
  onAbortMerge,
  error,
  onClearError,
}: GitHubButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [showForceOption, setShowForceOption] = useState(false);

  const indicator = getStatusIndicator(status);
  const isConnected = status?.connected ?? false;
  const isBusy = pushing || pulling;
  const isDiverged = status?.status === "diverged" || status?.status === "conflict";

  const handlePush = useCallback(async (force = false) => {
    if (!commitMessage.trim()) return;
    await onPush(commitMessage, force);
    setCommitMessage("");
    setShowCommitInput(false);
    setShowForceOption(false);
    setMenuOpen(false);
  }, [commitMessage, onPush]);

  const handlePull = useCallback(async () => {
    await onPull();
    setMenuOpen(false);
  }, [onPull]);

  return (
    <div className="relative">
      {/* Main button */}
      <button
        className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
        onClick={() => {
          if (!isConnected) {
            onConnect();
          } else {
            setMenuOpen(!menuOpen);
            if (error) onClearError();
          }
        }}
        disabled={isBusy}
      >
        {/* GitHub icon */}
        <svg
          className="h-4 w-4"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>

        {/* Status dot */}
        <span className={`h-2 w-2 rounded-full ${indicator.color}`} />

        <span>{isConnected ? indicator.label : "Connect GitHub"}</span>

        {isBusy && (
          <span className="ml-1 text-xs text-muted-foreground">
            {pushing ? "Pushing..." : "Pulling..."}
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {menuOpen && isConnected && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border bg-background p-2 shadow-lg">
          {/* Status info */}
          <div className="mb-2 rounded-md bg-muted/50 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {status?.branch ?? "main"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatLastSync(status?.lastSyncedAt ?? null)}
              </span>
            </div>
            {status?.repoUrl && (
              <a
                href={status.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-primary hover:underline"
              >
                {status.repoUrl.replace("https://github.com/", "")}
              </a>
            )}
            {/* Ahead/behind counts */}
            {(status?.aheadCount || status?.behindCount) && (
              <div className="mt-1.5 flex items-center gap-2 text-xs">
                {(status?.aheadCount ?? 0) > 0 && (
                  <span className="text-blue-600">
                    {status?.aheadCount} ahead
                  </span>
                )}
                {(status?.behindCount ?? 0) > 0 && (
                  <span className="text-amber-600">
                    {status?.behindCount} behind
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-800">{error}</p>
            </div>
          )}

          {/* Diverged warning */}
          {isDiverged && (
            <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-800">
                Remote has changes not in your local project. Pull first, or force push to overwrite.
              </p>
            </div>
          )}

          {/* Commit input */}
          {showCommitInput ? (
            <div className="mb-2 space-y-2 px-1">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message..."
                className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handlePush();
                  if (e.key === "Escape") setShowCommitInput(false);
                }}
              />
              <div className="flex gap-2">
                <button
                  className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  onClick={() => void handlePush()}
                  disabled={!commitMessage.trim() || pushing}
                >
                  {pushing ? "Pushing..." : "Push"}
                </button>
                {isDiverged && (
                  <button
                    className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    onClick={() => void handlePush(true)}
                    disabled={!commitMessage.trim() || pushing}
                    title="Force push (overwrites remote)"
                  >
                    Force
                  </button>
                )}
                <button
                  className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
                  onClick={() => setShowCommitInput(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
                onClick={() => setShowCommitInput(true)}
                disabled={isBusy}
              >
                Push to GitHub
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent"
                onClick={() => void handlePull()}
                disabled={isBusy}
              >
                {pulling ? "Pulling..." : "Pull from GitHub"}
              </button>
            </>
          )}

          <div className="my-1 border-t" />

          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            onClick={() => {
              onDisconnect();
              setMenuOpen(false);
            }}
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Click-away overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}
