/**
 * Playwright Transport for NativeFetchClient
 *
 * Replaces Node's raw fetch() cookie-replay with requests run inside a real
 * Playwright-controlled Chromium page. The synced cookies (captured by the
 * Chrome extension from the user's actual browser) are injected into a
 * fresh browser context, then every RPC call executes via page.evaluate()
 * — i.e. as real page JavaScript, with Chromium's actual TLS/HTTP2 stack
 * and cookies attached natively. There is no cookie replay for Google's
 * session-binding / anti-replay checks to flag.
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { FetchLikeResponse, RawFetchFn } from './native_fetch_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.resolve(__dirname, "../server.log");
function logToFile(msg: string) {
    const timestamp = new Date().toLocaleString();
    try {
        fs.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch { }
    process.stderr.write(`[${timestamp}] ${msg}\n`);
}

/**
 * Shared pool of Chromium PROCESSES. One real browser process per
 * concurrent user does not scale (a launched Chromium process costs real,
 * fixed RAM/CPU regardless of how idle the user is) — the standard
 * Playwright multi-tenant pattern is instead: a small, bounded number of
 * Browser processes, each hosting many isolated BrowserContexts (one per
 * user). A context is cheap (just an isolated cookie jar / storage
 * partition inside an already-running process); the process is the
 * expensive part, and this bounds how many of those ever exist regardless
 * of concurrent user count.
 *
 * Pool grows lazily up to POOL_SIZE, then reuses existing browsers
 * round-robin. Each user still gets a fully isolated BrowserContext seeded
 * with only their own cookies — nothing is shared across users except the
 * underlying process, which holds no per-user state itself.
 */
const POOL_SIZE = Number(process.env.NOTEBOOKLM_BROWSER_POOL_SIZE) || 5;

class BrowserPool {
    private browsers: Browser[] = [];
    private nextIndex = 0;
    private launching: Promise<Browser> | null = null;

    async acquire(headless: boolean): Promise<Browser> {
        // Drop any browsers that crashed/closed since we last touched the pool.
        this.browsers = this.browsers.filter(b => b.isConnected());

        if (this.browsers.length < POOL_SIZE) {
            // Coalesce concurrent growth requests onto one launch — without
            // this, N simultaneous first-time callers would each see the
            // pool under capacity and each launch their own browser,
            // overshooting POOL_SIZE.
            if (!this.launching) {
                this.launching = chromium.launch({
                    headless,
                    args: ["--disable-blink-features=AutomationControlled"],
                }).finally(() => { this.launching = null; });
            }
            const browser = await this.launching;
            if (!this.browsers.includes(browser)) {
                this.browsers.push(browser);
                logToFile(`[BrowserPool] Pool grew to ${this.browsers.length}/${POOL_SIZE} Chromium processes.`);
            }
            return browser;
        }

        const browser = this.browsers[this.nextIndex % this.browsers.length];
        this.nextIndex++;
        return browser;
    }
}

const pool = new BrowserPool();

interface ChromeCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expirationDate?: number;
    sameSite?: string;
}

function mapSameSite(value?: string): 'Strict' | 'Lax' | 'None' {
    switch (value) {
        case 'strict': return 'Strict';
        case 'no_restriction': return 'None';
        default: return 'Lax';
    }
}

interface PageFetchResult {
    ok: boolean;
    status: number;
    url?: string;
    bodyBase64?: string;
    contentType?: string;
    error?: string;
}

export class PlaywrightTransport {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    async init(cookies: ChromeCookie[], headless: boolean, userAgent?: string): Promise<void> {
        try {
            this.browser = await pool.acquire(headless);
            logToFile(`[PlaywrightTransport] Acquired pooled Chromium process. Creating isolated context...`);
            this.context = await this.browser.newContext({
                userAgent: userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                // fetchBinary() below navigates directly to CDN image URLs,
                // some of which Chromium treats as file downloads rather than
                // navigable pages — needs downloads enabled to capture those
                // bytes via the Download object instead of a page Response.
                acceptDownloads: true,
            });

            await this.context.addCookies(cookies.map(c => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path || '/',
                secure: c.secure,
                httpOnly: c.httpOnly,
                sameSite: mapSameSite(c.sameSite),
                expires: c.expirationDate ?? -1,
            })));

            this.page = await this.context.newPage();
            await this.page.goto('https://notebooklm.google.com', { waitUntil: 'domcontentloaded' });
            logToFile(`[PlaywrightTransport] Navigated. Final URL: ${this.page.url()}`);

            if (this.page.url().includes('accounts.google.com')) {
                throw new Error("Authentication required. Google redirected to sign-in — the synced session has expired.");
            }
        } catch (e) {
            // Don't leak a launched context if init fails partway through —
            // the caller never gets a handle to close it otherwise. The
            // shared browser itself is untouched (pool-owned).
            await this.close();
            throw e;
        }
    }

    /**
     * Fetches a resource by NAVIGATING a page to it and reading the network
     * response Playwright's CDP layer sees — not via `page.evaluate(fetch(...))`
     * like `fetch` below. That distinction matters here: a real browser loads
     * cross-origin images via `<img src>` (governed by the page's `img-src`
     * CSP directive, generally permissive) but a script-initiated `fetch()`
     * to that same cross-origin URL is governed by `connect-src` instead,
     * which Google's notebooklm.google.com page does not appear to allow for
     * lh3.googleusercontent.com — confirmed via the literal browser error
     * "Failed to fetch" (a network-level failure, before any HTTP response),
     * distinct from the earlier 403-to-signin failure that plain server-side
     * fetch produced. Navigating instead means the browser fetches it exactly
     * as it would for a real `<img>` load, and `response.body()` reads the
     * raw bytes directly — no CSP involved, no res.text() round-trip either.
     * Runs on a throwaway page in the same (already-authenticated) context so
     * the main page — and its in-flight RPC session — is left untouched.
     */
    async fetchBinary(url: string, headers: Record<string, string> = {}): Promise<FetchLikeResponse> {
        if (!this.context) throw new Error('PlaywrightTransport not initialized');
        const page = await this.context.newPage();
        try {
            if (Object.keys(headers).length > 0) {
                await page.setExtraHTTPHeaders(headers);
            }

            // Chromium treats SOME responses here as a file DOWNLOAD rather
            // than a navigable page (observed live: this exact CDN URL —
            // likely due to how it sets content-disposition/content-type),
            // in which case page.goto() rejects with "Download is starting"
            // instead of resolving with a Response at all. Race the
            // navigation against the page's 'download' event so either
            // outcome is handled — a normal navigation resolves goto() with a
            // Response; a download instead fires the event, and bytes come
            // from the Download object's stream.
            const downloadPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
            let response = null;
            try {
                response = await page.goto(url, { waitUntil: 'commit' });
            } catch (e: any) {
                if (!String(e.message).includes('Download is starting')) throw e;
                // else: expected for this case — the download event below has what we need.
            }

            const download = await downloadPromise;
            if (download) {
                const stream = await download.createReadStream();
                if (!stream) throw new Error('Download produced no readable stream');
                const chunks: Buffer[] = [];
                for await (const chunk of stream) chunks.push(chunk as Buffer);
                const bodyBuffer = Buffer.concat(chunks);
                logToFile(`[PlaywrightTransport] fetchBinary: captured ${bodyBuffer.length} bytes via download event (not a normal navigation response).`);
                return {
                    status: 200,
                    ok: true,
                    url,
                    headers: { get: () => null },
                    text: async () => bodyBuffer.toString('utf-8'),
                    arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength) as ArrayBuffer,
                };
            }

            if (!response) throw new Error('Navigation produced no response and no download');
            const bodyBuffer = await response.body();
            const contentType = response.headers()['content-type'] ?? null;
            return {
                status: response.status(),
                ok: response.ok(),
                url: response.url(),
                headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
                text: async () => bodyBuffer.toString('utf-8'),
                arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength) as ArrayBuffer,
            };
        } finally {
            await page.close();
        }
    }

    fetch: RawFetchFn = async (url: string, init: RequestInit): Promise<FetchLikeResponse> => {
        if (!this.page) throw new Error('PlaywrightTransport not initialized');

        const method = init.method || 'GET';
        const headers: Record<string, string> = {};
        if (init.headers) {
            new Headers(init.headers as any).forEach((value, key) => { headers[key] = value; });
        }
        const body = typeof init.body === 'string' ? init.body : undefined;

        // Body is captured as base64 inside the page, not res.text(). Binary
        // payloads (e.g. the infographic PNG/JPEG bytes downloadResource
        // needs) are NOT valid UTF-8, so decoding them as text and later
        // re-encoding corrupts the bytes — this was silently broken until
        // downloadResource actually started exercising arrayBuffer(); every
        // other caller here only ever reads .text() (JSON RPC responses),
        // so the corruption had no prior symptom. Base64 round-trips exactly
        // for both binary and text, so one code path now serves both.
        const result: PageFetchResult = await this.page.evaluate(async ({ url, method, headers, body }) => {
            try {
                const res = await fetch(url, { method, headers, body: body || undefined, credentials: 'include' });
                const buf = await res.arrayBuffer();
                const bytes = new Uint8Array(buf);
                let binary = '';
                const chunkSize = 0x8000;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
                }
                const bodyBase64 = btoa(binary);
                return { ok: res.ok, status: res.status, url: res.url, bodyBase64, contentType: res.headers.get('content-type') || '' };
            } catch (e: any) {
                return { ok: false, status: 0, error: e.message };
            }
        }, { url, method, headers, body });

        if (!result.ok && result.error) {
            // A same-origin in-page fetch normally can't be blocked by CORS.
            // If it just was, the page itself must have been navigated away
            // to a different origin (e.g. Google's sign-in flow) — that's
            // the real cause, not a generic network failure.
            if (this.page.url().includes('accounts.google.com')) {
                throw new Error("Authentication required. Google redirected to sign-in — the synced session has expired.");
            }
            throw new Error(`Playwright page fetch failed: ${result.error}`);
        }

        const bodyBuffer = Buffer.from(result.bodyBase64 || '', 'base64');
        return {
            status: result.status,
            ok: result.ok,
            url: result.url || url,
            headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? (result.contentType || null) : null) },
            text: async () => bodyBuffer.toString('utf-8'),
            arrayBuffer: async () => bodyBuffer.buffer.slice(bodyBuffer.byteOffset, bodyBuffer.byteOffset + bodyBuffer.byteLength) as ArrayBuffer,
        };
    };

    async close(): Promise<void> {
        // Only tear down this user's isolated context — the underlying
        // Chromium process is pool-owned and shared across other users, so
        // it must survive this instance closing.
        try { await this.context?.close(); } catch { /* already closed */ }
        this.browser = null;
        this.context = null;
        this.page = null;
    }
}
