import type { RefObject } from "react";
import {
  Rocket,
  ExternalLink,
  Copy,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeployResult, DeployError, DeploymentHistoryItem, Step } from "./deploy-dialog-types";

// ─── Configure Step ─────────────────────────────────────────

export function ConfigureStep({
  projectName,
  environment,
  setEnvironment,
  showHistory,
  setShowHistory,
  loadingHistory,
  history,
  onDeploy,
}: {
  projectName: string;
  environment: "production" | "preview";
  setEnvironment: (v: "production" | "preview") => void;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  loadingHistory: boolean;
  history: DeploymentHistoryItem[];
  onDeploy: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Deploy {projectName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Push your project to a public URL.</p>
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Environment</label>
        <div className="grid grid-cols-2 gap-3">
          {(["production", "preview"] as const).map((env) => (
            <button key={env} onClick={() => setEnvironment(env)} className={cn("rounded-lg border p-3 text-left text-sm transition-colors", environment === env ? "border-primary bg-primary/5" : "hover:bg-muted")}>
              <p className="font-medium">{env === "production" ? "Live" : "Test"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{env === "production" ? "Live public deployment" : "Temporary preview link"}</p>
            </button>
          ))}
        </div>
      </div>
      <button onClick={onDeploy} className="flex w-full items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700">
        <Rocket className="h-4 w-4" />Deploy to {environment === "production" ? "Live" : "Test"}
      </button>
      <button onClick={() => setShowHistory(!showHistory)} className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <Clock className="h-3.5 w-3.5" />Deployment history
        {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {showHistory && (
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : history.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">No deployments yet</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", item.status === "live" ? "bg-green-500" : item.status === "failed" ? "bg-red-500" : item.status === "rolled_back" ? "bg-yellow-500" : "bg-gray-400")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{item.url ?? item.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString()}{" "}
                    {new Date(item.created_at).toLocaleTimeString()} - <span className="capitalize">{item.environment}</span>
                  </p>
                </div>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-xs font-medium", item.status === "live" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : item.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400")}>
                  {item.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Building / Deploying Step ──────────────────────────────

export function BuildingStep({
  step,
  buildLog,
  showBuildLog,
  setShowBuildLog,
  buildLogRef,
}: {
  step: Step;
  buildLog: string;
  showBuildLog: boolean;
  setShowBuildLog: (v: boolean) => void;
  buildLogRef: RefObject<HTMLPreElement | null>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-3 pt-2">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="font-medium">{step === "building" ? "Building project..." : "Deploying..."}</p>
        <p className="text-sm text-muted-foreground">This may take up to 60 seconds.</p>
      </div>
      <div className="flex w-full gap-2">
        {["Building", "Deploying", "Live"].map((label, i) => (
          <div key={label} className="flex-1 space-y-1">
            <div className={cn("h-1.5 rounded-full transition-colors", (step === "building" && i === 0) || (step === "deploying" && i <= 1) ? "bg-primary" : "bg-muted")} />
            <p className={cn("text-center text-xs", (step === "building" && i === 0) || (step === "deploying" && i <= 1) ? "text-foreground" : "text-muted-foreground")}>{label}</p>
          </div>
        ))}
      </div>
      {buildLog && (
        <div className="space-y-1">
          <button onClick={() => setShowBuildLog(!showBuildLog)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Build output {showBuildLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showBuildLog && (
            <pre ref={buildLogRef} className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{buildLog}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Success Step ───────────────────────────────────────────

export function SuccessStep({
  result,
  buildLog,
  showBuildLog,
  setShowBuildLog,
  copied,
  onCopyUrl,
  onDone,
}: {
  result: DeployResult;
  buildLog: string;
  showBuildLog: boolean;
  setShowBuildLog: (v: boolean) => void;
  copied: boolean;
  onCopyUrl: () => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 pt-2">
        <CheckCircle className="h-12 w-12 text-green-600" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Live!</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your project is now live.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
        <span className="flex-1 truncate font-mono text-sm">{result.url}</span>
        <button onClick={onCopyUrl} className="shrink-0 rounded p-1.5 hover:bg-background" title="Copy URL">
          {copied ? <CheckCircle className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </button>
        <a href={result.url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1.5 hover:bg-background" title="Open in new tab">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
      <div className="flex justify-center gap-6 text-xs text-muted-foreground">
        {result.buildTimeMs != null && <span>Build: {(result.buildTimeMs / 1000).toFixed(1)}s</span>}
        {result.deployTimeMs != null && <span>Deploy: {(result.deployTimeMs / 1000).toFixed(1)}s</span>}
        <span>Total: {(result.durationMs / 1000).toFixed(1)}s</span>
      </div>
      {buildLog && (
        <div className="space-y-1">
          <button onClick={() => setShowBuildLog(!showBuildLog)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Build output {showBuildLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showBuildLog && <pre className="max-h-40 overflow-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{buildLog}</pre>}
        </div>
      )}
      <button onClick={onDone} className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Done</button>
    </div>
  );
}

// ─── Error Step ─────────────────────────────────────────────

export function ErrorStep({
  error,
  buildLog,
  showBuildLog,
  setShowBuildLog,
  onCancel,
  onTryToFix,
  onRetry,
}: {
  error: DeployError;
  buildLog: string;
  showBuildLog: boolean;
  setShowBuildLog: (v: boolean) => void;
  onCancel: () => void;
  onTryToFix: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 pt-2">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Deployment Failed</h2>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
      {(buildLog || error.buildLog) && (
        <div className="space-y-1">
          <button onClick={() => setShowBuildLog(!showBuildLog)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            Build output {showBuildLog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showBuildLog && <pre className="max-h-40 overflow-auto rounded-md bg-destructive/10 p-3 font-mono text-xs leading-relaxed text-destructive">{buildLog || error.buildLog}</pre>}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button>
        <button onClick={onTryToFix} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700">
          <Sparkles className="h-3.5 w-3.5" />Try to Fix
        </button>
        <button onClick={onRetry} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <RotateCcw className="h-3.5 w-3.5" />Retry
        </button>
      </div>
    </div>
  );
}
