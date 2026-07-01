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

export class NativeFetchClient {
    private cookies: ChromeCookie[] = [];
    private sessionTokens: SessionTokens = { at: null, bl: null, fsid: null };
    private userAgent: string = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
    private transport?: RawFetchFn;

    constructor(cookies: ChromeCookie[], userAgent?: string, transport?: RawFetchFn) {
        this.cookies = cookies;
        this.transport = transport;
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

        try {
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
        } catch (e: any) {
            logToFile(`[NativeFetch] List Sources Failed: ${e.message}`);
        }

        return [];
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

    async downloadResource(url: string): Promise<Buffer> {
        logToFile(`[NativeFetch] Downloading resource: ${url.substring(0, 50)}...`);

        // Always use Node.js native fetch (not the Playwright transport) so CORS
        // restrictions in the headless browser don't block cross-origin CDN URLs
        // like lh3.googleusercontent.com.
        const headers = new Headers({ "Referer": "https://notebooklm.google.com/" });
        headers.set("Cookie", this.getCookieHeader(url));
        headers.set("User-Agent", this.userAgent);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            throw new Error(`Failed to download resource: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
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

    async prepareNotebook(url: string): Promise<{ notebookId: string, sourceId: string, wasCached: boolean }> {
        if (!this.sessionTokens.at) await this._refreshTokens();

        const cacheFile = path.resolve(__dirname, "../cache.json");
        let cache: any = {};
        if (fs.existsSync(cacheFile)) {
            try {
                cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            } catch (e) { }
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
                logToFile(`[NativeFetch] ⚡ Cache Hit! Reusing notebook: ${notebookId}`);
                wasCached = true;
            }
        }

        if (!notebookId || !sourceId) { // If missing either (unless legacy cache gave bad data)
            if (!notebookId) {
                logToFile("[NativeFetch] Creating Notebook...");
                const createPayload = ["", null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
                const createRes = await this._executeRpc(RPC_CREATE_NOTEBOOK, createPayload);
                const innerCreate = JSON.parse(createRes[0][2]);
                notebookId = innerCreate[2];
                logToFile(`[NativeFetch] Notebook Created: ${notebookId}`);
            }

            if (!sourceId) {
                logToFile(`[NativeFetch] Adding Source: ${url}...`);
                const sourcePayload = [[[null, null, null, null, null, null, null, [url], null, null, 1]], notebookId, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
                const sourceRes = await this._executeRpc(RPC_ADD_SOURCE, sourcePayload);

                if (!sourceRes || !sourceRes[0]) throw new Error("Invalid Add Source Response");

                const rawInner = sourceRes[0][2];
                const innerSource = JSON.parse(rawInner);
                sourceId = this._findSourceId(innerSource);

                if (!sourceId) {
                    throw new Error("Failed to add source (No ID found)");
                }

                logToFile(`[NativeFetch] Source Added: ${sourceId}`);
            }

            // Write cache (only if we created/added stuff)
            cache[url] = { notebookId, sourceId };
            fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
            wasCached = false; // We just created it
        }

        return { notebookId: notebookId!, sourceId: sourceId!, wasCached };
    }

    async pollForArtifacts(notebookId: string): Promise<string> {
        logToFile("[NativeFetch] Polling for artifacts...");
        for (let i = 0; i < 30; i++) {
            try {
                // No filter — get all artifacts. The old filter string caused null responses
                // when the API changed; now we let _findImageUrl sort through the results.
                const payload = [[2], notebookId];
                const response = await this._executeRpc(RPC_LIST_ARTIFACTS, payload);

                if (response && response[0]) {
                    // gRPC error code 16 = UNAUTHENTICATED — fail fast instead of burning 30 attempts
                    const errorSlot = response[0][5];
                    if (Array.isArray(errorSlot) && errorSlot[0] === 16) {
                        throw new Error("Authentication required. Please re-sync your cookies using the Chrome extension.");
                    }

                    if (typeof response[0][2] === 'string') {
                        const innerData = JSON.parse(response[0][2]);
                        const imageUrl = this._findImageUrl(innerData);
                        if (imageUrl) {
                            logToFile(`[NativeFetch] 📸 Image Found: ${imageUrl}`);
                            return imageUrl;
                        }
                        logToFile(`[NativeFetch] No image yet (attempt ${i + 1}): ${JSON.stringify(innerData).substring(0, 2000)}`);
                    } else {
                        logToFile(`[NativeFetch] Null data slot (attempt ${i + 1}). Full: ${JSON.stringify(response).substring(0, 300)}`);
                    }
                }
            } catch (e: any) {
                if (e.message.includes("Authentication required")) throw e;
                logToFile(`[NativeFetch] Artifact poll error: ${e.message}`);
            }
            await new Promise(r => setTimeout(r, 10000));
            logToFile(`[NativeFetch] Poll attempt ${i + 1}/30...`);
        }
        throw new Error("Timeout waiting for artifact creation");
    }

    async generateInfographic(videoUrl: string): Promise<string> {
        let { notebookId, sourceId, wasCached } = await this.prepareNotebook(videoUrl);

        try {
            logToFile("[NativeFetch] ⏳ Waiting 5s...");
            await new Promise(r => setTimeout(r, 5000));

            logToFile("[NativeFetch] 🚀 Triggering Infographic...");
            const triggerPayload = [[2], notebookId, [null, null, 7, [[[sourceId]]], null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]]];
            await this._executeRpc(RPC_GENERATE_INFOGRAPHIC, triggerPayload);

            return await this.pollForArtifacts(notebookId);
        } catch (e: any) {
            // Handle broken cache (null artifacts loop)
            if (wasCached && (e.message.includes("Repeated null") || e.message.includes("Timeout"))) {
                logToFile(`[NativeFetch] ⚠️ Caught error on cached notebook: ${e.message}. Invalidating cache and retrying with fresh notebook...`);

                // Clear cache for this URL
                const cacheFile = path.resolve(__dirname, '../cache.json');
                if (fs.existsSync(cacheFile)) {
                    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                    delete cache[videoUrl];
                    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
                    logToFile(`[NativeFetch] 🧹 Cleared cache for ${videoUrl}`);
                }

                // FORCE RETRY (recursive call will create new notebook since cache is gone)
                // We could just call `generateInfographic` recursively, but let's be safe and manual
                logToFile(`[NativeFetch] 🔄 Retrying generation with fresh notebook...`);
                const fresh = await this.prepareNotebook(videoUrl); // Will create new
                notebookId = fresh.notebookId;
                sourceId = fresh.sourceId;

                // Trigger again for fresh notebook
                logToFile("[NativeFetch] 🚀 Triggering Infographic (Retry)...");
                const retryPayload = [[2], notebookId, [null, null, 7, [[[sourceId]]], null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]]];
                await this._executeRpc(RPC_GENERATE_INFOGRAPHIC, retryPayload);

                return await this.pollForArtifacts(notebookId);
            }
            throw e;
        }
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

    async query(url: string, question: string, specificSourceId?: string): Promise<string> {
        let { notebookId, sourceId } = await this.prepareNotebook(url);

        if (specificSourceId) {
            sourceId = specificSourceId;
            logToFile(`[NativeFetch] Override: Using specific source ID: ${sourceId}`);
        }

        logToFile(`[NativeFetch] Querying notebook ${notebookId} (source: ${sourceId})...`);
        return await this.queryNotebook(notebookId, sourceId, question);
    }

    async generateSummary(videoUrl: string): Promise<string> {
        // Check cache before prepareNotebook to know if we need the delay
        const cacheFile = path.resolve(__dirname, "../cache.json");
        let wasCached = false;
        try {
            if (fs.existsSync(cacheFile)) {
                const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                wasCached = !!cache[videoUrl];
            }
        } catch { }

        const { notebookId, sourceId } = await this.prepareNotebook(videoUrl);

        if (!wasCached) {
            logToFile("[NativeFetch] ⏳ Waiting 10s for new notebook to process transcript...");
            await new Promise(r => setTimeout(r, 10000));
        } else {
            logToFile("[NativeFetch] ⚡ Notebook cached, skipping wait.");
        }

        return await this.queryNotebook(notebookId, sourceId, "give me summary of the video");
    }
}
