"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface StepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface CloudflareStatus {
  binaryInstalled: boolean;
  serviceActive: boolean;
  tunnelConfigured: boolean;
  tunnelId: string | null;
  tunnelHostname: string | null;
  skipped: boolean;
  nextAction: "install_cloudflared" | "login_to_cloudflare" | "start_cloudflared_service" | "configured";
  loginUrl: string;
}

type SaveStatus = "idle" | "saving" | "success" | "error";

export function StepCloudflare({ onNext, onBack, onSkip }: StepProps) {
  const [status, setStatus] = useState<CloudflareStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  async function refresh() {
    try {
      const data = await apiFetch<CloudflareStatus>("/setup/cloudflare/status");
      setStatus(data);
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function persistChoice(action: "skip" | "use_tunnel") {
    setSaveStatus("saving");
    try {
      await apiFetch("/setup/cloudflare", {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setSaveStatus("success");
      onNext();
    } catch {
      setSaveStatus("error");
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
      </div>
    );
  }

  const configured = status?.nextAction === "configured";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground tracking-tight">
          Cloudflare Tunnel
        </h2>
        <p className="text-sm text-muted-foreground">
          We strongly recommend running Doable behind a Cloudflare Tunnel.
          Your server never exposes ports 80 or 443 to the public internet — all
          traffic enters through Cloudflare's edge, with built-in DDoS
          protection and TLS.
        </p>
      </div>

      {/* Current status panel */}
      <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          {configured ? (
            <ShieldCheck className="h-5 w-5 text-green-500" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-400" />
          )}
          <span className="text-sm font-medium text-foreground">
            {configured ? "Cloudflare Tunnel active" : "Cloudflare Tunnel not yet configured"}
          </span>
        </div>

        <ul className="text-xs text-muted-foreground space-y-1.5 pl-7 list-disc">
          <li className={status?.binaryInstalled ? "text-foreground" : ""}>
            cloudflared binary: {status?.binaryInstalled ? "installed" : "not installed"}
          </li>
          <li className={status?.tunnelConfigured ? "text-foreground" : ""}>
            tunnel config: {status?.tunnelConfigured ? `present${status.tunnelId ? ` (${status.tunnelId.slice(0, 8)}…)` : ""}` : "missing"}
          </li>
          <li className={status?.serviceActive ? "text-foreground" : ""}>
            cloudflared service: {status?.serviceActive ? "running" : "stopped"}
          </li>
          {status?.tunnelHostname && (
            <li className="text-foreground">
              public hostname: <code className="font-mono">{status.tunnelHostname}</code>
            </li>
          )}
        </ul>
      </div>

      {/* Action panel */}
      {!configured && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Next steps</p>
          <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-5">
            {!status?.binaryInstalled && (
              <li>
                Install cloudflared on the server:
                <code className="block mt-1 rounded bg-background px-2 py-1.5 font-mono text-foreground">
                  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cf.deb && sudo dpkg -i cf.deb
                </code>
              </li>
            )}
            {!status?.tunnelConfigured && (
              <li>
                Log in to Cloudflare and create a tunnel:
                <code className="block mt-1 rounded bg-background px-2 py-1.5 font-mono text-foreground">
                  sudo cloudflared tunnel login
                </code>
                Then create + route the tunnel:
                <code className="block mt-1 rounded bg-background px-2 py-1.5 font-mono text-foreground">
                  sudo cloudflared tunnel create doable && sudo cloudflared tunnel route dns doable yourdomain.com
                </code>
              </li>
            )}
            {!status?.serviceActive && status?.tunnelConfigured && (
              <li>
                Start the cloudflared service:
                <code className="block mt-1 rounded bg-background px-2 py-1.5 font-mono text-foreground">
                  sudo cloudflared service install && sudo systemctl enable --now cloudflared
                </code>
              </li>
            )}
          </ol>

          <a
            href={status?.loginUrl ?? "https://dash.cloudflare.com/"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-xs text-brand-400 hover:text-brand-300 underline-offset-2 hover:underline"
          >
            Open Cloudflare dashboard <ExternalLink className="h-3 w-3" />
          </a>

          <Button
            onClick={refresh}
            variant="ghost"
            size="sm"
            className="self-start gap-2 text-muted-foreground"
          >
            Re-check status
          </Button>
        </div>
      )}

      {configured && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <span className="text-sm text-foreground">
            All set — your install is reachable through Cloudflare without exposing
            any ports.
          </span>
        </div>
      )}

      {/* Skip-with-warning panel */}
      {!configured && showSkipConfirm && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="h-4 w-4" />
            <span className="text-sm font-medium">Skip and use direct ports?</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Without Cloudflare your server will need ports 80 and 443 open to the
            public. You become directly responsible for DDoS handling, TLS cert
            renewal, and origin IP exposure. You can add Cloudflare later in{" "}
            <span className="font-medium text-foreground">/admin</span>.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSkipConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => persistChoice("skip")}
              disabled={saveStatus === "saving"}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              {saveStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Skip Cloudflare anyway
            </Button>
          </div>
        </div>
      )}

      {/* Nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {!configured && !showSkipConfirm && (
            <button
              type="button"
              onClick={() => setShowSkipConfirm(true)}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Skip Cloudflare
            </button>
          )}
          <Button
            onClick={() => persistChoice("use_tunnel")}
            disabled={!configured || saveStatus === "saving"}
            className="bg-brand-600 text-white hover:bg-brand-500 gap-2 disabled:opacity-50"
          >
            {saveStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
            {configured ? "Continue" : "Waiting for tunnel…"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
