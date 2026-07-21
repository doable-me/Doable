/**
 * @doable/sdk — Secure integration proxy client.
 *
 * Lets generated Vite & Next.js apps call any connected integration
 * (Slack, Stripe, GitHub, etc.) through a secure server-side proxy.
 * Credentials never reach the browser.
 *
 * Usage:
 *   import { createDoableClient } from "@doable/sdk";
 *   const doable = createDoableClient();
 *   const result = await doable.integrations.run("slack", "send_channel_message", { channel: "#general", text: "hi" });
 */

export interface IntegrationCallResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  meta: { integrationId: string; actionName: string; durationMs: number } | null;
}

export interface McpCallResult<T = unknown> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; loginUrl?: string } | null;
  meta: { connectorName: string; toolName: string; durationMs: number } | null;
}

export interface McpTool {
  /** Full prefixed tool name — use this in doable.mcp.call() */
  fullName: string;
  /** Alias for fullName (convenience) */
  name: string;
  connectorName: string;
  toolName: string;
  description?: string;
}

export interface AvailableIntegration {
  id: string;
  displayName: string;
  actions: Array<{
    name: string;
    displayName: string;
    description: string;
  }>;
}

export interface DoableSDKConfig {
  /** Override proxy base URL (defaults to same-origin /__doable/connector-proxy) */
  proxyUrl?: string;
  /** Project API key for deployed apps (omit in preview — token arrives via postMessage) */
  apiKey?: string;
  /** Project ID (required when using apiKey) */
  projectId?: string;
}

export interface DoableClient {
  integrations: {
    /**
     * Call an integration action through the secure proxy.
     * Credentials are decrypted server-side — never exposed to the browser.
     */
    run<T = unknown>(
      integrationId: string,
      actionName: string,
      props?: Record<string, unknown>,
    ): Promise<IntegrationCallResult<T>>;

    /**
     * List integrations available for this project.
     */
    list(): Promise<{ success: boolean; data: AvailableIntegration[]; error: { code: string; message: string } | null }>;
  };

  mcp: {
    /**
     * Call an MCP tool through the secure proxy.
     * Use the full AI-prefixed tool name (e.g. "mcp_hpca_mcp_get_user_info")
     * or connector-scoped name. Credentials are resolved server-side.
     */
    call<T = unknown>(
      toolName: string,
      args?: Record<string, unknown>,
    ): Promise<McpCallResult<T>>;

    /**
     * List available MCP tools for this workspace.
     */
    list(): Promise<{ success: boolean; data: McpTool[]; error: { code: string; message: string } | null }>;
  };

  /**
   * Voice — always-on TTS & STT. Automatically uses ElevenLabs when the
   * integration is connected, and transparently falls back to the browser's
   * built-in SpeechSynthesis / SpeechRecognition when it is not. Generated
   * apps MUST use ONLY this for voice — never call the elevenlabs integration
   * directly. Works identically whether or not ElevenLabs is set up.
   */
  voice: {
    /** Speak text aloud. Resolves once playback starts. Never throws. */
    speak(text: string, opts?: { voice?: string }): Promise<{ engine: "elevenlabs" | "browser" | "none" }>;
    /** Stop any in-progress speech (both engines). */
    stopSpeaking(): void;
    /** Record one utterance from the mic and return its transcript. Never throws. */
    listen(opts?: { lang?: string; maxMs?: number }): Promise<{ text: string; engine: "elevenlabs" | "browser" | "none" }>;
    /** Whether ElevenLabs is connected & usable for this project. */
    isElevenLabsAvailable(): Promise<boolean>;
  };
}

/**
 * Create a Doable client for calling integrations from the browser.
 *
 * In preview mode (editor open): token arrives via postMessage automatically.
 * In deployed mode: pass apiKey from env.
 */
export function createDoableClient(config?: DoableSDKConfig): DoableClient {
  // Auto-detect VITE_DOABLE_PROJECT_KEY from env when no apiKey is explicitly provided.
  // This allows generated projects to just call createDoableClient() and have the key
  // automatically injected at build time via the auto-provisioning pipeline.
  let autoKey = config?.apiKey;
  if (!autoKey) {
    try {
      // Vite replaces import.meta.env.* at build time with the literal value
      const envKey = (import.meta as any).env?.VITE_DOABLE_PROJECT_KEY;
      if (typeof envKey === "string" && envKey.length > 0) {
        autoKey = envKey;
      }
    } catch {
      // Not in a Vite context (SSR, tests, etc.) — ignore
    }
  }
  // Deployed mode: the publish pipeline bakes the project key into the served
  // index.html as the runtime global `window.__DOABLE_DATA_TOKEN` (the SAME
  // token @doable/data reads). Read it here so MCP/connector calls authenticate
  // with the baked key. Without this, a published static site has no apiKey
  // (VITE_DOABLE_PROJECT_KEY is only present if it happened to be inlined at
  // build time) and TokenManager falls back to the preview-only postMessage /
  // `/preview/:id/__doable/token` flow — which never resolves on a deployed
  // origin, so getToken() hangs and mcp.call() emits no network request at all.
  // In preview the global is absent, so the existing preview flow is unchanged.
  if (!autoKey && typeof globalThis !== "undefined") {
    const baked = (globalThis as Record<string, unknown>)["__DOABLE_DATA_TOKEN"];
    if (typeof baked === "string" && baked.length > 0) {
      autoKey = baked;
    }
  }

  // Auto-detect proxy URL from VITE_DOABLE_API_URL env var for deployed sites.
  // Published sites need an absolute URL because they're served from a different
  // domain (e.g. dev-my-app-x7k2m.doable.me) than the API (dev-api.doable.me).
  let autoProxyUrl = config?.proxyUrl;
  if (!autoProxyUrl) {
    try {
      const apiUrl = (import.meta as any).env?.VITE_DOABLE_API_URL;
      if (typeof apiUrl === "string" && apiUrl.length > 0) {
        autoProxyUrl = `${apiUrl.replace(/\/$/, "")}/__doable/connector-proxy`;
      }
    } catch {
      // Not in a Vite context — ignore
    }
  }

  const resolvedConfig: DoableSDKConfig = {
    proxyUrl: autoProxyUrl ?? "/__doable/connector-proxy",
    apiKey: autoKey,
    projectId: config?.projectId,
  };

  const tokenManager = new TokenManager(resolvedConfig.apiKey);

  // Shared playback handle so voice.stopSpeaking() can halt ElevenLabs audio.
  let currentAudio: HTMLAudioElement | null = null;
  // Default ElevenLabs voice (Sarah) used when the caller doesn't specify one.
  const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";
  // Cheap check: is ElevenLabs an ACTIVE connection for this project?
  // /available only lists integrations with a live vault connection.
  const elevenLabsAvailable = async (): Promise<boolean> => {
    try {
      const token = await tokenManager.getToken();
      const headers: Record<string, string> = { authorization: `Bearer ${token}` };
      if (resolvedConfig.projectId) headers["x-doable-project-id"] = resolvedConfig.projectId;
      const res = await fetch(`${resolvedConfig.proxyUrl}/available`, { headers });
      if (!res.ok) return false;
      const body = await res.json();
      return (body.integrations ?? []).some((i: { id?: string }) => i.id === "elevenlabs");
    } catch {
      return false;
    }
  };

  return {
    integrations: {
      async run<T = unknown>(
        integrationId: string,
        actionName: string,
        props?: Record<string, unknown>,
      ): Promise<IntegrationCallResult<T>> {
        return callProxy<T>(integrationId, actionName, props ?? {}, resolvedConfig, tokenManager);
      },

      async list(): Promise<{ success: boolean; data: AvailableIntegration[]; error: { code: string; message: string } | null }> {
        const baseUrl = resolvedConfig.proxyUrl!;
        const url = `${baseUrl}/available`;
        const token = await tokenManager.getToken();
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        if (resolvedConfig.projectId) {
          headers["x-doable-project-id"] = resolvedConfig.projectId;
        }
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return { success: false, data: [], error: { code: "HTTP_ERROR", message: `HTTP ${res.status}` } };
          const body = await res.json();
          return { success: true, data: body.integrations ?? [], error: null };
        } catch (err) {
          return { success: false, data: [], error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Failed to list integrations" } };
        }
      },
    },

    mcp: {
      async call<T = unknown>(
        toolName: string,
        args?: Record<string, unknown>,
      ): Promise<McpCallResult<T>> {
        return callMcpProxy<T>(toolName, args ?? {}, resolvedConfig, tokenManager);
      },

      async list(): Promise<{ success: boolean; data: McpTool[]; error: { code: string; message: string } | null }> {
        const baseUrl = resolvedConfig.proxyUrl!;
        const url = `${baseUrl}/mcp/available`;
        const token = await tokenManager.getToken();
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        if (resolvedConfig.projectId) {
          headers["x-doable-project-id"] = resolvedConfig.projectId;
        }
        try {
          const res = await fetch(url, { headers });
          if (!res.ok) return { success: false, data: [], error: { code: "HTTP_ERROR", message: `HTTP ${res.status}` } };
          const body = await res.json();
          const tools: McpTool[] = (body.tools ?? []).map((t: Record<string, string>) => ({
            ...t,
            name: t.fullName ?? t.name ?? "",
          }));
          return { success: true, data: tools, error: null };
        } catch (err) {
          return { success: false, data: [], error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Failed to list MCP tools" } };
        }
      },
    },

    voice: {
      async speak(text: string, opts?: { voice?: string }): Promise<{ engine: "elevenlabs" | "browser" | "none" }> {
        const t = (text ?? "").trim();
        if (!t) return { engine: "none" };
        const canAudio = typeof window !== "undefined" && typeof Audio !== "undefined";
        // 1. Prefer ElevenLabs when reachable. Tolerant of the return shape the
        //    action produces (a URL string) OR an object the model might expect.
        if (canAudio) {
          try {
            const r = await callProxy<unknown>(
              "elevenlabs",
              "elevenlabs-text-to-speech",
              { text: t, voice: opts?.voice ?? DEFAULT_VOICE },
              resolvedConfig,
              tokenManager,
            );
            const d = r.data as unknown;
            const url =
              typeof d === "string"
                ? d
                : d && typeof d === "object"
                  ? ((d as Record<string, unknown>).audio_url ??
                     (d as Record<string, unknown>).url ??
                     (d as Record<string, unknown>).audioUrl) as string | undefined
                  : undefined;
            if (r.success && typeof url === "string" && url) {
              try { currentAudio?.pause(); } catch { /* ignore */ }
              const audio = new Audio(url);
              currentAudio = audio;
              await audio.play();
              return { engine: "elevenlabs" };
            }
          } catch { /* fall through to browser */ }
        }
        // 2. Fallback: browser SpeechSynthesis — always available, no key needed.
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          try {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(new SpeechSynthesisUtterance(t));
            return { engine: "browser" };
          } catch { /* ignore */ }
        }
        return { engine: "none" };
      },

      stopSpeaking(): void {
        try { currentAudio?.pause(); } catch { /* ignore */ }
        currentAudio = null;
        try {
          if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
        } catch { /* ignore */ }
      },

      async isElevenLabsAvailable(): Promise<boolean> {
        return elevenLabsAvailable();
      },

      async listen(opts?: { lang?: string; maxMs?: number }): Promise<{ text: string; engine: "elevenlabs" | "browser" | "none" }> {
        if (typeof window === "undefined") return { text: "", engine: "none" };
        const cap = Math.min(opts?.maxMs ?? 6000, 15000);
        // 1. ElevenLabs Scribe when connected: record a clip → base64 → transcribe.
        if (
          (await elevenLabsAvailable()) &&
          typeof navigator !== "undefined" &&
          navigator.mediaDevices?.getUserMedia &&
          typeof MediaRecorder !== "undefined"
        ) {
          try {
            // Explicit audio constraints. `getUserMedia({ audio: true })`
            // accepts the browser's default constraint set, which on
            // Windows/Linux Chrome does NOT enable autoGainControl by
            // default — a quiet mic then produces a recording whose peak
            // amplitude is below Scribe's speech-detection floor, and
            // Scribe returns text:"" and words:[] (zero-word transcript
            // for a valid webm/opus stream, the exact symptom of the empty
            // response). The three flags below are Web Audio Working
            // Group standards and every browser that ships MediaRecorder
            // supports them; requesting them explicitly makes the capture
            // robust across all platforms without hurting quality when a
            // good mic is used.
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
            });
            // Force an explicit webm/opus mimeType. Some Chrome builds
            // report an empty `rec.mimeType` when `start()` runs without a
            // timeslice, and the fallback `"audio/webm"` string in the
            // Blob constructor produces bytes whose container claim
            // doesn't match the actual codec — Scribe reads the EBML
            // header, can't reconcile the codec, and yields no words.
            // Pinning the mimeType at construction guarantees the bytes
            // match what we tell the server (and Scribe).
            const preferredMime =
              [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/ogg;codecs=opus",
              ].find((m) =>
                typeof MediaRecorder.isTypeSupported === "function"
                  ? MediaRecorder.isTypeSupported(m)
                  : false,
              ) ?? "";
            const rec = preferredMime
              ? new MediaRecorder(stream, { mimeType: preferredMime })
              : new MediaRecorder(stream);
            const chunks: Blob[] = [];
            // Await BOTH `dataavailable` (at least once, with real bytes)
            // AND `stop`. Chrome ≥ 120 sometimes emits `stop` before the
            // final `dataavailable` completes when `start()` has no
            // timeslice — the original code only awaited `stop`, then
            // read `chunks` while empty and shipped a bare-header webm.
            // Waiting for both events (plus using a timeslice below so
            // `dataavailable` also fires periodically) makes the blob
            // deterministically complete before we base64-encode it.
            let dataResolve!: () => void;
            const dataFired = new Promise<void>((resolve) => { dataResolve = resolve; });
            let stopResolve!: () => void;
            const stopFired = new Promise<void>((resolve) => { stopResolve = resolve; });
            rec.ondataavailable = (e) => {
              if (e.data.size > 0) chunks.push(e.data);
              dataResolve();
            };
            rec.onstop = () => stopResolve();
            // 500ms timeslice: every 500ms MediaRecorder flushes a
            // properly-terminated webm cluster into `dataavailable`. The
            // concatenated blob is therefore a valid, seekable file even
            // if the browser reorders end-of-stream events, and
            // `dataavailable` is guaranteed to have fired at least once
            // long before `stop`, eliminating the race described above.
            rec.start(500);
            await new Promise((r) => setTimeout(r, cap));
            rec.stop();
            await Promise.all([dataFired, stopFired]);
            stream.getTracks().forEach((tr) => tr.stop());
            const mimeUsed = rec.mimeType || preferredMime || "audio/webm";
            const blob = new Blob(chunks, { type: mimeUsed });
            // Guard: a webm/opus blob smaller than ~2 KB is a bare
            // container header with no audible content — the mic was
            // muted, the OS returned a null device, or permission
            // granted a virtual/loopback sink. Falling through to the
            // browser SpeechRecognition path saves an ElevenLabs API
            // call that would deterministically return "" and lets the
            // caller distinguish "silence" from "recognised silence".
            if (blob.size < 2048) {
              throw new Error(
                "voice.listen: captured audio too small (" + blob.size + "B); " +
                "check the microphone permission and selected device",
              );
            }
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const s = reader.result as string;
                resolve(s.includes(",") ? s.split(",")[1] : s);
              };
              reader.onerror = () => reject(new Error("read failed"));
              reader.readAsDataURL(blob);
            });
            const r = await callProxy<unknown>(
              "elevenlabs",
              "elevenlabs-speech-to-text",
              { audioBase64: base64, mimeType: blob.type, languageCode: opts?.lang },
              resolvedConfig,
              tokenManager,
            );
            const d = r.data as unknown;
            const text = typeof d === "string" ? d : d && typeof d === "object" ? String((d as Record<string, unknown>).text ?? "") : "";
            if (r.success && text) return { text, engine: "elevenlabs" };
          } catch { /* fall through to browser */ }
        }
        // 2. Fallback: browser SpeechRecognition (live mic).
        const w = window as unknown as Record<string, unknown>;
        const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => any) | undefined;
        if (SR) {
          try {
            return await new Promise((resolve) => {
              const rec = new SR();
              rec.lang = opts?.lang ?? "en-US";
              rec.interimResults = false;
              rec.maxAlternatives = 1;
              let done = false;
              const finish = (text: string) => {
                if (done) return;
                done = true;
                try { rec.stop(); } catch { /* ignore */ }
                resolve({ text, engine: "browser" });
              };
              rec.onresult = (e: any) => finish(e.results?.[0]?.[0]?.transcript ?? "");
              rec.onerror = () => finish("");
              rec.onend = () => finish("");
              rec.start();
              setTimeout(() => finish(""), cap);
            });
          } catch { /* ignore */ }
        }
        return { text: "", engine: "none" };
      },
    },
  };
}

// ─── Token Management ──────────────────────────────────────

class TokenManager {
  private token: string | null;
  private waiters: Array<(token: string) => void> = [];
  private listening = false;

  constructor(apiKey?: string) {
    this.token = apiKey ?? null;

    // In browser without API key: use postMessage flow
    if (!apiKey && typeof window !== "undefined") {
      this.setupPostMessage();
    }
  }

  private setupPostMessage(): void {
    if (this.listening) return;
    this.listening = true;

    // FIX (preview-token race): the iframe's SDK initialises as soon as the
    // bundle loads, but the parent editor's postMessage listener is attached
    // inside a React useEffect that fires AFTER mount. If the iframe wins the
    // race (common), a single one-shot "doable:connector-proxy-ready" gets
    // dropped on the floor — getToken() then hangs forever, mcp.list() never
    // completes, and the generated chat sees an empty tool catalogue.
    //
    // We re-broadcast the ready message on a short interval until either the
    // parent responds with a token (clearRetry() in the message handler
    // below) or we hit a sane safety cap. Generic across all preview hosts —
    // no per-project / per-server config.
    let retryTimer: ReturnType<typeof setInterval> | null = null;
    const clearRetry = () => {
      if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
    };

    window.addEventListener("message", (ev) => {
      if (!ev.data || typeof ev.data !== "object") return;
      if (ev.data.type === "doable:connector-proxy-token" && typeof ev.data.token === "string") {
        this.token = ev.data.token;
        clearRetry();
        const queue = this.waiters;
        this.waiters = [];
        queue.forEach((resolve) => resolve(this.token!));
      }
    });

    // If in an iframe, signal to parent that we need a token
    if (window.parent !== window) {
      const postReady = () => {
        try {
          window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*");
        } catch {
          // Cross-origin block or detached parent — give up the retry loop.
          clearRetry();
        }
      };
      postReady();
      retryTimer = setInterval(postReady, 1500);
      // Safety cap: stop retrying after 30 s so a truly broken parent doesn't
      // leak a forever-running interval. getToken() will keep awaiting the
      // first token to arrive via invalidate() or a future message.
      setTimeout(clearRetry, 30_000);
    } else {
      // Standalone mode — fetch token directly from the preview token endpoint
      this.fetchTokenDirect();
    }
  }

  private fetchTokenDirect(): void {
    // Extract project ID from URL path: /preview/:projectId/...
    const pathMatch = window.location.pathname.match(/^\/preview\/([0-9a-f-]{36})\//i);
    let pid = pathMatch?.[1] ?? null;
    if (!pid) {
      const meta = document.querySelector('meta[name="doable-project-id"]');
      pid = meta?.getAttribute("content") ?? null;
    }
    if (!pid) return;
    fetch(`/preview/${pid}/__doable/token`, { method: "POST" })
      .then((r) => r.ok ? r.json() : null)
      .then((d: { token?: string } | null) => {
        if (d?.token) {
          this.token = d.token;
          const queue = this.waiters;
          this.waiters = [];
          queue.forEach((resolve) => resolve(this.token!));
        }
      })
      .catch(() => {});
  }

  async getToken(): Promise<string> {
    if (this.token) return this.token;
    if (typeof window === "undefined") {
      throw new Error("@doable/sdk: No API key provided and not running in browser. Use createServerClient() for server-side.");
    }
    return new Promise<string>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  invalidate(): void {
    this.token = null;
    if (typeof window !== "undefined") {
      if (window.parent !== window) {
        try {
          window.parent.postMessage({ type: "doable:connector-proxy-ready" }, "*");
        } catch {
          // ignore
        }
      } else {
        this.fetchTokenDirect();
      }
    }
  }
}

// ─── Proxy Fetch ───────────────────────────────────────────

async function callProxy<T>(
  integrationId: string,
  actionName: string,
  props: Record<string, unknown>,
  config: DoableSDKConfig,
  tokenManager: TokenManager,
): Promise<IntegrationCallResult<T>> {
  const baseUrl = config.proxyUrl ?? "/__doable/connector-proxy";
  const url = `${baseUrl}/${encodeURIComponent(integrationId)}/${encodeURIComponent(actionName)}`;

  const headers: Record<string, string> = { "content-type": "application/json" };

  const token = await tokenManager.getToken();
  headers["authorization"] = `Bearer ${token}`;
  if (config.projectId) {
    headers["x-doable-project-id"] = config.projectId;
  }

  const body = JSON.stringify({ props });

  try {
    let res = await fetch(url, { method: "POST", headers, body });

    // Token expired — refresh and retry once (preview mode only)
    if (res.status === 401 && !config.apiKey) {
      tokenManager.invalidate();
      const freshToken = await tokenManager.getToken();
      headers["authorization"] = `Bearer ${freshToken}`;
      res = await fetch(url, { method: "POST", headers, body });
    }

    const json = await res.json();

    // Normalize the response into our standard format
    if (json.success !== undefined) {
      // New format from updated proxy
      return {
        success: json.success,
        data: json.success ? (json.data ?? json.output ?? null) : null,
        error: json.success ? null : { code: json.error?.code ?? "UNKNOWN", message: json.error?.detail ?? json.error?.message ?? "Unknown error" },
        meta: json.meta ?? null,
      };
    }

    // Legacy format from existing connector-proxy (returns { success, output, error })
    if ("output" in json) {
      return {
        success: json.success ?? true,
        data: json.output as T,
        error: json.error ? { code: "EXECUTION_FAILED", message: json.error } : null,
        meta: { integrationId, actionName, durationMs: 0 },
      };
    }

    // Error format
    if (json.error) {
      return {
        success: false,
        data: null,
        error: { code: json.error.code ?? "UNKNOWN", message: json.error.detail ?? json.error.message ?? "Unknown error" },
        meta: null,
      };
    }

    return { success: true, data: json as T, error: null, meta: { integrationId, actionName, durationMs: 0 } };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network request failed" },
      meta: null,
    };
  }
}

// ─── MCP Proxy Fetch ───────────────────────────────────────

async function callMcpProxy<T>(
  toolName: string,
  args: Record<string, unknown>,
  config: DoableSDKConfig,
  tokenManager: TokenManager,
): Promise<McpCallResult<T>> {
  const baseUrl = config.proxyUrl ?? "/__doable/connector-proxy";
  const url = `${baseUrl}/mcp/${encodeURIComponent(toolName)}`;

  const headers: Record<string, string> = { "content-type": "application/json" };

  const token = await tokenManager.getToken();
  headers["authorization"] = `Bearer ${token}`;
  if (config.projectId) {
    headers["x-doable-project-id"] = config.projectId;
  }

  const body = JSON.stringify({ props: args });

  try {
    let res = await fetch(url, { method: "POST", headers, body });

    // Token expired — refresh and retry once
    if (res.status === 401 && !config.apiKey) {
      tokenManager.invalidate();
      const freshToken = await tokenManager.getToken();
      headers["authorization"] = `Bearer ${freshToken}`;
      res = await fetch(url, { method: "POST", headers, body });
    }

    const json = await res.json();

    return {
      success: json.success ?? false,
      data: json.success ? (json.data as T ?? null) : null,
      error: json.success ? null : { code: json.error?.code ?? "UNKNOWN", message: json.error?.message ?? "MCP call failed", loginUrl: json.error?.loginUrl },
      meta: json.meta ?? null,
    };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: { code: "NETWORK_ERROR", message: err instanceof Error ? err.message : "Network request failed" },
      meta: null,
    };
  }
}

export type { DoableSDKConfig as Config, DoableClient as Client };

