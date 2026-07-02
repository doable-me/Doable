
import { chromium, BrowserContext, Page, APIRequestContext } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

// ESM __dirname polyfill
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
    // Also print to stderr for Claude Desktop visibility
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

export class NotebookLMClient {
    private headless: boolean;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private sessionTokens: SessionTokens = { at: null, bl: null, fsid: null };

    constructor(headless: boolean = true) {
        this.headless = headless;
    }

    async start(): Promise<void> {
        // Use local user_data folder for persistence across reboots
        const userDataDir = path.resolve(__dirname, "../user_data");

        logToFile(`[NotebookLM] Launching browser (Headless: ${this.headless})...`);
        this.context = await chromium.launchPersistentContext(userDataDir, {
            headless: this.headless,
            args: [
                "--disable-blink-features=AutomationControlled",
                "--ignore-certificate-errors",
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });

        this.page = this.context.pages()[0] || await this.context.newPage();
        await this._refreshTokens();
    }

    async stop(): Promise<void> {
        if (this.context) {
            await this.context.close();
            this.context = null;
            this.page = null;
        }
    }

    /**
     * Ensure browser is ready for operations. Restarts if crashed/closed.
     */
    async ensureBrowserReady(): Promise<void> {
        let needsRestart = false;

        // Check if context/page exist
        if (!this.context || !this.page) {
            logToFile("[NotebookLM] ⚠️ Browser context/page is null, restarting...");
            needsRestart = true;
        } else {
            // Try a simple operation to verify page is alive
            try {
                await this.page.evaluate(() => document.readyState);
            } catch (e: any) {
                logToFile(`[NotebookLM] ⚠️ Browser health check failed: ${e.message}, restarting...`);
                needsRestart = true;
            }
        }

        if (needsRestart) {
            // Clean up old context if exists
            if (this.context) {
                try {
                    await this.context.close();
                } catch { }
                this.context = null;
                this.page = null;
            }

            // Restart browser
            await this.start();
            logToFile("[NotebookLM] ✅ Browser restarted successfully");
        }
    }

    async openLoginWindow(): Promise<void> {
        logToFile("[NotebookLM] 🔓 Launching Interactive Login Window...");
        await this.stop(); // Release lock

        // Temporarily act as not-headless
        this.headless = false;
        await this.start();

        if (this.page) {
            await this.page.goto("https://notebooklm.google.com");
            logToFile("[NotebookLM] Login Window Opened. Waiting for user to log in...");

            try {
                // Wait for the 'Create new' button which indicates we are on the dashboard (logged in)
                await this.page.waitForSelector('text="Create new"', { timeout: 300000 });
                logToFile("[NotebookLM] ✅ Login detected! Closing window in 2 seconds...");
                await this.page.waitForTimeout(2000);
            } catch (error) {
                logToFile("[NotebookLM] ⚠️ Login verification timed out or failed. Closing window.");
            }

            await this.stop();
            // Reset to headless for next time
            this.headless = true;
        }
    }

    async _refreshTokens(): Promise<boolean> {
        logToFile("[NotebookLM] 🔄 Navigating to scrape tokens...");
        if (!this.page) throw new Error("Page not initialized");

        await this.page.goto(BASE_URL);

        if (this.page.url().includes("accounts.google.com")) {
            console.warn("[NotebookLM] ⚠️ Login required!");
            if (this.headless) {
                // Return specific error that server.ts can catch
                throw new Error("Authentication required. Please run with headless=false first to login.");
            }
            // Wait for user login
            await this.page.waitForURL("https://notebooklm.google.com/**", { timeout: 0 });
            logToFile("[NotebookLM] Login detected.");
        }

        let content = await this.page.content();

        // Regex extraction
        const atMatch = content.match(/"SNlM0e":"([^"]+)"/);
        const blMatch = content.match(/"(boq_labs-tailwind-[^"]+)"/);
        const fsidMatch = content.match(/"FdrFJe":"([^"]+)"/);

        if (!atMatch || !blMatch) {
            await this.page.waitForTimeout(2000);
            content = await this.page.content();
        }

        const atV = content.match(/"SNlM0e":"([^"]+)"/)?.[1];
        const blV = content.match(/"(boq_labs-tailwind-[^"]+)"/)?.[1];
        const fsidV = content.match(/"FdrFJe":"([^"]+)"/)?.[1];

        if (!atV || !blV) {
            throw new Error("Could not find session tokens. Are you logged in?");
        }

        this.sessionTokens = {
            at: atV,
            bl: blV,
            fsid: fsidV || null
        };

        logToFile(`[NotebookLM] ✅ Tokens acquired. bl: ${this.sessionTokens.bl}`);
        logToFile(`[NotebookLM] ✅ Tokens acquired. bl: ${this.sessionTokens.bl}`);
        return true;
    }

    _parseNotebookUrl(url: string): string | null {
        const match = url.match(/notebook\/([0-9a-fA-F-]{36})/);
        return match ? match[1] : null;
    }

    async listSources(url: string): Promise<any[]> {
        const notebookId = this._parseNotebookUrl(url) || url;
        logToFile(`[NotebookLM] Listing sources for: ${notebookId}...`);

        const payload = [notebookId, null, [2], null, 0];

        try {
            logToFile(`[Debug] calling _executeRpc for sources...`);
            const response = await this._executeRpc(RPC_LOAD_NOTEBOOK, payload);
            logToFile(`[Debug] _executeRpc returned: ${response ? 'Object' : 'Null'}`);
            logToFile(`[Debug] Full response: ${JSON.stringify(response)}`);

            if (response && response[0]) {
                logToFile(`[Debug] response[0][1]: ${response[0][1]} (Expected: ${RPC_LOAD_NOTEBOOK})`);
                logToFile(`[Debug] response[0][2] type: ${typeof response[0][2]}`);
            }

            if (response && response[0] && response[0][1] === RPC_LOAD_NOTEBOOK && typeof response[0][2] === 'string') {
                const innerJson = response[0][2];
                const data = JSON.parse(innerJson);

                // Trace shows structure: [ ["Title", [SourceList]], "NotebookID", ... ]
                // So sources are at data[0][1]
                const sourcesRaw = data[0]?.[1];

                if (Array.isArray(sourcesRaw)) {
                    const results = [];
                    for (const s of sourcesRaw) {
                        if (!Array.isArray(s)) continue;

                        // Trace source item: [ ["ID"], "Title", [Meta...] ]
                        // ID is nested in array at index 0
                        const sourceId = Array.isArray(s[0]) ? s[0][0] : s[0];
                        const title = s[1];
                        let type = "unknown";
                        let originalUrl = null;

                        // Check index 5 for external data (YouTube/Web)
                        // Trace: ["id", "title", [...], [...], 9, ["url", ...], 1]
                        // Wait, trace shows meta is at s[2].
                        // And inside meta (s[2]), index 5 has URL.
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

                    logToFile(`[NotebookLM] Found ${results.length} sources via RPC.`);
                    if (results.length > 0) return results;
                }
            } else {
                logToFile(`[Debug] RPC response invalid or empty.`);
            }
        } catch (e: any) {
            logToFile(`[NotebookLM] List Sources RPC Failed: ${e.message}`);
        }

        // --- FALLBACK: DOM SCRAPING ---
        logToFile("[NotebookLM] RPC method failed to find sources. Falling back to DOM scraping...");
        try {
            if (!this.page) throw new Error("Page not initialized for scraping fallback.");
            const targetUrl = `https://notebooklm.google.com/notebook/${notebookId}`;
            if (this.page.url() !== targetUrl) {
                logToFile(`[NotebookLM] Navigating to ${targetUrl} for scraping...`);
                await this.page.goto(targetUrl);
                // Wait for source list to populate
                await this.page.waitForSelector('[data-source-id]', { timeout: 10000 }).catch(() => logToFile("[Warn] Timeout waiting for sources"));
            }

            const scrapedSources = await this.page.evaluate(() => {
                const results: any[] = [];
                const seen = new Set();
                document.querySelectorAll('[data-source-id]').forEach((el) => {
                    const id = el.getAttribute('data-source-id');
                    const title = el.textContent?.trim() || "Unknown Source";
                    if (id && !seen.has(id)) {
                        seen.add(id);
                        results.push({ sourceId: id, title, type: 'scraped', originalUrl: null });
                    }
                });
                return results;
            });

            logToFile(`[NotebookLM] Scraped ${scrapedSources.length} sources from DOM.`);
            return scrapedSources;

        } catch (e: any) {
            logToFile(`[NotebookLM] Scraping fallback failed: ${e.message}`);
        }

        return [];
    }

    async _fetchSourceId(notebookId: string): Promise<string> {
        const sources = await this.listSources(notebookId);
        if (sources.length > 0) {
            logToFile(`[NotebookLM] ✅ Using first source: ${sources[0].sourceId}`);
            return sources[0].sourceId;
        }
        throw new Error("No sources found in this notebook.");
    }

    _extractAllUuids(obj: any): string[] {
        const uuids: string[] = [];
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        const walk = (o: any) => {
            if (typeof o === 'string') {
                if (uuidRegex.test(o)) uuids.push(o);
            } else if (Array.isArray(o)) {
                o.forEach(walk);
            } else if (typeof o === 'object' && o !== null) {
                Object.values(o).forEach(walk);
            }
        };

        walk(obj);
        return uuids;
    }

    async _executeRpc(rpcId: string, payload: any): Promise<any> {
        if (!this.page) throw new Error("Client not started");

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

        const url = `${RPC_ENDPOINT}?${params.toString()}`;

        // Executing fetch inside the page context
        const responseText = await this.page.evaluate(async ({ url, envelope, at }) => {
            const body = new URLSearchParams();
            body.append("f.req", envelope);
            body.append("at", at);

            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
                    "X-Same-Domain": "1"
                },
                body: body
            });
            if (!res.ok) throw new Error("RPC Failed: " + res.status);
            return await res.text();
        }, { url, envelope, at: this.sessionTokens.at || "" });

        return this._parseRpcResponse(responseText);
    }

    _parseRpcResponse(text: string): any {
        // logToFile(`[Debug] RPC Raw Response: ${text.substring(0, 100)}...`);
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('[[')) {
                try {
                    const data = JSON.parse(trimmed);
                    if (data && data[0] && data[0][0] === 'wrb.fr') {
                        logToFile("[Debug] Parsed 'wrb.fr' frame successfully.");
                        return data;
                    }
                } catch (e) { }
            }
        }
        logToFile("[Debug] Failed to parse RPC response. No 'wrb.fr' frame found.");
        return null;
    }

    async _executeStreamedRpc(fReqPayload: any): Promise<Buffer> {
        if (!this.context) throw new Error("Client not started");

        const reqId = Math.floor(Math.random() * 100000) + 100000;
        const fReqStr = JSON.stringify(fReqPayload); // separators not critical in JS usually, but standard JSON is fine

        const params = new URLSearchParams({
            "bl": this.sessionTokens.bl || "",
            "f.sid": this.sessionTokens.fsid || "",
            "hl": "en",
            "_reqid": reqId.toString(),
            "rt": "c"
        });

        const url = `${RPC_GENERATE_STREAMED}?${params.toString()}`;
        logToFile(`[NotebookLM] Executing Streamed RPC to ${url}`);

        const response = await this.context.request.post(url, {
            form: {
                "f.req": fReqStr,
                "at": this.sessionTokens.at || ""
            },
            headers: {
                "X-Same-Domain": "1"
            },
            timeout: 120000
        });

        if (!response.ok()) {
            throw new Error(`Streamed RPC Failed: ${response.status()} ${await response.text()}`);
        }

        return await response.body();
    }

    _parseStreamedResponse(entryBuffer: Buffer): string {
        let fullText = "";
        let textBody = entryBuffer.toString('utf-8');

        // Remove XSSI guard
        if (textBody.startsWith(")]}'")) {
            textBody = textBody.substring(4).trim();
        }

        // Robust JSON Scan
        // In JS we don't have raw_decode returning end_pos. We must find the bracket balance.
        let pos = 0;
        const len = textBody.length;

        while (pos < len) {
            // finding start '['
            const startBracket = textBody.indexOf('[', pos);
            if (startBracket === -1) break;

            // Find balanced ending ']'
            const endBracket = this._findBalancedEnd(textBody, startBracket);
            if (endBracket === -1) {
                // Incomplete JSON or malformed
                pos = startBracket + 1;
                continue;
            }

            const jsonStr = textBody.substring(startBracket, endBracket + 1);
            try {
                const obj = JSON.parse(jsonStr);
                const extracted = this._extractWrbText(obj);
                if (extracted) {
                    // Last Write Wins
                    fullText = extracted.trim() + "\n";
                }
            } catch (e) {
                // Ignore parse errors
            }

            pos = endBracket + 1;
        }

        return fullText.trim();
    }

    // Helper for finding the matching closing bracket
    _findBalancedEnd(str: string, start: number): number {
        let depth = 0;
        let inString = false;
        let escape = false;

        for (let i = start; i < str.length; i++) {
            const char = str[i];

            if (escape) {
                escape = false;
                continue;
            }

            if (char === '\\') {
                escape = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '[') depth++;
                else if (char === ']') {
                    depth--;
                    if (depth === 0) return i;
                }
                else if (char === '{') depth++; // Should handle object braces too just in case
                else if (char === '}') depth--;
            }
        }
        return -1;
    }

    _extractWrbText(node: any): string {
        const results: string[] = [];

        const walk = (n: any, inPayload: boolean = false) => {
            if (Array.isArray(n)) {
                // wrb.fr check
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
                    // Anti-Transcript Heuristic
                    // Check for [start(int), end(int), ...] or [null, start(int), end(int)]
                    // JS numbers are just numbers.

                    if (n.length >= 2 && typeof n[0] === 'number' && typeof n[1] === 'number') return;
                    if (n.length >= 3 && n[0] === null && typeof n[1] === 'number' && typeof n[2] === 'number') return;

                    n.forEach(c => walk(c, inPayload));
                } else {
                    n.forEach(c => walk(c, inPayload));
                }
            } else if (typeof n === 'string' && inPayload) {
                const val = n.trim();
                // UUID Filter & Empty
                if (val && val.length !== 36) {
                    results.push(val);
                }
            }
        };

        walk(node);
        return results.join("\n");
    }

    async downloadResource(url: string): Promise<Buffer> {
        logToFile(`[NotebookLM] Downloading resource: ${url.substring(0, 50)}...`);
        if (!this.context) await this.start();
        if (!this.context) throw new Error("Context failed to start");

        const response = await this.context.request.get(url, {
            headers: { "Referer": "https://notebooklm.google.com/" }
        });

        if (!response.ok()) {
            throw new Error(`Failed to download image: ${response.status()}`);
        }
        return await response.body();
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
        // rough uuid pattern check
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

    async prepareNotebook(url: string): Promise<{ notebookId: string, sourceId: string }> {
        if (!this.sessionTokens.at) await this.start();

        const cacheFile = path.resolve(__dirname, "../cache.json");
        let cache: any = {};
        if (fs.existsSync(cacheFile)) {
            try {
                cache = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
            } catch (e) { }
        }

        let notebookId: string | null = null;
        let sourceId: string | null = null;



        // Check if input is a direct Notebook URL
        const parsedNotebookId = this._parseNotebookUrl(url);
        if (parsedNotebookId) {
            notebookId = parsedNotebookId;
            logToFile(`[NotebookLM] Direct Notebook URL detected: ${notebookId}`);

            // Check cache for this notebook's source
            if (cache[url]) {
                sourceId = typeof cache[url] === 'object' ? (cache[url].sourceId || cache[url].source_id) : null;
            }

            // If not in cache, we MUST fetch it via RPC
            if (!sourceId) {
                // Remove stale cache entry if exists partially
                delete cache[url];

                logToFile("[NotebookLM] Source ID unknown for this notebook. Fetching via RPC...");
                try {
                    sourceId = await this._fetchSourceId(notebookId);

                    // Cache it
                    cache[url] = { notebookId, sourceId };
                    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
                } catch (e) {
                    logToFile(`[NotebookLM] ❌ Failed to fetch source: ${e}`);
                    throw e;
                }
            } else {
                logToFile(`[NotebookLM] ⚡ Using Cached Source ID: ${sourceId}`);
            }

            return { notebookId, sourceId };
        }

        // --- Logic for YouTube URLs (Create/Reuse Notebook) ---

        if (cache[url]) {
            const entry = cache[url];
            if (typeof entry === 'object') {
                notebookId = entry.notebookId || entry.notebook_id; // handle both
                sourceId = entry.sourceId || entry.source_id;
            } else {
                notebookId = entry;
            }
            if (notebookId) logToFile(`[NotebookLM] ⚡ Cache Hit! Reusing notebook: ${notebookId}`);
        }

        if (!notebookId) {
            logToFile("[NotebookLM] Creating Notebook...");
            const createPayload = ["", null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
            const createRes = await this._executeRpc(RPC_CREATE_NOTEBOOK, createPayload);
            const innerCreate = JSON.parse(createRes[0][2]);
            notebookId = innerCreate[2];
            logToFile(`[NotebookLM] Notebook Created: ${notebookId}`);
        }

        if (!sourceId) {
            logToFile(`[NotebookLM] Adding Source: ${url}...`);
            // NOTE: Python used 'None' which became 'null' in JSON. JS 'null' matches.
            const sourcePayload = [[[null, null, null, null, null, null, null, [url], null, null, 1]], notebookId, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
            const sourceRes = await this._executeRpc(RPC_ADD_SOURCE, sourcePayload);

            if (!sourceRes || !sourceRes[0]) throw new Error("Invalid Add Source Response");

            // Check for gRPC error codes (16 = UNAUTHENTICATED)
            const errorSlot = sourceRes[0][5];
            if (Array.isArray(errorSlot) && errorSlot[0] === 16) {
                throw new Error("Authentication required. Please re-sync your cookies using the Chrome extension.");
            }

            const rawInner = sourceRes[0][2];
            const innerSource = JSON.parse(rawInner);
            logToFile(`[NotebookLM] ADD_SOURCE raw response: ${JSON.stringify(innerSource).substring(0, 800)}`);
            sourceId = this._findSourceId(innerSource);

            if (!sourceId) {
                logToFile("[NotebookLM] ❌ No Source ID in ADD_SOURCE response: " + JSON.stringify(innerSource, null, 2));
                throw new Error(
                    "This video could not be imported into NotebookLM. " +
                    "The most common reason is that the video has no transcript or captions available. " +
                    "Try a different video that has auto-generated or manual captions."
                );
            }

            logToFile(`[NotebookLM] Source Added: ${sourceId}`);

            cache[url] = { notebookId, sourceId };
            fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
        } else {
            logToFile(`[NotebookLM] ⚡ Using Cached Source ID: ${sourceId}`);
        }

        return { notebookId: notebookId!, sourceId: sourceId! };
    }

    async pollForArtifacts(notebookId: string): Promise<string> {
        logToFile("[NotebookLM] Polling for artifacts...");
        for (let i = 0; i < 30; i++) {
            try {
                const payload = [[2], notebookId];
                const response = await this._executeRpc(RPC_LIST_ARTIFACTS, payload);

                if (response && response[0]) {
                    const errorSlot = response[0][5];
                    if (Array.isArray(errorSlot) && errorSlot[0] === 16) {
                        throw new Error("Authentication required. Please re-sync your cookies using the Chrome extension.");
                    }

                    if (typeof response[0][2] === 'string') {
                        const innerData = JSON.parse(response[0][2]);
                        const imageUrl = this._findImageUrl(innerData);
                        if (imageUrl) {
                            logToFile(`[NotebookLM] 📸 Image Found: ${imageUrl}`);
                            return imageUrl;
                        }
                        logToFile(`[NotebookLM] No image yet (attempt ${i + 1}): ${JSON.stringify(innerData).substring(0, 2000)}`);
                    } else {
                        logToFile(`[NotebookLM] Null data slot (attempt ${i + 1}). Full: ${JSON.stringify(response).substring(0, 300)}`);
                    }
                }
            } catch (e: any) {
                if (e.message?.includes("Authentication required")) throw e;
            }
            await new Promise(r => setTimeout(r, 10000));
            logToFile(`[NotebookLM] Poll attempt ${i + 1}/30...`);
        }
        throw new Error("Timeout waiting for artifact creation");
    }

    async generateInfographic(videoUrl: string): Promise<string> {
        const { notebookId, sourceId } = await this.prepareNotebook(videoUrl);
        logToFile("[NotebookLM] ⏳ Waiting 5s...");
        await new Promise(r => setTimeout(r, 5000));

        logToFile("[NotebookLM] 🚀 Triggering Infographic...");
        const triggerPayload = [[2], notebookId, [null, null, 7, [[[sourceId]]], null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]]];
        await this._executeRpc(RPC_GENERATE_INFOGRAPHIC, triggerPayload);

        return await this.pollForArtifacts(notebookId);
    }

    async queryNotebook(notebookId: string, sourceId: string, prompt: string): Promise<string> {
        logToFile(`[NotebookLM] Parsing query: "${prompt}" for notebook ${notebookId}...`);

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
        const summary = this._parseStreamedResponse(rawResponse);

        if (!summary) {
            console.warn("[NotebookLM] Query returned empty text.");
            return "Failed to generate answer.";
        }

        logToFile("[NotebookLM] Query successful.");
        return summary;
    }

    async query(url: string, question: string, specificSourceId?: string): Promise<string> {
        let { notebookId, sourceId } = await this.prepareNotebook(url);

        if (specificSourceId) {
            sourceId = specificSourceId;
            logToFile(`[NotebookLM] Override: Using specific source ID: ${sourceId}`);
        }

        logToFile(`[NotebookLM] Querying notebook ${notebookId} (source: ${sourceId})...`);
        return await this.queryNotebook(notebookId, sourceId, question);
    }

    async generateSummary(videoUrl: string): Promise<string> {
        // Wrapper for backward compatibility and specific "Summary" behavior (longer wait)
        const { notebookId, sourceId } = await this.prepareNotebook(videoUrl);

        logToFile("[NotebookLM] ⏳ Waiting 10s before requesting summary...");
        await new Promise(r => setTimeout(r, 10000));

        return await this.queryNotebook(notebookId, sourceId, "give me summary of the video");
    }
}
