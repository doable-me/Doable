"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiAddCopilotAccount } from "@/lib/api";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

interface CopilotConnectedMessage {
  type: "doable:copilot-connected";
  ok: true;
  accountId?: string;
  githubLogin: string;
}

interface CopilotErrorMessage {
  type: "doable:copilot-error";
  ok: false;
  error: string;
}

function CopilotOAuthCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState("");
  // Popup mode: when opened via window.open from the setup wizard, we
  // postMessage the result back to the opener and close ourselves instead
  // of routing to /ai-settings. The wizard then picks up the message and
  // continues its inline Copilot configuration step without a page nav.
  const [isPopup, setIsPopup] = useState(false);

  useEffect(() => {
    const popup =
      typeof window !== "undefined" &&
      !!window.opener &&
      window.opener !== window;
    setIsPopup(popup);

    const githubToken = searchParams.get("githubToken");
    const githubLogin = searchParams.get("githubLogin");
    const workspaceId = searchParams.get("workspaceId");
    // scope is plumbed through from the OAuth state by the api callback.
    // wizard popup → state.scope=workspace → here. Personal-override flows
    // from /ai-settings → state.scope=user (or undefined). Anything other
    // than the literal string "workspace" falls back to "user" so a
    // malformed query can't accidentally elevate a personal account into a
    // workspace-shared one.
    const scope: "user" | "workspace" =
      searchParams.get("scope") === "workspace" ? "workspace" : "user";

    if (!githubToken || !githubLogin || !workspaceId) {
      const msg = "Missing OAuth parameters. Please try connecting again.";
      setStatus("error");
      setError(msg);
      if (popup) {
        const errMsg: CopilotErrorMessage = { type: "doable:copilot-error", ok: false, error: msg };
        window.opener?.postMessage(errMsg, window.location.origin);
      }
      return;
    }

    apiAddCopilotAccount(workspaceId, {
      label: `${githubLogin}'s GitHub`,
      githubToken,
      scope,
    })
      .then((res) => {
        setStatus("success");
        if (popup) {
          const okMsg: CopilotConnectedMessage = {
            type: "doable:copilot-connected",
            ok: true,
            accountId: res?.data?.id,
            githubLogin,
          };
          window.opener?.postMessage(okMsg, window.location.origin);
          // Brief flash so user can see the success state, then close.
          setTimeout(() => window.close(), 800);
        } else {
          setTimeout(() => router.push("/ai-settings"), 1500);
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to save GitHub account";
        setStatus("error");
        setError(msg);
        if (popup) {
          const errMsg: CopilotErrorMessage = { type: "doable:copilot-error", ok: false, error: msg };
          window.opener?.postMessage(errMsg, window.location.origin);
        }
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
          <p className="text-zinc-300">
            {isPopup
              ? "GitHub account connected! You can close this window."
              : "GitHub account connected! Redirecting..."}
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="h-8 w-8 text-red-400" />
          <p className="text-red-400">{error}</p>
          {!isPopup && (
            <button
              onClick={() => router.push("/ai-settings")}
              className="mt-2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              Back to AI Settings
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function CopilotOAuthCallback() {
  return (
    <Suspense fallback={null}>
      <CopilotOAuthCallbackInner />
    </Suspense>
  );
}
