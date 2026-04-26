"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { X } from "lucide-react";
import type { DeployDialogProps, DeployResult, DeployError, DeploymentHistoryItem, Step } from "./deploy-dialog-types";
import { API_URL, getAuthHeaders, getAuthToken } from "./deploy-dialog-types";
import { ConfigureStep, BuildingStep, SuccessStep, ErrorStep } from "./deploy-dialog-steps";

export function DeployDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onStatusChange,
}: DeployDialogProps) {
  const [environment, setEnvironment] = useState<"production" | "preview">("production");
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

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_URL}/deploy/${projectId}/history?pageSize=10`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.data ?? []);
      }
    } catch { /* Silently fail */ } finally { setLoadingHistory(false); }
  }, [projectId]);

  useEffect(() => { if (showHistory) loadHistory(); }, [showHistory, loadHistory]);

  const handleSSEEvent = (type: string, data: Record<string, unknown>) => {
    switch (type) {
      case "status": {
        const s = data.step as string;
        if (s === "building") setStep("building");
        else if (s === "deploying") setStep("deploying");
        break;
      }
      case "log": setBuildLog((prev) => prev + (data.text as string)); break;
      case "complete":
        setResult({
          deploymentId: data.deploymentId as string, url: data.url as string,
          status: data.status as string, buildTimeMs: data.buildTimeMs as number,
          deployTimeMs: data.deployTimeMs as number, durationMs: data.durationMs as number,
        });
        setStep("success"); onStatusChange?.("success"); break;
      case "error":
        setError({ message: (data.errorMessage as string) ?? "Deployment failed", deploymentId: data.deploymentId as string | undefined });
        setStep("error"); onStatusChange?.("error"); break;
    }
  };

  const handleDeploy = async () => {
    setStep("building"); setBuildLog(""); onStatusChange?.("deploying");
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_URL}/deploy/${projectId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ environment }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Deployment failed" }));
        setStep("error");
        setError({ message: data.error ?? "Deployment failed", buildLog: data.data?.buildLog, deploymentId: data.data?.deploymentId });
        onStatusChange?.("error"); return;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream") && res.body) {
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
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) {
              try { handleSSEEvent(eventType, JSON.parse(line.slice(6))); } catch { /* ignore */ }
            }
          }
        }
      } else {
        const data = await res.json();
        if (data.error) { setStep("error"); setError({ message: data.error, buildLog: data.data?.buildLog, deploymentId: data.data?.deploymentId }); onStatusChange?.("error"); }
        else { setResult(data.data); setStep("success"); onStatusChange?.("success"); }
      }
    } catch (err) {
      setStep("error"); setError({ message: err instanceof Error ? err.message : "Network error" }); onStatusChange?.("error");
    }
  };

  const handleTryToFix = () => {
    const errorContext = ["My deployment failed with the following error:", error?.message, error?.buildLog ? `\nBuild log:\n${error.buildLog}` : ""].filter(Boolean).join("\n");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("doable:deploy-error", { detail: { message: errorContext, projectId } }));
    }
    resetDialog(); onOpenChange(false);
  };

  const copyUrl = () => {
    if (result?.url) { navigator.clipboard.writeText(result.url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  const handleDone = () => { resetDialog(); onOpenChange(false); };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => { if (step !== "building" && step !== "deploying") handleDone(); }} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border bg-background p-6 shadow-lg">
        {step !== "building" && step !== "deploying" && (
          <button onClick={handleDone} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        )}
        {step === "configure" && (
          <ConfigureStep projectName={projectName} environment={environment} setEnvironment={setEnvironment} showHistory={showHistory} setShowHistory={setShowHistory} loadingHistory={loadingHistory} history={history} onDeploy={handleDeploy} />
        )}
        {(step === "building" || step === "deploying") && (
          <BuildingStep step={step} buildLog={buildLog} showBuildLog={showBuildLog} setShowBuildLog={setShowBuildLog} buildLogRef={buildLogRef} />
        )}
        {step === "success" && result && (
          <SuccessStep result={result} buildLog={buildLog} showBuildLog={showBuildLog} setShowBuildLog={setShowBuildLog} copied={copied} onCopyUrl={copyUrl} onDone={handleDone} />
        )}
        {step === "error" && error && (
          <ErrorStep error={error} buildLog={buildLog} showBuildLog={showBuildLog} setShowBuildLog={setShowBuildLog} onCancel={handleDone} onTryToFix={handleTryToFix} onRetry={handleDeploy} />
        )}
      </div>
    </div>
  );
}
