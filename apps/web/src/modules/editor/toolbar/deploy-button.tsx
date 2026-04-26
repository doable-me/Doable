"use client";

import { useState } from "react";
import { Rocket, CheckCircle, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DeployDialog } from "./deploy-dialog";
import type { DeployStatus } from "./deploy-dialog-types";

interface DeployButtonProps {
  projectId: string;
  projectName: string;
  lastDeployedUrl?: string | null;
  className?: string;
}

export function DeployButton({
  projectId,
  projectName,
  lastDeployedUrl,
  className,
}: DeployButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [status, setStatus] = useState<DeployStatus>("idle");

  const statusIcon = {
    idle: <Rocket className="h-4 w-4" />,
    deploying: <Loader2 className="h-4 w-4 animate-spin" />,
    success: <CheckCircle className="h-4 w-4" />,
    error: <AlertCircle className="h-4 w-4" />,
  };

  const statusLabel = {
    idle: lastDeployedUrl ? "Redeploy" : "Deploy",
    deploying: "Deploying...",
    success: "Live",
    error: "Retry",
  };

  return (
    <>
      <button
        onClick={() => setDialogOpen(true)}
        disabled={status === "deploying"}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          status === "success"
            ? "bg-green-600 text-white hover:bg-green-700"
            : status === "error"
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-green-600 text-white hover:bg-green-700",
          className
        )}
      >
        {statusIcon[status]}
        {statusLabel[status]}
      </button>

      <DeployDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open && status === "success") {
            setTimeout(() => setStatus("idle"), 2000);
          }
        }}
        projectId={projectId}
        projectName={projectName}
        onStatusChange={setStatus}
      />
    </>
  );
}
