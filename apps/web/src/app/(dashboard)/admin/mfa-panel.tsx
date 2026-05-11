"use client";

import { useCallback, useEffect, useState } from "react";
import { apiAdminListMfaUsers, apiAdminResetUserMfa, type AdminMfaUserRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";

/**
 * Admin view for users who have opted into MFA. The platform admin can:
 *   - See who has MFA enabled, when, and how many recovery codes remain
 *   - Force-disable MFA for a user who has lost access to all factors
 *
 * Resets are audit-logged via admin_audit_log (action="mfa.reset").
 */
export function AdminMfaPanel() {
  const [rows, setRows] = useState<AdminMfaUserRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminMfaUserRow | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAdminListMfaUsers();
      setRows(res.users);
    } catch (err) {
      setError(
        err && typeof err === "object" && "body" in err
          ? (err as { body: { error: string } }).body.error
          : "Failed to load MFA users",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="h-4 w-4 mt-0.5 text-brand-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">User MFA status</p>
            <p className="mt-1 text-xs text-muted-foreground">
              MFA is optional and user-controlled. Use the reset action only when a user has lost access to both their authenticator app and recovery codes.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2.5 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground border-b border-border">
          <span>User</span>
          <span>Enrolled</span>
          <span>Last used</span>
          <span>Recovery</span>
        </div>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && rows && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No users have enabled MFA yet.
          </p>
        )}
        {!loading && rows && rows.map((r) => (
          <div
            key={r.userId}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3 border-b border-border last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {r.displayName ?? r.email.split("@")[0]}
              </p>
              <p className="truncate text-xs text-muted-foreground">{r.email}</p>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {r.verifiedAt ? new Date(r.verifiedAt).toLocaleDateString() : "—"}
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {r.lastUsedAt ? new Date(r.lastUsedAt).toLocaleDateString() : "never"}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {r.unusedRecoveryCodes} left
              </span>
              <Button
                size="sm"
                variant="outline"
                className="rounded-md"
                onClick={() => setResetTarget(r)}
              >
                Reset
              </Button>
            </div>
          </div>
        ))}
      </div>

      <ResetMfaDialog
        target={resetTarget}
        onOpenChange={(open) => { if (!open) setResetTarget(null); }}
        onDone={refresh}
      />
    </div>
  );
}

function ResetMfaDialog({
  target,
  onOpenChange,
  onDone,
}: {
  target: AdminMfaUserRow | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) setError(null);
  }, [target]);

  async function handleReset() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await apiAdminResetUserMfa(target.userId);
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(
        err && typeof err === "object" && "body" in err
          ? (err as { body: { error: string } }).body.error
          : "Failed to reset MFA",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset MFA for {target?.email}?</DialogTitle>
          <DialogDescription>
            This will remove all MFA factors and recovery codes for this user, and sign them out of every active session. They will be able to sign in with just their password until they enroll again.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-950/50 px-3 py-2.5 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" disabled={busy} onClick={handleReset} className="rounded-lg">
            {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Reset MFA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
