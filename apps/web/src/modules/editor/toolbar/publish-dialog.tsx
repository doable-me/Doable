"use client";

import { useState, useCallback } from "react";
import {
  Rocket,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onStatusChange?: (status: "idle" | "publishing" | "success" | "error") => void;
}

type Step = "configure" | "building" | "deploying" | "success" | "error";

interface DeployResult {
  deploymentId: string;
  url: string;
  status: string;
  durationMs: number;
}

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function PublishDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onStatusChange,
}: PublishDialogProps) {
  const [environment, setEnvironment] = useState<"production" | "preview">(
    "production"
  );
  const [step, setStep] = useState<Step>("configure");
  const [result, setResult] = useState<DeployResult | null>(null);
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const resetDialog = useCallback(() => {
    setStep("configure");
    setResult(null);
    setError("");
    setCopied(false);
  }, []);

  const handlePublish = async () => {
    setStep("building");
    onStatusChange?.("publishing");

    try {
      const endpoint =
        environment === "preview"
          ? `${API_URL}/projects/${projectId}/publish/preview`
          : `${API_URL}/projects/${projectId}/publish`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok) {
        setStep("error");
        setError(data.error ?? "Deployment failed");
        onStatusChange?.("error");
        return;
      }

      setResult(data.data);
      setStep("success");
      onStatusChange?.("success");
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Network error");
      onStatusChange?.("error");
    }
  };

  const copyUrl = () => {
    if (result?.url) {
      navigator.clipboard.writeText(result.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (step !== "building" && step !== "deploying") {
            resetDialog();
            onOpenChange(false);
          }
        }}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl border bg-background p-6 shadow-lg">
        {/* Close */}
        {step !== "building" && step !== "deploying" && (
          <button
            onClick={() => {
              resetDialog();
              onOpenChange(false);
            }}
            className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Configure Step */}
        {step === "configure" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Publish {projectName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Deploy your project to make it live.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Environment</label>
              <div className="grid grid-cols-2 gap-3">
                {(["production", "preview"] as const).map((env) => (
                  <button
                    key={env}
                    onClick={() => setEnvironment(env)}
                    className={cn(
                      "rounded-lg border p-3 text-left text-sm transition-colors",
                      environment === env
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    )}
                  >
                    <p className="font-medium capitalize">{env}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {env === "production"
                        ? "Live public deployment"
                        : "Temporary preview link"}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handlePublish}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700"
            >
              <Rocket className="h-4 w-4" />
              Deploy to {environment}
            </button>
          </div>
        )}

        {/* Building/Deploying Step */}
        {(step === "building" || step === "deploying") && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="font-medium">
              {step === "building" ? "Building project..." : "Deploying..."}
            </p>
            <p className="text-sm text-muted-foreground">This may take up to 60 seconds.</p>
            <div className="flex w-full gap-2">
              {["Building", "Deploying", "Live"].map((label, i) => (
                <div key={label} className="flex-1 space-y-1">
                  <div className={cn("h-1.5 rounded-full", (step === "building" && i === 0) || (step === "deploying" && i <= 1) ? "bg-primary" : "bg-muted")} />
                  <p className={cn("text-center text-xs", (step === "building" && i === 0) || (step === "deploying" && i <= 1) ? "text-foreground" : "text-muted-foreground")}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === "success" && result && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 pt-2">
              <CheckCircle className="h-12 w-12 text-green-600" />
              <div className="text-center">
                <h2 className="text-lg font-semibold">Published!</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your project is now live.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
              <span className="flex-1 truncate text-sm font-mono">
                {result.url}
              </span>
              <button
                onClick={copyUrl}
                className="shrink-0 rounded p-1.5 hover:bg-background"
                title="Copy URL"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded p-1.5 hover:bg-background"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Deployed in {(result.durationMs / 1000).toFixed(1)}s
            </p>

            <button
              onClick={() => {
                resetDialog();
                onOpenChange(false);
              }}
              className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Done
            </button>
          </div>
        )}

        {/* Error Step */}
        {step === "error" && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 pt-2">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <div className="text-center">
                <h2 className="text-lg font-semibold">Deployment Failed</h2>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  resetDialog();
                  onOpenChange(false);
                }}
                className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
