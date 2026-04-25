"use client";

import { useState, useCallback } from "react";
import {
  AlertTriangle,
  FileWarning,
  Check,
  X,
  Loader2,
  ArrowRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface ConflictResolutionDialogProps {
  open: boolean;
  onClose: () => void;
  conflictedFiles: string[];
  onResolve: (strategy: "ours" | "theirs") => Promise<void>;
  onAbort: () => Promise<void>;
  repoName: string | null;
}

// ─── Component ──────────────────────────────────────────────

export function ConflictResolutionDialog({
  open,
  onClose,
  conflictedFiles,
  onResolve,
  onAbort,
  repoName,
}: ConflictResolutionDialogProps) {
  const [resolving, setResolving] = useState(false);
  const [aborting, setAborting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResolve = useCallback(
    async (strategy: "ours" | "theirs") => {
      setError(null);
      setResolving(true);
      try {
        await onResolve(strategy);
        onClose();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to resolve conflicts";
        setError(message);
      } finally {
        setResolving(false);
      }
    },
    [onResolve, onClose]
  );

  const handleAbort = useCallback(async () => {
    setError(null);
    setAborting(true);
    try {
      await onAbort();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to abort merge";
      setError(message);
    } finally {
      setAborting(false);
    }
  }, [onAbort, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !resolving && !aborting) onClose();
    },
    [onClose, resolving, aborting]
  );

  if (!open) return null;

  const isBusy = resolving || aborting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-lg rounded-lg border bg-background shadow-xl">
        {/* Header */}
        <div className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Merge Conflicts</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            There are conflicts between your local changes and{" "}
            {repoName ? (
              <span className="font-medium text-foreground">{repoName}</span>
            ) : (
              "the remote repository"
            )}
            . Choose how to resolve them.
          </p>
        </div>

        {/* Conflicted files list */}
        <div className="px-6 py-4">
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Conflicted files ({conflictedFiles.length})
          </h3>
          <div className="max-h-40 overflow-y-auto rounded-md border">
            {conflictedFiles.map((file) => (
              <div
                key={file}
                className="flex items-center gap-2 border-b px-3 py-2 last:border-0"
              >
                <FileWarning className="h-3.5 w-3.5 flex-none text-amber-500" />
                <span className="truncate font-mono text-xs">{file}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution options */}
        <div className="space-y-3 px-6 pb-4">
          <button
            className="flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10 disabled:opacity-50"
            onClick={() => void handleResolve("ours")}
            disabled={isBusy}
          >
            <div>
              <p className="text-sm font-medium">Keep my changes</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Discard remote changes and keep your local version
              </p>
            </div>
            <ArrowRight className="h-4 w-4 flex-none text-primary" />
          </button>

          <button
            className="flex w-full items-center justify-between rounded-md border p-4 text-left transition-colors hover:bg-accent disabled:opacity-50"
            onClick={() => void handleResolve("theirs")}
            disabled={isBusy}
          >
            <div>
              <p className="text-sm font-medium">Use remote changes</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Discard your local changes and use the GitHub version
              </p>
            </div>
            <ArrowRight className="h-4 w-4 flex-none text-muted-foreground" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-4 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4">
          <button
            className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            onClick={() => void handleAbort()}
            disabled={isBusy}
          >
            {aborting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <X className="h-3.5 w-3.5" />
            )}
            Cancel merge
          </button>
          <button
            className="rounded-md border px-4 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
            onClick={onClose}
            disabled={isBusy}
          >
            Close
          </button>
        </div>

        {/* Loading overlay */}
        {resolving && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/80">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm font-medium">
                Resolving conflicts...
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
