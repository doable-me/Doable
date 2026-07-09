/**
 * Native Fetch Client for NotebookLM
 * 
 * Uses cookies from Chrome extension instead of Playwright browser automation.
 * This eliminates the popup Chrome window.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Logging ---
const LOG_FILE = path.resolve(__dirname, "../server.log");
function logToFile(msg: string) {
    const timestamp = new Date().toLocaleString();
    const formattedMsg = `[${timestamp}] ${msg}`;
    try {
        fs.appendFileSync(LOG_FILE, formattedMsg + "\n");
    } catch { }
    process.stderr.write(formattedMsg + "\n");
}

// --- CONFIGURATION ---
const BASE_URL = "https://notebooklm.google.com";
const RPC_ENDPOINT = `${BASE_URL}/_/LabsTailwindUi/data/batchexecute`;
const RPC_GENERATE_STREAMED = `${BASE_URL}/_/LabsTailwindUi/data/google.internal.labs.tailwind.orchestration.v1.LabsTailwindOrchestrationService/GenerateFreeFormStreamed`;

// RPC IDs
const RPC_CREATE_NOTEBOOK = "CCqFvf";
const RPC_ADD_SOURCE = "izAoDd";
const RPC_GENERATE_INFOGRAPHIC = "R7cb6c";
const RPC_LIST_ARTIFACTS = "gArtLc";
const RPC_DELETE_NOTEBOOK = "f61S6e";
const RPC_LOAD_NOTEBOOK = "rLM1Ne";
// Lists every notebook in the account — the same RPC the NotebookLM home page
// itself calls to render "Recent notebooks". Discovered via a real HAR capture
// of that page load (user-provided) and cross-verified independently via a
// live Playwright network capture — same rpcid, same request payload, same
// response shape in both. This is ground truth: unlike our local
// notebook_cache (a URL -> notebookId mapping we maintain ourselves and can
// get out of sync), this always reflects what NotebookLM's backend actually
// has right now.
const RPC_LIST_NOTEBOOKS = "wXbhsf";
// Static payload — no pagination cursor needed for the first page, which is
// all we need (matches the exact request body captured in the HAR).
const RPC_LIST_NOTEBOOKS_PAYLOAD = [null, 1, null, [2, null, null, [1, null, null, null, null, null, null, null, null, null, [1]]], null, [[null, null, []], [[]], [null, []]]];

interface SessionTokens {
    at: string | null;
    bl: string | null;
    fsid: string | null;
}

interface ChromeCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expirationDate?: number;
}

// Minimal subset of the global fetch() Response shape — satisfied by both
// the real fetch() Response and by a transport's result wrapper.
export interface FetchLikeResponse {
    status: number;
    ok: boolean;
    url: string;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
}

// Lets the caller swap the actual network transport. When set, requests are
// routed through it instead of replaying cookies over Node's own fetch,
// which Google's session-binding checks can flag and bounce to a
// re-verification page even with cookies that are seconds old.
export type RawFetchFn = (url: string, init: RequestInit) => Promise<FetchLikeResponse>;

// Thrown by prepareNotebook()/_prepareNotebookInner() when the same source
// URL is found in MORE THAN ONE notebook and the caller hasn't told us which
// one to use yet (no notebookIdOverride). The MCP tool layer (server.ts)
// catches this and returns a response telling the calling model to STOP,
// present `candidates` to the human user, wait for their answer, then re-call
// the tool with notebook_id set to the chosen notebookId. Never resolved
// automatically — silently picking one is exactly the "gets confused"
// behavior this exists to avoid.
export class NotebookDisambiguationNeeded extends Error {
    constructor(
        public readonly url: string,
        public readonly candidates: Array<{ notebookId: string; sourceId: string; title: string }>
    ) {
        super(`Multiple notebooks already contain this source (${url}) — ask the user which one to use.`);
        this.name = 'NotebookDisambiguationNeeded';
    }
}

export class NativeFetchClient {
    private cookies: ChromeCookie[] = [];
    private sessionTokens: SessionTokens = { at: null, bl: null, fsid: null };
    private userAgent: string = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    private transport?: RawFetchFn;
    // Separate from `transport`: RPC calls are script-initiated page.evaluate()
    // fetches (fine for same-origin/CORS-permitted JSON), but a cross-origin
    // image load needs a real navigation to avoid the page's `connect-src` CSP
    // — see PlaywrightTransport.fetchBinary's doc comment for why.
    private downloadBinary?: (url: string, headers?: Record<string, string>) => Promise<FetchLikeResponse>;
    private userKey: string;
    // In-flight prepareNotebook promises, keyed by the input URL. Collapses
    // concurrent requests for the SAME video/notebook onto one shared result so
    // asking for a summary AND an infographic at once can't create two notebooks.
    private notebookLocks = new Map<string, Promise<{ notebookId: string, sourceId: string, wasCached: boolean }>>();

    constructor(cookies: ChromeCookie[], userAgent?: string, transport?: RawFetchFn, userKey?: string, downloadBinary?: (url: string, headers?: Record<string, string>) => Promise<FetchLikeResponse>) {
        this.cookies = cookies;
        this.transport = transport;
        this.downloadBinary = downloadBinary;
        this.userKey = userKey || '__legacy__';
        if (transport) {
            logToFile(`[NativeFetch] 🎭 Using injected transport (avoids cookie-replay rejection)`);
        }
        if (userAgent) {
            this.userAgent = userAgent;
            logToFile(`[NativeFetch] Using captured User-Agent: ${userAgent}`);
        }

        // Debug: Check for critical cookies
        const names = cookies.map(c => c.name);
        const critical = ['SID', 'HSID', 'SSID', 'OSID', '__Secure-3PSID'];
        const missing = critical.filter(c => !names.includes(c));

        if (missing.length > 0) {
            logToFile(`[NativeFetch] ℹ️ Note: Missing traditional cookies: ${missing.join(', ')}. This might be fine if __Secure-3PSID is present.`);
        } else {
            logToFile(`[NativeFetch] ✅ All critical cookies found.`);
        }

        logToFile(`[NativeFetch] Initialized with ${cookies.length} cookies`);
    }

    /**
     * Per-user notebook cache path. Each user gets their own cache.json so
     * a video URL cached by one Google account can never be reused to route
     * another user's cookies into that account's private notebook.
     */
    private getCacheFile(): string {
        const dir = path.resolve(__dirname, "../user_data/notebook_cache");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        return path.join(dir, `${this.userKey}.json`);
    }

    /**
     * Format cookies for fetch headers (Filtered by URL and Deduplicated)
     */
    private getCookieHeader(targetUrl: string): string {
        const urlObj = new URL(targetUrl);
        const host = urlObj.hostname;
        const pathname = urlObj.pathname;

        const validCookies: ChromeCookie[] = [];

        for (const cookie of this.cookies) {
            // Domain Matching
            let domainMatch = false;
            const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;

            if (cookie.domain.startsWith('.')) {
                // e.g. .google.com matches notebooklm.google.com
                if (host.endsWith(cookieDomain) || host === cookieDomain) {
                    domainMatch = true;
                }
            } else {
                // Exact match required for non-dot domains
                if (host === cookieDomain) {
                    domainMatch = true;
                }
            }
            if (!domainMatch) continue;

            // Path Matching
            if (!pathname.startsWith(cookie.path)) continue;

            validCookies.push(cookie);
        }

        // Deduplicate: Sort by specificity (Longest Path > Longest Domain)
        // This ensures if multiple cookies match (e.g. one for / and one for /app), we pick the most specific one if names collide
        const sortedCookies = validCookies.sort((a, b) => {
            if (b.path.length !== a.path.length) return b.path.length - a.path.length;
            return b.domain.length - a.domain.length;
        });

        const uniqueCookies = new Map<string, ChromeCookie>();
        for (const cookie of sortedCookies) {
            if (!uniqueCookies.has(cookie.name)) {
                uniqueCookies.set(cookie.name, cookie);
            }
        }

        const names = Array.from(uniqueCookies.keys());
        if (names.length > 0) {
            logToFile(`[NativeFetch] 🍪 Sending cookies to ${host}: ${names.join(', ')}`);
        } else {
            logToFile(`[NativeFetch] ⚠️ No cookies found for ${host}!`);
        }

        return Array.from(uniqueCookies.values()).map(c => `${c.name}=${c.value}`).join('; ');
    }

    /**
     * Standard fetch with cookies
     */
    private async fetchWithCookies(url: string, options: RequestInit = {}): Promise<FetchLikeResponse> {
        if (this.transport) {
            // The transport runs inside a real, already-authenticated
            // browser page: cookies are attached natively and redirects are
            // followed natively, so none of the manual cookie/redirect
            // handling below is needed (or even possible — Cookie/Referer
            // are forbidden headers from page-context fetch()).
            return this.transport(url, options);
        }

        let currentUrl = url;
        let redirectCount = 0;
        const maxRedirects = 5;

        while (true) {
            const headers = new Headers(options.headers || {});

            // 1. Set Cookies for the CURRENT URL
            // This is crucial: If we redirect to accounts.google.com, we must send accounts cookies!
            headers.set('Cookie', this.getCookieHeader(currentUrl));

            // 2. Set Standard Headers
            headers.set('User-Agent', this.userAgent);
            headers.set('Accept-Language', 'en-US,en;q=0.9');

            // 3. Handle Referer
            if (headers.has('Referer') && headers.get('Referer') === '') {
                headers.delete('Referer');
            } else if (!headers.has('Referer')) {
                // For initial request, default to notebooklm. 
                // For redirects, we ideally set it to the previous URL, but strict auth might prefer clean slate or specific referer.
                // Let's stick to default for now.
                headers.set('Referer', 'https://notebooklm.google.com/');
            }

            // 4. Client Hints
            const uaVersion = this.userAgent.match(/Chrome\/(\d+)/)?.[1] || "121";
            headers.set('sec-ch-ua', `"Not A(Brand";v="99", "Google Chrome";v="${uaVersion}", "Chromium";v="${uaVersion}"`);
            headers.set('sec-ch-ua-mobile', '?0');
            headers.set('sec-ch-ua-platform', '"macOS"');

            // 5. Context-aware headers
            const isRpc = currentUrl.includes('batchexecute') || currentUrl.includes('GenerateFreeFormStreamed');
            if (options.method === 'POST' || isRpc) {
                headers.set('Origin', 'https://notebooklm.google.com');
                headers.set('Sec-Fetch-Dest', 'empty');
                headers.set('Sec-Fetch-Mode', 'cors');
                headers.set('Sec-Fetch-Site', 'same-origin');
                if (!headers.has('Accept')) headers.set('Accept', '*/*');
            } else {
                headers.set('Sec-Fetch-Dest', 'document');
                headers.set('Sec-Fetch-Mode', 'navigate');
                headers.set('Sec-Fetch-Site', 'none');
                headers.set('Sec-Fetch-User', '?1');
                headers.set('Upgrade-Insecure-Requests', '1');
                if (!headers.has('Accept')) headers.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7');
            }

            // 6. Execute Fetch
            const response = await fetch(currentUrl, {
                ...options,
                headers,
                redirect: 'manual' // DISABLE auto-redirect
            });

            // 7. Handle Redirects Manually
            if (response.status >= 300 && response.status < 400 && redirectCount < maxRedirects) {
                const location = response.headers.get('Location');
                if (!location) return response; // No location, return as is (browser handles this error)

                const nextUrl = new URL(location, currentUrl).toString();
                logToFile(`[NativeFetch] ↪️ Following redirect to: ${nextUrl}`);

                currentUrl = nextUrl;
                redirectCount++;
                // Loop continues -> `getCookieHeader(nextUrl)` will be called next iteration
                continue;
            }

            return response;
        }
    }

    async start(): Promise<void> {
        await this._refreshTokens();
    }

    async stop(): Promise<void> {
        // No-op for native client
    }

    async ensureBrowserReady(): Promise<void> {
        // Check if tokens are still valid, refresh if needed
        if (!this.sessionTokens.at) {
            await this._refreshTokens();
        }
    }

    async _refreshTokens(): Promise<boolean> {
        logToFile("[NativeFetch] 🔄 Fetching tokens...");

        // Initial Fetch should mimic a clean navigation (No Referer)
        const response = await this.fetchWithCookies(BASE_URL, {
            headers: { 'Referer': '' }
        });
        const html = await response.text();

        // Check for login redirect
        if (response.url.includes("accounts.google.com")) {
            logToFile(`[NativeFetch] ⚠️ Redirected to Login: ${response.url}`);
            throw new Error("Authentication required. Please ensure you're logged into Google in the browser where the extension is installed.");
        }

        const atMatch = html.match(/"SNlM0e":"([^"]+)"/);
        const blMatch = html.match(/"(boq_labs-tailwind-[^"]+)"/);
        const fsidMatch = html.match(/"FdrFJe":"([^"]+)"/);

        if (!atMatch || !blMatch) {
            throw new Error("Could not find session tokens. Are you logged in?");
        }

        this.sessionTokens = {
            at: atMatch[1],
            bl: blMatch[1],
            fsid: fsidMatch?.[1] || null
        };

        logToFile(`[NativeFetch] ✅ Tokens acquired. bl: ${this.sessionTokens.bl}`);
        return true;
    }

    _parseNotebookUrl(url: string): string | null {
        const match = url.match(/notebook\/([0-9a-fA-F-]{36})/);
        return match ? match[1] : null;
    }

    async listSources(url: string): Promise<any[]> {
        const notebookId = this._parseNotebookUrl(url) || url;
        logToFile(`[NativeFetch] Listing sources for: ${notebookId}...`);

        const payload = [notebookId, null, [2], null, 0];

        // IMPORTANT: an empty array from this function must mean "confirmed zero
        // sources" and NOTHING ELSE. Callers (see _prepareNotebookInner) use a
        // 0-length result as proof the notebook was deleted in the UI and
        // destructively recreate it. This used to also return [] on ANY
        // exception or unrecognized response shape (e.g. a stale-session/auth
        // hiccup mid cookie-refresh) — silently, with no error surfaced — so a
        // transient failure was indistinguishable from real deletion and
        // triggered the same destructive recreate. Confirmed via logs: a
        // notebook the user never deleted (still visible in the NotebookLM UI,
        // still holding its rendered infographics) got "invalidated and
        // recreated" the moment listSources hit an ambiguous response during a
        // reauth cycle. Now: only a well-formed response with a genuinely empty
        // sources array returns []; anything else throws so the caller can
        // fail SAFE (keep trusting the cache) instead of failing DESTRUCTIVE
        // (assume deletion and spin up a new notebook).
        const response = await this._executeRpc(RPC_LOAD_NOTEBOOK, payload);

        if (response && response[0] && response[0][1] === RPC_LOAD_NOTEBOOK && typeof response[0][2] === 'string') {
            const innerJson = response[0][2];
            const data = JSON.parse(innerJson);
            const sourcesRaw = data[0]?.[1];

            if (Array.isArray(sourcesRaw)) {
                const results = [];
                for (const s of sourcesRaw) {
                    if (!Array.isArray(s)) continue;

                    const sourceId = Array.isArray(s[0]) ? s[0][0] : s[0];
                    const title = s[1];
                    let type = "unknown";
                    let originalUrl = null;

                    const meta = s[2];
                    if (meta && Array.isArray(meta)) {
                        const externalData = meta[5];
                        if (Array.isArray(externalData)) {
                            originalUrl = externalData[0];
                        }
                    }

                    if (originalUrl && typeof originalUrl === 'string') {
                        if (originalUrl.includes("youtube.com") || originalUrl.includes("youtu.be")) type = "youtube";
                        else if (originalUrl.startsWith("http")) type = "web";
                    }

                    if (!originalUrl && sourceId) type = "file_or_pasted";
                    results.push({ sourceId, title, type, originalUrl });
                }

                logToFile(`[NativeFetch] Found ${results.length} sources.`);
                return results;
            }
        }

        // Response didn't match the expected shape at all — NOT the same as a
        // confirmed empty notebook. Log the actual payload (previously silently
        // discarded) so this is diagnosable, and throw rather than returning [].
        logToFile(`[NativeFetch] ⚠️ Unrecognized LOAD_NOTEBOOK response shape for ${notebookId}: ${JSON.stringify(response).substring(0, 500)}`);
        throw new Error(`Could not verify sources for notebook ${notebookId}: unrecognized response shape.`);
    }

    /**
     * Lists every notebook in the account, each with its own sources — ground
     * truth from NotebookLM's backend, not our local notebook_cache. Response
     * shape (per entry): [title, [[sourceId], sourceTitle, meta, ...][], notebookId, emoji, ...].
     * Source meta[5] holds [originalUrl, videoId, channelName] for YouTube
     * sources — same extraction as listSources().
     */
    async listAllNotebooks(): Promise<Array<{ notebookId: string; title: string; emoji: string | null; sources: Array<{ sourceId: string; title: string; originalUrl: string | null }> }>> {
        const response = await this._executeRpc(RPC_LIST_NOTEBOOKS, RPC_LIST_NOTEBOOKS_PAYLOAD);

        if (!response || !response[0] || response[0][1] !== RPC_LIST_NOTEBOOKS || typeof response[0][2] !== 'string') {
            logToFile(`[NativeFetch] ⚠️ Unrecognized LIST_NOTEBOOKS response shape: ${JSON.stringify(response).substring(0, 500)}`);
            throw new Error("Could not list notebooks: unrecognized response shape.");
        }

        const data = JSON.parse(response[0][2]);
        const entries = data?.[0];
        if (!Array.isArray(entries)) return [];

        const notebooks: Array<{ notebookId: string; title: string; emoji: string | null; sources: Array<{ sourceId: string; title: string; originalUrl: string | null }> }> = [];
        for (const entry of entries) {
            if (!Array.isArray(entry) || typeof entry[2] !== 'string') continue;
            const title = entry[0];
            const sourcesRaw = entry[1];
            const notebookId = entry[2];
            const emoji = typeof entry[3] === 'string' ? entry[3] : null;

            const sources: Array<{ sourceId: string; title: string; originalUrl: string | null }> = [];
            if (Array.isArray(sourcesRaw)) {
                for (const s of sourcesRaw) {
                    if (!Array.isArray(s)) continue;
                    const sourceId = Array.isArray(s[0]) ? s[0][0] : s[0];
                    const sourceTitle = s[1];
                    let originalUrl: string | null = null;
                    const meta = s[2];
                    if (Array.isArray(meta) && Array.isArray(meta[5])) {
                        originalUrl = meta[5][0] ?? null;
                    }
                    sources.push({ sourceId, title: sourceTitle, originalUrl });
                }
            }

            notebooks.push({ notebookId, title, emoji, sources });
        }

        logToFile(`[NativeFetch] Listed ${notebooks.length} notebooks in account.`);
        return notebooks;
    }

    /** Finds the notebook that actually holds a given source URL, searching the
     *  real account-wide notebook list rather than our local cache. Used to
     *  self-heal the cache when it points at a dead/wrong notebook, instead of
     *  either blindly trusting a stale entry or blindly recreating (which
     *  produces a duplicate when the real notebook is still there, just under
     *  an ID our cache lost track of). */
    async findNotebookForUrl(url: string): Promise<{ notebookId: string; sourceId: string } | null> {
        const notebooks = await this.listAllNotebooks();
        for (const nb of notebooks) {
            const match = nb.sources.find(s => s.originalUrl === url);
            if (match) return { notebookId: nb.notebookId, sourceId: match.sourceId };
        }
        return null;
    }

    /** Like findNotebookForUrl, but returns EVERY notebook holding this
     *  source instead of just the first. This is what detects the "same
     *  source lives in two notebooks" scenario so a caller can ask the user
     *  which one to use instead of silently picking one. */
    async findAllNotebooksForUrl(url: string): Promise<Array<{ notebookId: string; sourceId: string; title: string }>> {
        const notebooks = await this.listAllNotebooks();
        const matches: Array<{ notebookId: string; sourceId: string; title: string }> = [];
        for (const nb of notebooks) {
            const match = nb.sources.find(s => s.originalUrl === url);
            if (match) matches.push({ notebookId: nb.notebookId, sourceId: match.sourceId, title: nb.title });
        }
        return matches;
    }

    // Rate-limits reconcileCache() below — this hits the account-wide
    // LIST_NOTEBOOKS RPC plus one LIST_ARTIFACTS per duplicate group, so it
    // should run periodically (piggybacking opportunistically on whatever
    // tool call happens to come in), not on every single request.
    private static readonly RECONCILE_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

    /**
     * Proactively reconciles the local notebook_cache against the account's
     * real notebook list, self-rate-limited to once per RECONCILE_INTERVAL_MS
     * (tracked via a `__meta.lastReconciledAt` timestamp stored in the cache
     * file itself). Call this opportunistically wherever a live, authenticated
     * client is already in hand (see getClient() in server.ts) — it no-ops
     * instantly if called again before the interval elapses.
     *
     * For any source URL that maps to MORE THAN ONE notebook (the duplicate
     * scenario), prefers whichever duplicate already has a rendered
     * infographic — so a later generate_infographic call reuses that work
     * instead of the notebook_cache pointing at an arbitrary duplicate that
     * has nothing on it yet (which is what happened before: the cache landed
     * on an empty duplicate while a sibling notebook already had the image).
     * Never deletes anything — purely rewrites which notebookId we point at.
     */
    async reconcileCache(): Promise<void> {
        const cacheFile = this.getCacheFile();
        let cache: any = {};
        if (fs.existsSync(cacheFile)) {
            try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')); } catch { /* corrupt — proceed with {} */ }
        }

        const meta = cache.__meta || {};
        if (meta.lastReconciledAt && (Date.now() - meta.lastReconciledAt) < NativeFetchClient.RECONCILE_INTERVAL_MS) {
            return; // reconciled recently enough — no-op
        }

        try {
            logToFile(`[NativeFetch] 🔄 Reconciling notebook cache against account ground truth...`);
            const notebooks = await this.listAllNotebooks();

            const byUrl = new Map<string, Array<{ notebookId: string; sourceId: string; title: string }>>();
            for (const nb of notebooks) {
                for (const s of nb.sources) {
                    if (!s.originalUrl) continue;
                    if (!byUrl.has(s.originalUrl)) byUrl.set(s.originalUrl, []);
                    byUrl.get(s.originalUrl)!.push({ notebookId: nb.notebookId, sourceId: s.sourceId, title: nb.title });
                }
            }

            let changed = 0;
            for (const [url, candidates] of byUrl) {
                let best = candidates[0];
                // `duplicates` is surfaced to _prepareNotebookInner, which throws
                // NotebookDisambiguationNeeded when it's present so the MCP tool
                // layer can ask the user which one to use instead of silently
                // trusting `best`. `best` is still computed and cached as a
                // sane default for any path that doesn't do that disambiguation
                // (e.g. a legacy cache entry read before this reconcile ran).
                const duplicates = candidates.length > 1 ? candidates : undefined;
                if (duplicates) {
                    // Prefer whichever duplicate already has a rendered
                    // infographic as the default, in case disambiguation is
                    // skipped somewhere.
                    for (const c of candidates) {
                        try {
                            const state = await this._listInfographicState(c.notebookId);
                            if (state.imageUrl) { best = c; break; }
                        } catch { /* couldn't check this candidate — try the next */ }
                    }
                }
                const existing = cache[url];
                const notebookChanged = !existing || existing.notebookId !== best.notebookId;
                const duplicatesChanged = JSON.stringify(existing?.duplicates) !== JSON.stringify(duplicates);
                if (notebookChanged || duplicatesChanged) {
                    cache[url] = {
                        notebookId: best.notebookId,
                        sourceId: best.sourceId,
                        ...(duplicates ? { duplicates } : {}),
                    };
                    changed++;
                }
            }

            cache.__meta = { lastReconciledAt: Date.now() };
            fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
            logToFile(`[NativeFetch] ✅ Cache reconciled: ${byUrl.size} unique source(s) checked, ${changed} entr${changed === 1 ? 'y' : 'ies'} updated.`);
        } catch (e: any) {
            // Non-fatal — reconciliation is opportunistic maintenance, never
            // something a tool call should fail over.
            logToFile(`[NativeFetch] ⚠️ Cache reconciliation failed (non-fatal): ${e.message}`);
        }
    }

    async _fetchSourceId(notebookId: string): Promise<string> {
        const sources = await this.listSources(notebookId);
        if (sources.length > 0) {
            logToFile(`[NativeFetch] ✅ Using first source: ${sources[0].sourceId}`);
            return sources[0].sourceId;
        }
        throw new Error("No sources found in this notebook.");
    }

    async _executeRpc(rpcId: string, payload: any): Promise<any> {
        if (!this.sessionTokens.at) {
            await this._refreshTokens();
        }

        const reqId = Math.floor(Math.random() * 100000) + 100000;
        const innerPayload = JSON.stringify(payload);
        const envelope = JSON.stringify([[[rpcId, innerPayload, null, "generic"]]]);

        const params = new URLSearchParams({
            "rpcids": rpcId,
            "source-path": "/",
            "bl": this.sessionTokens.bl || "",
            "f.sid": this.sessionTokens.fsid || "",
            "hl": "en",
            "rt": "c",
            "_reqid": reqId.toString()
        });

        const body = new URLSearchParams();
        body.append("f.req", envelope);
        body.append("at", this.sessionTokens.at || "");

        const url = `${RPC_ENDPOINT}?${params.toString()}`;

        const response = await this.fetchWithCookies(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-Same-Domain": "1"
            },
            body: body.toString()
        });

        if (!response.ok) throw new Error(`RPC Failed: ${response.status}`);
        const text = await response.text();
        const parsed = this._parseRpcResponse(text);
        if (!parsed) {
            logToFile(`[NativeFetch] ⚠️ RPC Response parsing failed. Raw text (first 500 chars): ${text.substring(0, 500)}`);
        }
        return parsed;
    }

    _parseRpcResponse(text: string): any {
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('[[')) {
                try {
                    const data = JSON.parse(trimmed);
                    if (data && data[0] && data[0][0] === 'wrb.fr') {
                        return data;
                    }
                } catch (e) { }
            }
        }
        return null;
    }

    async _executeStreamedRpc(fReqPayload: any): Promise<Buffer> {
        const reqId = Math.floor(Math.random() * 100000) + 100000;
        const fReqStr = JSON.stringify(fReqPayload);

        const params = new URLSearchParams({
            "bl": this.sessionTokens.bl || "",
            "f.sid": this.sessionTokens.fsid || "",
            "hl": "en",
            "_reqid": reqId.toString(),
            "rt": "c"
        });

        const url = `${RPC_GENERATE_STREAMED}?${params.toString()}`;

        const body = new URLSearchParams();
        body.append("f.req", fReqStr);
        body.append("at", this.sessionTokens.at || "");

        const response = await this.fetchWithCookies(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                "X-Same-Domain": "1"
            },
            body: body.toString()
        });

        if (!response.ok) {
            throw new Error(`Streamed RPC Failed: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    _parseStreamedResponse(entryBuffer: Buffer): string {
        let fullText = "";
        let textBody = entryBuffer.toString('utf-8');

        if (textBody.startsWith(")]}'")) {
            textBody = textBody.substring(4).trim();
        }

        let pos = 0;
        const len = textBody.length;

        while (pos < len) {
            const startBracket = textBody.indexOf('[', pos);
            if (startBracket === -1) break;

            const endBracket = this._findBalancedEnd(textBody, startBracket);
            if (endBracket === -1) {
                pos = startBracket + 1;
                continue;
            }

            const jsonStr = textBody.substring(startBracket, endBracket + 1);
            try {
                const obj = JSON.parse(jsonStr);
                const extracted = this._extractWrbText(obj);
                if (extracted) {
                    fullText = extracted.trim() + "\n";
                }
            } catch (e) { }

            pos = endBracket + 1;
        }

        return fullText.trim();
    }

    _findBalancedEnd(str: string, start: number): number {
        let depth = 0;
        let inString = false;
        let escape = false;

        for (let i = start; i < str.length; i++) {
            const char = str[i];

            if (escape) { escape = false; continue; }
            if (char === '\\') { escape = true; continue; }
            if (char === '"') { inString = !inString; continue; }

            if (!inString) {
                // Only track [] depth — not {} — to find the matching ]
                if (char === '[') depth++;
                else if (char === ']') {
                    depth--;
                    if (depth === 0) return i;
                }
            }
        }
        return -1;
    }

    _extractWrbText(node: any): string {
        const results: string[] = [];

        const walk = (n: any, inPayload: boolean = false) => {
            if (Array.isArray(n)) {
                if (n.length >= 3 && n[0] === "wrb.fr" && typeof n[2] === 'string') {
                    try {
                        const innerJson = n[2];
                        if (innerJson.trim().startsWith("[")) {
                            const decoded = JSON.parse(innerJson);
                            if (Array.isArray(decoded) && decoded.length > 2) {
                                walk(decoded[0], true);
                            }
                        }
                    } catch (e) { }
                } else if (inPayload) {
                    if (n.length >= 2 && typeof n[0] === 'number' && typeof n[1] === 'number') return;
                    if (n.length >= 3 && n[0] === null && typeof n[1] === 'number' && typeof n[2] === 'number') return;
                    n.forEach(c => walk(c, inPayload));
                } else {
                    n.forEach(c => walk(c, inPayload));
                }
            } else if (typeof n === 'string' && inPayload) {
                const val = n.trim();
                // Filter out UUIDs properly using regex instead of fragile length check
                const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                if (val && !uuidPattern.test(val)) {
                    results.push(val);
                }
            }
        };

        walk(node);
        return results.join("\n");
    }

    // Cheap sniff: is this buffer actually image bytes (and not, say, an HTML
    // sign-in page returned with status 200)? Guards against silently storing
    // a redirect/login page as if it were the infographic.
    private looksLikeImage(buf: Buffer, contentType: string | null): boolean {
        if (buf.length < 4) return false;
        const hex = buf.subarray(0, 4).toString('hex');
        if (hex.startsWith('ffd8ff') || hex.startsWith('89504e47')) return true; // JPEG / PNG
        if (hex.startsWith('52494646') || hex.startsWith('47494638')) return true; // WEBP(RIFF) / GIF
        if (contentType && contentType.toLowerCase().startsWith('image/')) return true;
        return false;
    }

    async downloadResource(url: string): Promise<Buffer> {
        logToFile(`[NativeFetch] Downloading resource: ${url.substring(0, 50)}...`);

        // The infographic image lives on Google's user-content CDN
        // (lh3.googleusercontent.com), reached via a redirect chain through
        // lh3.google.com. Stays COOKIELESS on purpose (session-cookie replay
        // was the ORIGINAL bug here) but that alone isn't enough:
        //
        // 1. Plain server-side fetch (no Playwright): verified empirically —
        //    EVERY download (66/66 across a full session, fresh tokens each
        //    time, with AND without cookies attached) bounced identically to
        //    accounts.google.com/ServiceLogin at the lh3.google.com hop.
        //    Cookies made no difference; every other RPC call in this client
        //    already routes through the Playwright page for exactly this
        //    reason (a scripted client's TLS/HTTP2 fingerprint gets flagged).
        // 2. `this.transport` (page.evaluate(fetch(...))): still failed, but
        //    differently — "Failed to fetch" at the JS layer, before any HTTP
        //    response. That's the signature of a CSP `connect-src` block: the
        //    page allows loading cross-origin IMAGES (`img-src`, permissive)
        //    but not script-initiated fetches to that same origin
        //    (`connect-src`, restrictive) — different CSP directives.
        // `downloadBinary` (PlaywrightTransport.fetchBinary) sidesteps both:
        // it NAVIGATES a throwaway page to the URL exactly like opening the
        // image in a new tab would, so it's real-browser AND CSP-exempt.
        const headers: Record<string, string> = {
            "Referer": "https://notebooklm.google.com/",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        };

        const response = this.downloadBinary
            ? await this.downloadBinary(url, headers)
            : this.transport
                ? await this.transport(url, { headers: new Headers(headers) })
                : await fetch(url, {
                    headers: new Headers({
                        ...headers,
                        "User-Agent": this.userAgent,
                        "Accept-Language": "en-US,en;q=0.9",
                        "Sec-Fetch-Dest": "image",
                        "Sec-Fetch-Mode": "no-cors",
                        "Sec-Fetch-Site": "cross-site",
                    }),
                    redirect: 'follow',
                });

        if (!response.ok) {
            throw new Error(`Failed to download resource: HTTP ${response.status} (final URL: ${response.url.substring(0, 120)})`);
        }

        const contentType = response.headers.get('content-type');
        const buf = Buffer.from(await response.arrayBuffer());

        // If Google still bounced us to a login/HTML page (e.g. the signed URL
        // expired), we'd get a 200 with HTML — reject it so the caller retries /
        // marks the job failed rather than persisting a sign-in page as the image.
        if (!this.looksLikeImage(buf, contentType)) {
            const head = buf.subarray(0, 80).toString('utf-8').replace(/\s+/g, ' ');
            throw new Error(`Downloaded resource is not an image (content-type: ${contentType}, ${buf.length} bytes, final URL: ${response.url.substring(0, 120)}, head: "${head}")`);
        }

        logToFile(`[NativeFetch] ✅ Downloaded image: ${buf.length} bytes, content-type: ${contentType}`);
        return buf;
    }

    _findImageUrl(obj: any): string | null {
        if (typeof obj === 'string') {
            if (obj.includes('googleusercontent.com') || obj.startsWith('data:image/')) return obj;
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = this._findImageUrl(item);
                if (found) return found;
            }
        } else if (obj !== null && typeof obj === 'object') {
            for (const val of Object.values(obj)) {
                const found = this._findImageUrl(val);
                if (found) return found;
            }
        }
        return null;
    }

    _findSourceId(obj: any): string | null {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (typeof obj === 'string') {
            if (uuidRegex.test(obj)) return obj;
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const found = this._findSourceId(item);
                if (found) return found;
            }
        }
        return null;
    }

    async prepareNotebook(url: string, notebookIdOverride?: string): Promise<{ notebookId: string, sourceId: string, wasCached: boolean }> {
        // When the caller already knows exactly which notebook to use (the user
        // answered a "multiple notebooks found" prompt from a previous call),
        // skip the in-flight coalescing lock entirely — there's nothing left to
        // coalesce, and the override is keyed by notebookId rather than url, so
        // sharing the url-keyed lock here would serialize it against unrelated
        // concurrent calls for no reason.
        if (notebookIdOverride) {
            return this._prepareNotebookInner(url, notebookIdOverride);
        }

        // Coalesce concurrent calls for the same URL. Without this, a summary and
        // an infographic requested together both hit a cold cache, both run
        // CREATE_NOTEBOOK, and NotebookLM ends up with two notebooks holding the
        // same source (the "two notebooks / gets confused" bug). The first caller
        // does the real work; everyone else awaits its result. Once it settles,
        // the cache file is already written, so any later call is a plain cache hit.
        const inFlight = this.notebookLocks.get(url);
        if (inFlight) {
            logToFile(`[NativeFetch] ⏳ prepareNotebook already in-flight for ${url} — awaiting shared result (no duplicate notebook).`);
            return inFlight;
        }
        const work = this._prepareNotebookInner(url);
        this.notebookLocks.set(url, work);
        try {
            return await work;
        } finally {
            this.notebookLocks.delete(url);
        }
    }

    private async _prepareNotebookInner(url: string, notebookIdOverride?: string): Promise<{ notebookId: string, sourceId: string, wasCached: boolean }> {
        if (!this.sessionTokens.at) await this._refreshTokens();

        const cacheFile = this.getCacheFile();
        let cache: any = {};
        if (fs.existsSync(cacheFile)) {
            try {
                cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            } catch (e) { }
        }

        // The user was already asked which of several duplicate notebooks to
        // use and answered — pin to that notebook directly instead of
        // re-running cache/duplicate-detection logic (which would just ask again).
        if (notebookIdOverride) {
            logToFile(`[NativeFetch] 📌 Using user-selected notebook override ${notebookIdOverride} for ${url}`);
            const sources = await this.listSources(notebookIdOverride);
            const matched = sources.find((s: any) => s.originalUrl === url);
            const sourceId = matched?.sourceId || sources[0]?.sourceId;
            if (!sourceId) throw new Error(`Selected notebook ${notebookIdOverride} has no sources to use.`);
            cache[url] = { notebookId: notebookIdOverride, sourceId };
            fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
            return { notebookId: notebookIdOverride, sourceId, wasCached: false };
        }

        let notebookId: string | null = null;
        let sourceId: string | null = null;
        let wasCached = false;

        // Check if input is a direct Notebook URL
        const parsedNotebookId = this._parseNotebookUrl(url);
        if (parsedNotebookId) {
            notebookId = parsedNotebookId;
            logToFile(`[NativeFetch] Direct Notebook URL detected: ${notebookId}`);

            if (cache[url]) {
                const entry = cache[url];
                sourceId = (typeof entry === 'object' && (entry.sourceId || entry.source_id)) || null;
            }

            if (!sourceId) {
                // If direct URL but not cached, we might want to check invalid cache too?
                // But for now, just fetch source ID
                delete cache[url]; // Clear stale entry if format is wrong
                logToFile("[NativeFetch] Source ID unknown. Fetching via RPC...");
                try {
                    sourceId = await this._fetchSourceId(notebookId);
                    cache[url] = { notebookId, sourceId };
                    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
                    wasCached = false; // We fetched it fresh
                } catch (e) {
                    logToFile(`[NativeFetch] ❌ Failed to fetch source: ${e}`);
                    throw e;
                }
            } else {
                logToFile(`[NativeFetch] ⚡ Using Cached Source ID: ${sourceId}`);
                wasCached = true; // Cached source ID counts
            }

            return { notebookId, sourceId, wasCached };
        }

        // YouTube URL logic
        if (cache[url]) {
            const entry = cache[url];
            if (typeof entry === 'object') {
                notebookId = entry.notebookId || entry.notebook_id;
                sourceId = entry.sourceId || entry.source_id;
            } else {
                // Legacy format (just notebook id string)
                notebookId = entry;
                // Leave sourceId null to trigger fetch/add?
            }

            if (notebookId) {
                // A cache hit only helps if the notebook STILL EXISTS. Users can
                // delete a notebook in the NotebookLM UI, which leaves our local
                // cache pointing at a dead ID. A deleted notebook silently accepts
                // trigger RPCs (e.g. generate infographic) but never produces
                // artifacts — so without this check the caller would poll for the
                // full 5-minute timeout before self-healing. Validate up front by
                // loading the notebook's sources: a CONFIRMED-empty result means
                // deleted (or emptied), so invalidate the entry and recreate.
                //
                // listSources() now THROWS instead of returning [] for anything
                // ambiguous (a network hiccup, a stale-session response mid
                // cookie-refresh, an unrecognized shape) — specifically so this
                // check can tell "definitely gone" apart from "couldn't check
                // right now". Confirmed via logs: without this distinction, a
                // notebook the user never deleted (still visible in the
                // NotebookLM UI, still holding its rendered infographics) got
                // wiped from cache and recreated from scratch — costing another
                // CREATE_NOTEBOOK + ADD_SOURCE and abandoning a notebook that
                // already had a working infographic on it. On ambiguity, keep
                // trusting the cache — a stale reference that's actually fine is
                // far cheaper than a false "deleted" that discards real work.
                try {
                    const liveSources = await this.listSources(notebookId);
                    if (liveSources.length === 0) {
                        logToFile(`[NativeFetch] ⚠️ Cached notebook ${notebookId} confirmed empty (0 sources, well-formed response) — likely deleted in the UI. Invalidating cache for ${url} and recreating.`);
                        delete cache[url];
                        try { fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2)); } catch (e) { /* best-effort */ }
                        notebookId = null;
                        sourceId = null;
                        wasCached = false;
                    } else {
                        logToFile(`[NativeFetch] ⚡ Cache Hit! Reusing notebook: ${notebookId} (${liveSources.length} source(s) verified)`);
                        wasCached = true;
                        // Heal a stale/missing sourceId from the live notebook.
                        if (!sourceId) sourceId = liveSources[0].sourceId;
                    }
                } catch (e: any) {
                    // Ambiguous: listSources() itself failed, so we can't tell if
                    // this notebook is fine or gone. Rather than guessing, check
                    // the account's real notebook list (ground truth, via
                    // listAllNotebooks/findNotebookForUrl) for the notebook that
                    // actually holds this URL right now — reconciling to it if
                    // the cache is wrong, instead of either blindly trusting a
                    // possibly-dead entry or blindly recreating a possibly-fine one.
                    try {
                        const found = await this.findNotebookForUrl(url);
                        if (found && found.notebookId !== notebookId) {
                            logToFile(`[NativeFetch] 🔧 Cache pointed at ${notebookId} for ${url}, but the account's real notebook list has it under ${found.notebookId} — reconciling cache instead of recreating.`);
                            notebookId = found.notebookId;
                            sourceId = found.sourceId;
                            cache[url] = { notebookId, sourceId };
                            try { fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2)); } catch { /* best-effort */ }
                        } else if (found) {
                            logToFile(`[NativeFetch] ✅ Reconciled: ${notebookId} for ${url} confirmed present in the account's real notebook list.`);
                        } else {
                            logToFile(`[NativeFetch] ⚠️ Could not verify cached notebook ${notebookId} (${e.message}), and ${url} wasn't found in the account's real notebook list either — trusting cache anyway rather than assuming deletion.`);
                        }
                    } catch (e2: any) {
                        logToFile(`[NativeFetch] ⚠️ Could not verify cached notebook ${notebookId} (${e.message}); notebook-list reconciliation also failed (${e2.message}) — trusting cache rather than assuming deletion.`);
                    }
                    wasCached = true;
                }
            }

            // A background reconcileCache() pass already found this same source
            // living in more than one notebook (see the `duplicates` field it
            // writes). Rather than silently trusting whichever one the cache
            // happens to point at, surface it so the tool layer can ask the
            // user which one they actually want.
            if (notebookId && sourceId) {
                const dupes = cache[url]?.duplicates;
                if (Array.isArray(dupes) && dupes.length > 1) {
                    logToFile(`[NativeFetch] ⚠️ Cache flagged ${dupes.length} duplicate notebooks for ${url} (from background reconciliation) — disambiguation needed.`);
                    throw new NotebookDisambiguationNeeded(url, dupes);
                }
            }
        }

        if (!notebookId || !sourceId) { // If missing either (unless legacy cache gave bad data)
            if (!notebookId) {
                // Before creating a brand-new notebook, check whether the
                // account already holds this exact source somewhere — matters
                // on a cold cache (fresh install, a cleared cache file, or a
                // notebook created for this source directly in the NotebookLM
                // UI outside this server) so we adopt what's already there (or
                // ask, if there's more than one) instead of spinning up a
                // genuine duplicate.
                let liveMatches: Array<{ notebookId: string; sourceId: string; title: string }> = [];
                try {
                    liveMatches = await this.findAllNotebooksForUrl(url);
                } catch (e: any) {
                    logToFile(`[NativeFetch] ⚠️ Pre-create duplicate check failed (${e.message}) — proceeding to create.`);
                }

                if (liveMatches.length > 1) {
                    throw new NotebookDisambiguationNeeded(url, liveMatches);
                }

                if (liveMatches.length === 1) {
                    logToFile(`[NativeFetch] ✅ Found existing notebook ${liveMatches[0].notebookId} for ${url} — adopting it instead of creating a duplicate.`);
                    notebookId = liveMatches[0].notebookId;
                    sourceId = liveMatches[0].sourceId;
                    wasCached = true;
                } else {
                    logToFile("[NativeFetch] Creating Notebook...");
                    const createPayload = ["", null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
                    const createRes = await this._executeRpc(RPC_CREATE_NOTEBOOK, createPayload);

                    if (!createRes || !createRes[0]) {
                        throw new Error("Failed to create notebook: empty response from NotebookLM. This is usually transient — please retry.");
                    }

                    // Check for gRPC error codes (same pattern as ADD_SOURCE / pollForArtifacts)
                    const createErrorSlot = createRes[0][5];
                    if (Array.isArray(createErrorSlot) && createErrorSlot[0] === 16) {
                        throw new Error("Authentication required. Please re-sync your cookies using the Chrome extension.");
                    }

                    if (!createRes[0][2]) {
                        logToFile(`[NativeFetch] ❌ CREATE_NOTEBOOK returned no payload: ${JSON.stringify(createRes[0])}`);
                        throw new Error("Failed to create notebook: NotebookLM returned an error with no payload. This is usually transient — please retry in a moment.");
                    }

                    const innerCreate = JSON.parse(createRes[0][2]);
                    notebookId = innerCreate?.[2];
                    if (!notebookId) {
                        logToFile(`[NativeFetch] ❌ CREATE_NOTEBOOK payload had no notebook ID: ${JSON.stringify(innerCreate)}`);
                        throw new Error("Failed to create notebook: response did not include a notebook ID.");
                    }
                    logToFile(`[NativeFetch] Notebook Created: ${notebookId}`);
                    wasCached = false;
                }
            }

            if (!sourceId) {
                logToFile(`[NativeFetch] Adding Source: ${url}...`);
                const sourcePayload = [[[null, null, null, null, null, null, null, [url], null, null, 1]], notebookId, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
                const sourceRes = await this._executeRpc(RPC_ADD_SOURCE, sourcePayload);

                if (!sourceRes || !sourceRes[0]) throw new Error("Invalid Add Source Response");

                // Check for gRPC error codes (same pattern as pollForArtifacts)
                const errorSlot = sourceRes[0][5];
                if (Array.isArray(errorSlot) && errorSlot[0] === 16) {
                    throw new Error("Authentication required. Please re-sync your cookies using the Chrome extension.");
                }

                const rawInner = sourceRes[0][2];
                const innerSource = JSON.parse(rawInner);
                logToFile(`[NativeFetch] ADD_SOURCE raw response: ${JSON.stringify(innerSource).substring(0, 800)}`);
                sourceId = this._findSourceId(innerSource);

                if (!sourceId) {
                    logToFile(`[NativeFetch] ❌ No Source ID in ADD_SOURCE response: ${JSON.stringify(innerSource, null, 2)}`);
                    throw new Error(
                        "This video could not be imported into NotebookLM. " +
                        "The most common reason is that the video has no transcript or captions available. " +
                        "Try a different video that has auto-generated or manual captions."
                    );
                }

                logToFile(`[NativeFetch] Source Added: ${sourceId}`);
                wasCached = false;
            }

            // Write cache (we created, added, or adopted an existing notebook above)
            cache[url] = { notebookId, sourceId };
            fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
        }

        return { notebookId: notebookId!, sourceId: sourceId!, wasCached };
    }

    /**
     * One LIST_ARTIFACTS call, parsed into the two facts callers actually need:
     * whether an infographic ARTIFACT RECORD exists on the notebook yet, and
     * whether its rendered IMAGE URL is present.
     *
     * These are two DISTINCT stages on NotebookLM's side: GENERATE_INFOGRAPHIC
     * creates the artifact record (id + title, type 7) almost immediately — that
     * is what appears in the Studio panel — then renders the image
     * asynchronously and stitches the lh3.googleusercontent.com URL into the
     * record minutes later. Confirmed via logs: a record with title present but
     * NO image URL was polled 30× before the image finally appeared. Callers use
     * `hasArtifact` to avoid re-triggering (idempotency) and to tell "still
     * rendering" (record exists, keep waiting) apart from "never accepted"
     * (no record — quota/unsupported source).
     */
    private async _listInfographicState(notebookId: string): Promise<{ imageUrl: string | null; hasArtifact: boolean }> {
        const payload = [[2], notebookId];
        const response = await this._executeRpc(RPC_LIST_ARTIFACTS, payload);
        if (!response || !response[0]) return { imageUrl: null, hasArtifact: false };

        // gRPC error code 16 = UNAUTHENTICATED.
        const errorSlot = response[0][5];
        if (Array.isArray(errorSlot) && errorSlot[0] === 16) {
            throw new Error("Authentication required. Please re-sync your cookies using the Chrome extension.");
        }
        // Any other gRPC error code = the backend rejected the request outright
        // (e.g. a quota/rate limit) — no artifact will ever show up, so surface
        // the actual code instead of a generic timeout.
        if (Array.isArray(errorSlot) && errorSlot.length > 0) {
            logToFile(`[NativeFetch] ❌ LIST_ARTIFACTS returned error slot: ${JSON.stringify(errorSlot).slice(0, 300)}`);
            throw new Error(`NotebookLM rejected the request (gRPC code ${errorSlot[0]}). This can mean a daily generation limit or quota was hit — check the NotebookLM Studio panel.`);
        }

        if (typeof response[0][2] !== 'string') return { imageUrl: null, hasArtifact: false };
        const innerData = JSON.parse(response[0][2]);
        return {
            imageUrl: this._findImageUrl(innerData),
            hasArtifact: this._hasInfographicArtifact(innerData),
        };
    }

    /**
     * Detects an infographic artifact tuple anywhere in a LIST_ARTIFACTS payload.
     * The record shape is [<uuid-id>, <title|null>, 7, [[[<sourceId>]]], ...] —
     * type marker 7 at index 2, a UUID at index 0, a nested array at index 3.
     * Title can be null while still rendering, so we key off id+type, not title.
     */
    private _hasInfographicArtifact(obj: any): boolean {
        if (Array.isArray(obj)) {
            if (typeof obj[0] === 'string' && obj[0].length > 20 && obj[2] === 7 && Array.isArray(obj[3])) {
                return true;
            }
            for (const item of obj) {
                if (this._hasInfographicArtifact(item)) return true;
            }
        }
        return false;
    }

    async pollForArtifacts(notebookId: string): Promise<string> {
        logToFile("[NativeFetch] Polling for artifacts...");
        // Adaptive budget. Rendering under load can take well over 5 minutes, so
        // once the artifact RECORD has appeared we keep waiting for the image up
        // to ~15 min rather than reporting a false failure while it renders. But
        // if NO record appears within the first ~2 min, the generation was never
        // accepted (quota / unsupported source) — fail early instead of stalling
        // the full budget.
        const MAX_ATTEMPTS = 90;          // ~15 min at 10s spacing
        const NO_ARTIFACT_GIVEUP = 12;    // ~2 min with no record at all → not accepted
        let sawArtifact = false;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            try {
                const { imageUrl, hasArtifact } = await this._listInfographicState(notebookId);
                if (imageUrl) {
                    logToFile(`[NativeFetch] 📸 Image Found: ${imageUrl}`);
                    return imageUrl;
                }
                if (hasArtifact) sawArtifact = true;
                if (!sawArtifact && i >= NO_ARTIFACT_GIVEUP) {
                    throw new Error("NotebookLM never created an infographic artifact — the generation was not accepted (possibly a daily quota limit or an unsupported source). Check the NotebookLM Studio panel.");
                }
                logToFile(`[NativeFetch] No image yet (attempt ${i + 1}/${MAX_ATTEMPTS}, artifactRecordSeen=${sawArtifact}).`);
            } catch (e: any) {
                // Propagate terminal conditions; retry only transient poll errors.
                if (e.message.includes("Authentication required")
                    || e.message.includes("rejected the request")
                    || e.message.includes("was not accepted")) throw e;
                logToFile(`[NativeFetch] Artifact poll error: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 10000));
        }
        // Ran the full budget. If we saw a record, it's a slow render, not a
        // failure — say so specifically so the caller/UI points at Studio.
        throw new Error(sawArtifact
            ? "The infographic is still rendering on NotebookLM's side after ~15 minutes. The artifact exists in the Studio panel and may finish shortly — check there."
            : "Timeout waiting for artifact creation");
    }

    /**
     * Resolves the notebook for a video/source URL and reports whether an
     * infographic already exists on it, WITHOUT triggering a new generation.
     * Lets the caller (server.ts) ask the user "reuse the existing one or
     * generate a new one?" BEFORE doing any work, instead of a job silently
     * reusing (or regenerating) something the user never got a say in.
     */
    async resolveInfographicTarget(videoUrl: string, notebookIdOverride?: string): Promise<{ notebookId: string; sourceId: string; existingImageUrl: string | null }> {
        const { notebookId, sourceId } = await this.prepareNotebook(videoUrl, notebookIdOverride);
        const existing = await this._listInfographicState(notebookId);
        return { notebookId, sourceId, existingImageUrl: existing.imageUrl };
    }

    async generateInfographic(videoUrl: string, opts?: { notebookIdOverride?: string; forceNew?: boolean }): Promise<string> {
        const { notebookId, sourceId } = await this.prepareNotebook(videoUrl, opts?.notebookIdOverride);

        // ── IDEMPOTENCY ──
        // prepareNotebook only reuses the NOTEBOOK. Without the check below, every
        // generate_infographic call — even a cache hit on the same notebook —
        // fired a fresh GENERATE_INFOGRAPHIC and left another artifact behind, so
        // a model that re-requested on each slow/failed attempt piled up 15+
        // infographics on one notebook (see incident logs). Reuse an existing
        // infographic instead: if one is already rendered, return it; if one
        // exists but is still rendering, poll it — do NOT trigger another.
        //
        // `opts.forceNew` lets a caller who already asked the user — and got
        // "generate a new one" as the answer — bypass the rendered-image reuse
        // below. It never bypasses the still-rendering case: there's nothing
        // usable yet to offer the user a choice over, and re-triggering a
        // generation that's already in flight is exactly the pileup bug this
        // guard exists to prevent, regardless of forceNew.
        const existing = await this._listInfographicState(notebookId);
        if (existing.imageUrl && !opts?.forceNew) {
            logToFile(`[NativeFetch] ♻️ Infographic already rendered on ${notebookId} — reusing it, no new generation.`);
            return existing.imageUrl;
        }
        if (existing.hasArtifact && !existing.imageUrl) {
            logToFile(`[NativeFetch] ⏳ Infographic already exists on ${notebookId} but is still rendering — polling, not re-triggering.`);
            return await this.pollForArtifacts(notebookId);
        }

        // No usable infographic on this notebook yet (or the user explicitly
        // asked for a new one) — trigger exactly one, then poll.
        logToFile("[NativeFetch] 🚀 Triggering Infographic...");
        const triggerPayload = [[2], notebookId, [null, null, 7, [[[sourceId]]], null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]]];
        const triggerRes = await this._executeRpc(RPC_GENERATE_INFOGRAPHIC, triggerPayload);
        // A rejection (e.g. Google's daily infographic quota, surfaced in the UI
        // as "You have reached your daily infographic limit") shows up here on
        // the trigger call itself — fail fast rather than polling for something
        // that was never queued.
        const triggerErr = triggerRes?.[0]?.[5];
        if (Array.isArray(triggerErr) && triggerErr.length > 0) {
            logToFile(`[NativeFetch] ❌ Infographic trigger rejected: ${JSON.stringify(triggerErr).slice(0, 300)}`);
            throw new Error(`NotebookLM rejected the request (gRPC code ${triggerErr[0]}). This can mean a daily generation limit or quota was hit — check the NotebookLM Studio panel.`);
        }

        return await this.pollForArtifacts(notebookId);
    }

    async queryNotebook(notebookId: string, sourceId: string, prompt: string): Promise<string> {
        logToFile(`[NativeFetch] Query: "${prompt}" for notebook ${notebookId}...`);

        const innerReq = [
            [[[sourceId]]],
            prompt,
            null,
            [2, null, [1], [1]],
            null, null, null,
            notebookId,
            1
        ];

        const fReq = [
            null,
            JSON.stringify(innerReq)
        ];

        const rawResponse = await this._executeStreamedRpc(fReq);
        logToFile(`[NativeFetch] Streamed response size: ${rawResponse.length} bytes`);
        const summary = this._parseStreamedResponse(rawResponse);

        if (!summary) {
            logToFile(`[NativeFetch] ⚠️ Query returned empty text. Raw response (first 500 chars): ${rawResponse.toString('utf-8').substring(0, 500)}`);
            return "Failed to generate answer.";
        }

        logToFile(`[NativeFetch] ✅ Query successful (${summary.length} chars).`);
        return summary;
    }

    async query(url: string, question: string, specificSourceId?: string, notebookIdOverride?: string): Promise<string> {
        let { notebookId, sourceId } = await this.prepareNotebook(url, notebookIdOverride);

        if (specificSourceId) {
            sourceId = specificSourceId;
            logToFile(`[NativeFetch] Override: Using specific source ID: ${sourceId}`);
        }

        logToFile(`[NativeFetch] Querying notebook ${notebookId} (source: ${sourceId})...`);
        return await this.queryNotebook(notebookId, sourceId, question);
    }

    async generateSummary(videoUrl: string, notebookIdOverride?: string): Promise<string> {
        // Check cache before prepareNotebook to know if we need the delay
        const cacheFile = this.getCacheFile();
        let wasCached = false;
        try {
            if (fs.existsSync(cacheFile)) {
                const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                wasCached = !!cache[videoUrl];
            }
        } catch { }

        const { notebookId, sourceId } = await this.prepareNotebook(videoUrl, notebookIdOverride);

        if (!wasCached) {
            logToFile("[NativeFetch] ⏳ Waiting 10s for new notebook to process transcript...");
            await new Promise(r => setTimeout(r, 10000));

            // Verify the source actually imported successfully
            try {
                const sources = await this.listSources(`https://notebooklm.google.com/notebook/${notebookId}`);
                const added = sources.find((s: any) => s.sourceId === sourceId);
                if (!added || !added.title) {
                    // Clear bad cache entry so next attempt starts fresh
                    try {
                        const cacheRaw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                        delete cacheRaw[videoUrl];
                        fs.writeFileSync(cacheFile, JSON.stringify(cacheRaw, null, 2));
                    } catch { }
                    throw new Error(
                        "This video could not be imported into NotebookLM — it likely has no transcript or captions available. " +
                        "Try a video with auto-generated or manual captions."
                    );
                }
                logToFile(`[NativeFetch] ✅ Source verified: "${added.title}"`);
            } catch (e: any) {
                if (e.message.includes("could not be imported")) throw e;
                logToFile(`[NativeFetch] ⚠️ Source verification skipped: ${e.message}`);
            }
        } else {
            logToFile("[NativeFetch] ⚡ Notebook cached, skipping wait.");
        }

        return await this.queryNotebook(notebookId, sourceId, "give me summary of the video");
    }
}
