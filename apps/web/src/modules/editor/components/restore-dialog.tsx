"use client";

import { useState, useCallback, useEffect } from "react";
import {
  RotateCcw,
  X,
  AlertTriangle,
  Shield,
  Loader2,
  Clock,
  BookmarkCheck,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────

interface VersionInfo {
  id: string;
  versionNumber: number;
  description: string | null;
  createdAt: string;
  createdBy: string;
  bookmarked: boolean;
}

interface RestoreDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  version: VersionInfo | null;
}

// ─── Component ──────────────────────────────────────────────

export function RestoreDialog({
  open,
  onClose,
  onConfirm,
  version,
}: RestoreDialogProps) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setRestoring(false);
      setError(null);
    }
  }, [open]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !restoring) onClose();
    },
    [onClose, restoring]
  );

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !restoring) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, restoring, onClose]);

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setError(null);

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to restore version";
      setError(message);
    } finally {
      setRestoring(false);
    }
  }, [onConfirm, onClose]);

  if (!open || !version) return null;

  const formattedDate = new Date(version.createdAt).toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
  const formattedTime = new Date(version.createdAt).toLocaleTimeString(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-md rounded-xl border bg-background p-0 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
              <RotateCcw className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Restore Version</h2>
              <p className="text-xs text-muted-foreground">
                Roll back to a previous state
              </p>
            </div>
          </div>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            onClick={onClose}
            disabled={restoring}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Version card */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold font-mono">
                  v{version.versionNumber}
                </span>
                {version.bookmarked && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    <BookmarkCheck className="h-2.5 w-2.5" />
                    Saved
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {version.createdBy}
              </span>
            </div>

            {version.description && (
              <p className="mt-2.5 text-sm text-foreground leading-relaxed">
                {version.description}
              </p>
            )}

            <div className="mt-2.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formattedDate} at {formattedTime}
            </div>
          </div>

          {/* Safety notice */}
          <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3">
            <Shield className="h-4 w-4 text-blue-600 flex-none mt-0.5" />
            <div className="text-xs leading-relaxed text-blue-800">
              <p className="font-medium mb-0.5">Non-destructive restore</p>
              <p className="text-blue-700">
                A new version will be created from v{version.versionNumber}.
                Your current work and all previous versions will remain
                accessible.
              </p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-none mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t px-5 py-3 bg-muted/20">
          <button
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
            onClick={onClose}
            disabled={restoring}
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Restoring...
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                Restore to v{version.versionNumber}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
