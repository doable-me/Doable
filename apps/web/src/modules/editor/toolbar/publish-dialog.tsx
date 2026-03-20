"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Rocket,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Clock,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
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
  buildTimeMs?: number;
  deployTimeMs?: number;
  durationMs: number;
}

interface DeployError {
  message: string;
  buildLog?: string;
  deploymentId?: string;
}

interface DeploymentHistoryItem {
  id: string;
  environment: string;
  status: string;
  url: string | null;
  adapter: string;
  build_time_ms: number | null;
  deploy_time_ms: number | null;
  created_at: string;
}

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getAuthToken(): string | null {
  return typeof window !== "undefined"
    ? localStorage.getItem("access_token")
    : null;
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
  const [error, setError] = useState<DeployError | null>(null);
  const [copied, setCopied] = useState(false);
  const [buildLog, setBuildLog] = useState("");
  const [showBuildLog, setShowBuildLog] = useState(false);
  const [history, setHistory] = useState<DeploymentHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const buildLogRef = useRef<HTMLPreElement>(null);

  // Auto-scroll build log
  useEffect(() => {
    if (buildLogRef.current) {
      buildLogRef.current.scrollTop = buildLogRef.current.scrollHeight;
    }
  }, [buildLog]);

  const resetDialog = useCallback(() => {
    setStep("configure");
    setResult(null);
    setError(null);
    setCopied(false);
    setBuildLog("");
    setShowBuildLog(false);
    setShowHistory(false);
  }, []);

  // Load deployment history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(
        `${API_URL}/deploy/${projectId}/history?pageSize=10`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setHistory(data.data ?? []);
      }
    } catch {
      // Silently fail for history loading
    } finally {
      setLoadingHistory(false);
    }
  }, [projectId]);

  // Load history when history panel is opened
  useEffect(() => {
    if (showHistory) {
      loadHistory();
    }
  }, [showHistory, loadHistory]);

  const handlePublish = async () => {
    setStep("building");
    setBuildLog("");
    onStatusChange?.("publishing");

    try {
      // Use the streaming endpoint for real-time build logs
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/deploy/${projectId}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ environment }),
      });

      if (!res.ok) {
        // Fallback: non-streaming error
        const data = await res.json().catch(() => ({ error: "Deployment failed" }));
        setStep("error");
        setError({
          message: data.error ?? "Deployment failed",
          buildLog: data.data?.buildLog,
          deploymentId: data.data?.deploymentId,
        });
        onStatusChange?.("error");
        return;
      }

      // Check if this is a streaming response
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && res.body) {
        // Parse SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              const rawData = line.slice(6);
              try {
                const data = JSON.parse(rawData);
                handleSSEEvent(eventType, data);
              } catch {
                // Ignore malformed events
              }
            }
          }
        }
      } else {
        // Fallback: non-streaming JSON response
        const data = await res.json();
        if (data.error) {
          setStep("error");
          setError({
            message: data.error,
            buildLog: data.data?.buildLog,
            deploymentId: data.data?.deploymentId,
          });
          onStatusChange?.("error");
        } else {
          setResult(data.data);
          setStep("success");
          onStatusChange?.("success");
        }
      }
    } catch (err) {
      setStep("error");
      setError({
        message: err instanceof Error ? err.message : "Network error",
      });
      onStatusChange?.("error");
    }
  };

  const handleSSEEvent = (type: string, data: Record<string, unknown>) => {
    switch (type) {
      case "status": {
        const s = data.step as string;
        if (s === "building") setStep("building");
        else if (s === "deploying") setStep("deploying");
        break;
      }
      case "log":
        setBuildLog((prev) => prev + (data.text as string));
        break;
      case "complete":
        setResult({
          deploymentId: data.deploymentId as string,
          url: data.url as string,
          status: data.status as string,
          buildTimeMs: data.buildTimeMs as number,
          deployTimeMs: data.deployTimeMs as number,
          durationMs: data.durationMs as number,
        });
        setStep("success");
        onStatusChange?.("success");
        break;
      case "error":
        setError({
          message: (data.errorMessage as string) ?? "Deployment failed",
          deploymentId: data.deploymentId as string | undefined,
        });
        setStep("error");
        onStatusChange?.("error");
        break;
      case "done":
        // Stream finished
        break;
    }
  };

  const handleTryToFix = () => {
    // Send error context to AI chat
    // Close the dialog and trigger AI with the build error
    const errorContext = [
      "My deployment failed with the following error:",
      error?.message,
      error?.buildLog ? `\nBuild log:\n${error.buildLog}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Store the error context for the AI chat to pick up
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("doable:deploy-error", {
          detail: { message: errorContext, projectId },
        })
      );
    }

    resetDialog();
    onOpenChange(false);
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
      <div className="relative z-10 w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">
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

            {/* Environment Toggle */}
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
                    <p className="font-medium">
                      {env === "production" ? "Live" : "Test"}
                    </p>
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
              Deploy to {environment === "production" ? "Live" : "Test"}
            </button>

            {/* Deployment History Toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <Clock className="h-3.5 w-3.5" />
              Deployment history
              {showHistory ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {/* History Panel */}
            {showHistory && (
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : history.length === 0 ? (
                  <p className="py-3 text-center text-sm text-muted-foreground">
                    No deployments yet
                  </p>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border p-2 text-sm"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          item.status === "live"
                            ? "bg-green-500"
                            : item.status === "failed"
                              ? "bg-red-500"
                              : item.status === "rolled_back"
                                ? "bg-yellow-500"
                                : "bg-gray-400"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs">
                          {item.url ?? item.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}{" "}
                          {new Date(item.created_at).toLocaleTimeString()} -{" "}
                          <span className="capitalize">{item.environment}</span>
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
                          item.status === "live"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : item.status === "failed"
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Building/Deploying Step */}
        {(step === "building" || step === "deploying") && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 pt-2">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="font-medium">
                {step === "building"
                  ? "Building project..."
                  : "Deploying..."}
              </p>
              <p className="text-sm text-muted-foreground">
                This may take up to 60 seconds.
              </p>
            </div>

            {/* Progress bar */}
            <div className="flex w-full gap-2">
              {["Building", "Deploying", "Live"].map((label, i) => (
                <div key={label} className="flex-1 space-y-1">
                  <div
                    className={cn(
                      "h-1.5 rounded-full transition-colors",
                      (step === "building" && i === 0) ||
                        (step === "deploying" && i <= 1)
                        ? "bg-primary"
                        : "bg-muted"
                    )}
                  />
                  <p
                    className={cn(
                      "text-center text-xs",
                      (step === "building" && i === 0) ||
                        (step === "deploying" && i <= 1)
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Streaming Build Log */}
            {buildLog && (
              <div className="space-y-1">
                <button
                  onClick={() => setShowBuildLog(!showBuildLog)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Build output
                  {showBuildLog ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {showBuildLog && (
                  <pre
                    ref={buildLogRef}
                    className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed"
                  >
                    {buildLog}
                  </pre>
                )}
              </div>
            )}
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
              <span className="flex-1 truncate font-mono text-sm">
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

            {/* Build stats */}
            <div className="flex justify-center gap-6 text-xs text-muted-foreground">
              {result.buildTimeMs != null && (
                <span>Build: {(result.buildTimeMs / 1000).toFixed(1)}s</span>
              )}
              {result.deployTimeMs != null && (
                <span>Deploy: {(result.deployTimeMs / 1000).toFixed(1)}s</span>
              )}
              <span>Total: {(result.durationMs / 1000).toFixed(1)}s</span>
            </div>

            {/* Build log expandable */}
            {buildLog && (
              <div className="space-y-1">
                <button
                  onClick={() => setShowBuildLog(!showBuildLog)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Build output
                  {showBuildLog ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {showBuildLog && (
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">
                    {buildLog}
                  </pre>
                )}
              </div>
            )}

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
        {step === "error" && error && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 pt-2">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <div className="text-center">
                <h2 className="text-lg font-semibold">Deployment Failed</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error.message}
                </p>
              </div>
            </div>

            {/* Error build log */}
            {(buildLog || error.buildLog) && (
              <div className="space-y-1">
                <button
                  onClick={() => setShowBuildLog(!showBuildLog)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Build output
                  {showBuildLog ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {showBuildLog && (
                  <pre className="max-h-40 overflow-auto rounded-md bg-destructive/10 p-3 font-mono text-xs leading-relaxed text-destructive">
                    {buildLog || error.buildLog}
                  </pre>
                )}
              </div>
            )}

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
                onClick={handleTryToFix}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Try to Fix
              </button>
              <button
                onClick={handlePublish}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
