/**
 * NotebookLM Chrome-extension presence detection.
 *
 * The backend cannot see the user's browser, and a web page cannot enumerate
 * installed Chrome extensions — so the only way to know whether the NotebookLM
 * extension is installed is to have the extension announce itself from inside
 * this page. The extension ships a content script (content/doable_bridge.js,
 * matched on *.doable.me + localhost:3000) that answers a postMessage ping.
 *
 * This tells you "installed & enabled", NOT "signed into Google / cookies
 * fresh". Pair it with the backend re-auth/cookie signal for the full picture:
 *   - not installed        → detectNotebookLMExtension() resolves { installed:false }
 *   - installed but no auth → detected here, but backend reports reauth_required
 *   - installed & working   → detected here, backend calls succeed
 */

const EXT_SOURCE = "doable-notebooklm-extension";
const PAGE_SOURCE = "doable-web";

export interface ExtensionPresence {
    installed: boolean;
    version?: string;
}

/**
 * Pings the extension and resolves whether it's installed. Resolves
 * { installed: false } if no reply arrives within `timeoutMs`.
 *
 * SSR-safe: resolves { installed: false } when `window` is unavailable.
 */
export function detectNotebookLMExtension(timeoutMs = 1000): Promise<ExtensionPresence> {
    if (typeof window === "undefined") {
        return Promise.resolve({ installed: false });
    }

    return new Promise((resolve) => {
        const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let settled = false;

        const finish = (result: ExtensionPresence) => {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            clearTimeout(timer);
            resolve(result);
        };

        const onMessage = (event: MessageEvent) => {
            // Same-origin, same-window only — ignore iframes and cross-origin.
            if (event.source !== window || event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.source !== EXT_SOURCE || data.type !== "DOABLE_EXT_PONG") return;
            // The unsolicited on-load announce carries nonce:null — accept it too;
            // only reject a PONG whose nonce belongs to a *different* ping.
            if (data.nonce != null && data.nonce !== nonce) return;
            finish({ installed: true, version: data.version });
        };

        window.addEventListener("message", onMessage);
        const timer = setTimeout(() => finish({ installed: false }), timeoutMs);

        window.postMessage({ source: PAGE_SOURCE, type: "DOABLE_EXT_PING", nonce }, window.location.origin);
    });
}
