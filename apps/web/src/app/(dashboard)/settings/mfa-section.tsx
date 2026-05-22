"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  apiMfaStatus,
  apiMfaEnrollStart,
  apiMfaEnrollVerify,
  apiMfaDisable,
  apiMfaRegenerateRecoveryCodes,
  type MfaStatus,
  type MfaEnrollStartResponse,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Key,
  Loader2,
  Shield,
  ShieldCheck,
} from "lucide-react";

/**
 * Multi-factor authentication management for the current user.
 *
 * States:
 *  - status === null      → fetching
 *  - status.enabled false → "Set up" button → opens enroll wizard
 *  - status.enabled true  → "Enabled" badge + Disable + Regenerate codes
 *
 * The enroll wizard is a three-step dialog: scan QR → enter code → save
 * recovery codes. The recovery-codes step is the ONLY time plaintext
 * codes are shown — the user is encouraged to download them.
 */
export function MfaSection() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await apiMfaStatus();
      setStatus(s);
    } catch (err) {
      console.error("Failed to load MFA status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {status?.enabled ? (
            <ShieldCheck className="h-4 w-4 text-green-500" />
          ) : (
            <Shield className="h-4 w-4 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading…"
                : status?.enabled
                  ? `Enabled · ${status.unusedRecoveryCodes ?? 0} recovery code${status.unusedRecoveryCodes === 1 ? "" : "s"} remaining`
                  : "Add a code from your authenticator app on top of your password"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loading && !status?.enabled && (
            <Button
              size="sm"
              className="rounded-lg bg-brand-700 text-white hover:bg-brand-800"
              onClick={() => setEnrollOpen(true)}
            >
              Set up
            </Button>
          )}
          {!loading && status?.enabled && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg"
                onClick={() => setRegenerateOpen(true)}
              >
                <Key className="mr-1.5 h-3.5 w-3.5" />
                New recovery codes
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="rounded-lg"
                onClick={() => setDisableOpen(true)}
              >
                Disable
              </Button>
            </>
          )}
        </div>
      </div>

      <EnrollDialog open={enrollOpen} onOpenChange={setEnrollOpen} onDone={refresh} />
      <DisableDialog open={disableOpen} onOpenChange={setDisableOpen} onDone={refresh} />
      <RegenerateDialog
        open={regenerateOpen}
        onOpenChange={setRegenerateOpen}
        onDone={refresh}
      />
    </div>
  );
}

// ─── Enroll wizard ──────────────────────────────────────────────────

function EnrollDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"scan" | "verify" | "codes">("scan");
  const [enroll, setEnroll] = useState<MfaEnrollStartResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("scan");
    setEnroll(null);
    setQrDataUrl(null);
    setCode("");
    setRecoveryCodes(null);
    setError(null);
    setBusy(true);
    apiMfaEnrollStart()
      .then(async (res) => {
        setEnroll(res);
        const dataUrl = await QRCode.toDataURL(res.otpauthUrl, {
          margin: 1,
          width: 220,
          color: { dark: "#111111", light: "#ffffff" },
        });
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        setError(
          err && typeof err === "object" && "body" in err
            ? (err as { body: { error: string } }).body.error
            : "Failed to start enrollment",
        );
      })
      .finally(() => setBusy(false));
  }, [open]);

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiMfaEnrollVerify(code.trim());
      setRecoveryCodes(res.recoveryCodes);
      setStep("codes");
    } catch (err) {
      setError(
        err && typeof err === "object" && "body" in err
          ? (err as { body: { error: string } }).body.error
          : "Verification failed",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!recoveryCodes) return;
    const text = [
      "Doable recovery codes",
      "",
      "Keep these somewhere safe. Each code can be used once if you lose access to your authenticator app.",
      "",
      ...recoveryCodes,
      "",
      `Generated: ${new Date().toISOString()}`,
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "doable-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleFinish() {
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up two-factor authentication</DialogTitle>
          <DialogDescription>
            Scan the QR code with an authenticator app like 1Password, Authy, or Google Authenticator.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-950/50 px-3 py-2.5 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === "scan" && (
          <div className="space-y-4 py-2">
            <div className="flex justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="MFA QR code"
                  className="h-56 w-56 rounded-lg bg-white p-2"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg border border-border bg-secondary">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Or enter this code manually</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-md border border-border bg-secondary px-2.5 py-1.5 font-mono text-xs">
                  {enroll?.secret ?? "—"}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  className="rounded-md"
                  onClick={() => {
                    if (!enroll) return;
                    navigator.clipboard.writeText(enroll.secret).catch(() => {});
                    setSecretCopied(true);
                    setTimeout(() => setSecretCopied(false), 1500);
                  }}
                >
                  {secretCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                disabled={!enroll}
                onClick={() => setStep("verify")}
                className="bg-brand-700 text-white hover:bg-brand-800"
              >
                I&apos;ve added it — next
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "verify" && (
          <form onSubmit={handleVerify} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="enrollCode">Enter the 6-digit code from your app</Label>
              <Input
                id="enrollCode"
                autoFocus
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="rounded-xl text-center tracking-widest"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStep("scan")}>Back</Button>
              <Button
                type="submit"
                disabled={busy || code.length !== 6}
                className="bg-brand-700 text-white hover:bg-brand-800"
              >
                {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Verify
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "codes" && recoveryCodes && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-200">
              <p className="font-medium">Save these recovery codes now.</p>
              <p className="mt-1 text-amber-200/80">
                Each code can be used once if you lose access to your authenticator. We won&apos;t show them again.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary p-3 font-mono text-xs">
              {recoveryCodes.map((c) => (
                <div key={c} className="truncate">{c}</div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                type="button"
                className="rounded-lg"
                onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n")).catch(() => {})}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                type="button"
                className="rounded-lg"
                onClick={handleDownload}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={handleFinish} className="bg-brand-700 text-white hover:bg-brand-800">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Disable dialog ─────────────────────────────────────────────────

function DisableDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setCode("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiMfaDisable({ password, code: code.trim() });
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(
        err && typeof err === "object" && "body" in err
          ? (err as { body: { error: string } }).body.error
          : "Failed to disable MFA",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable two-factor authentication</DialogTitle>
          <DialogDescription>
            Confirm your password and a current code (or recovery code) to turn off MFA.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-2">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-950/50 px-3 py-2.5 text-sm text-red-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="disablePassword">Current password</Label>
            <Input
              id="disablePassword"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="disableCode">6-digit code or recovery code</Label>
            <Input
              id="disableCode"
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-xl text-center tracking-widest"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={busy} className="rounded-lg">
              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Disable MFA
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Regenerate dialog ──────────────────────────────────────────────

function RegenerateDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setCode("");
      setError(null);
      setNewCodes(null);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiMfaRegenerateRecoveryCodes({ password, code: code.trim() });
      setNewCodes(res.recoveryCodes);
    } catch (err) {
      setError(
        err && typeof err === "object" && "body" in err
          ? (err as { body: { error: string } }).body.error
          : "Failed to regenerate recovery codes",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regenerate recovery codes</DialogTitle>
          <DialogDescription>
            Your existing recovery codes will stop working immediately.
          </DialogDescription>
        </DialogHeader>

        {!newCodes ? (
          <form onSubmit={handleSubmit} className="space-y-3 py-2">
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-950/50 px-3 py-2.5 text-sm text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="regenPassword">Current password</Label>
              <Input
                id="regenPassword"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="regenCode">6-digit code</Label>
              <Input
                id="regenCode"
                required
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-xl text-center tracking-widest"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy} className="rounded-lg bg-brand-700 text-white hover:bg-brand-800">
                {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                Generate new codes
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-200">
              Save these now — we won&apos;t show them again.
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary p-3 font-mono text-xs">
              {newCodes.map((c) => (
                <div key={c} className="truncate">{c}</div>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              type="button"
              className="rounded-lg"
              onClick={() => navigator.clipboard.writeText(newCodes.join("\n")).catch(() => {})}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
            </Button>
            <DialogFooter>
              <Button onClick={handleClose} className="bg-brand-700 text-white hover:bg-brand-800">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
