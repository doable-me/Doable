"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiAddCopilotAccount } from "@/lib/api";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function CopilotOAuthCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState("");

  useEffect(() => {
    const githubToken = searchParams.get("githubToken");
    const githubLogin = searchParams.get("githubLogin");
    const workspaceId = searchParams.get("workspaceId");

    if (!githubToken || !githubLogin || !workspaceId) {
      setStatus("error");
      setError("Missing OAuth parameters. Please try connecting again.");
      return;
    }

    // Store the account via API
    apiAddCopilotAccount(workspaceId, {
      label: `${githubLogin}'s GitHub`,
      githubToken,
    })
      .then(() => {
        setStatus("success");
        // Redirect back to AI settings after a brief success message
        setTimeout(() => router.push("/ai-settings"), 1500);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to save GitHub account");
      });
  }, [searchParams, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      {status === "processing" && (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
          <p className="text-zinc-300">Connecting your GitHub account...</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle className="h-8 w-8 text-green-400" />
          <p className="text-zinc-300">GitHub account connected! Redirecting...</p>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="h-8 w-8 text-red-400" />
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => router.push("/ai-settings")}
            className="mt-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Back to AI Settings
          </button>
        </>
      )}
    </div>
  );
}
