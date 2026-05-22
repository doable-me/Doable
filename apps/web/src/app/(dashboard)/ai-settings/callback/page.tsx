"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  apiAddCopilotAccount,
  apiListCopilotAccounts,
  apiUpdateCopilotAccount,
} from "@/lib/api";
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

// localStorage signal channel. Same-origin tabs/windows get a `storage`
// event when this key is written, so the wizard tab can react even when
// postMessage fails (window.opener cleared by COOP) AND when polling-by-
// new-id misses the account (because it already existed in baseline).
const COPILOT_SIGNAL_KEY = "doable:copilot-recent";

function broadcastConnected(accountId: string, githubLogin: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      COPILOT_SIGNAL_KEY,
      JSON.stringify({ accountId, githubLogin, ts: Date.now() }),
    );
  } catch {
    // Storage quota / private-mode — wizard polling is the safety net.
  }
}

function CopilotOAuthCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [error, setError] = useState("");
  // Wizard mode: the setup wizard initiates the OAuth flow with
  // `?fromWizard=1`, which the api preserves through OAuth state and
  // echoes back to this page. Wizard mode means: do NOT redirect to
  // /ai-settings (that page overwhelms first-time admins), just show a
  // success card. The wizard window — which is still open in another
  // tab — polls /workspaces/:wid/ai-settings/copilot-accounts every 2s
  // and picks up the new row, then unblocks its "Waiting for GitHub…"
  // button automatically.
  //
  // Popup mode (legacy/best-effort): when this page IS opened as a
  // popup (window.opener intact), we ALSO postMessage the result so the
  // wizard can react instantly without waiting for the next poll tick.
  // window.opener gets cleared by Chrome/Safari COOP after the
  // cross-origin trip through github.com on many recent versions, which
  // is exactly why the fromWizard flag exists as the reliable signal.
  const [isWizard, setIsWizard] = useState(false);
  const [isPopup, setIsPopup] = useState(false);

  useEffect(() => {
    const wizard = searchParams.get("fromWizard") === "1";
    const popup =
      typeof window !== "undefined" &&
      !!window.opener &&
      window.opener !== window;
    setIsWizard(wizard);
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

    // Try to insert. On 409 (account already connected for this workspace +
    // scope), fall back to PATCHing the existing row with the fresh
    // githubToken — the user just re-authorized, so refresh the stored
    // credential and treat the connection as successful. Without this
    // fallback the wizard dead-ends on the duplicate error even though the
    // operator's intent (use this GitHub account for Copilot) is satisfied.
    (async () => {
      try {
        const res = await apiAddCopilotAccount(workspaceId, {
          label: `${githubLogin}'s GitHub`,
          githubToken,
          scope,
        });
        return { accountId: res.data.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes("already connected")) throw err;
        // 409 path: look up the existing row by github_login + matching
        // scope (workspace-shared OR same-user personal) and refresh its
        // token. apiUpdateCopilotAccount returns the updated row's id.
        const list = await apiListCopilotAccounts(workspaceId);
        const existing = (list.data ?? []).find(
          (a) => a.github_login === githubLogin && a.scope === scope,
        );
        if (!existing) throw err; // shouldn't happen — 409 implies a row exists
        await apiUpdateCopilotAccount(workspaceId, existing.id, { githubToken });
        return { accountId: existing.id };
      }
    })()
      .then(({ accountId }) => {
        setStatus("success");
        // 1. Always broadcast via localStorage — same-origin storage event
        //    reaches the wizard tab regardless of window.opener state or
        //    whether the account was newly created vs. refreshed.
        broadcastConnected(accountId, githubLogin);
        // 2. postMessage is best-effort: works when opener is preserved,
        //    no-op when COOP cleared it. Wizard's storage listener + 2s
        //    polling pick up the slack either way.
        if (popup) {
          const okMsg: CopilotConnectedMessage = {
            type: "doable:copilot-connected",
            ok: true,
            accountId,
            githubLogin,
          };
          window.opener?.postMessage(okMsg, window.location.origin);
        }
        if (wizard) {
          // Wizard mode: try to close (works for true popups; no-op for
          // browser-promoted tabs). Don't navigate to /ai-settings —
          // the wizard tab is in another window and will already know
          // via the storage event we just emitted.
          setTimeout(() => window.close(), 800);
        } else if (popup) {
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
            {isWizard
              ? "GitHub Copilot connected! Switch back to the setup wizard tab — it will pick this up automatically."
              : isPopup
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
