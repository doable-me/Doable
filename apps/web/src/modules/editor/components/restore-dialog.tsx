"use client";

import { useState, useCallback } from "react";

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

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !restoring) onClose();
    },
    [onClose, restoring]
  );

  const handleRestore = useCallback(async () => {
    setRestoring(true);
    setError(null);

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore version";
      setError(message);
    } finally {
      setRestoring(false);
    }
  }, [onConfirm, onClose]);

  if (!open || !version) return null;

  const formattedDate = new Date(version.createdAt).toLocaleString();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Restore Version</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This will create a new version with the files from the selected version.
            Your current work will not be lost.
          </p>
        </div>

        {/* Version details */}
        <div className="mb-6 rounded-md border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Version {version.versionNumber}
            </span>
            {version.bookmarked && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                Bookmarked
              </span>
            )}
          </div>

          {version.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {version.description}
            </p>
          )}

          <p className="mt-2 text-xs text-muted-foreground">{formattedDate}</p>
        </div>

        {/* Warning */}
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            <strong>Non-destructive restore:</strong> A new version will be created
            from v{version.versionNumber}. You can always go back to any previous
            version.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            onClick={onClose}
            disabled={restoring}
          >
            Cancel
          </button>
          <button
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleRestore}
            disabled={restoring}
          >
            {restoring ? "Restoring..." : "Restore Version"}
          </button>
        </div>
      </div>
    </div>
  );
}
