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
    bodyText?: string;
    contentType?: string;
    error?: string;
}

export class PlaywrightTransport {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    async init(cookies: ChromeCookie[], headless: boolean, userAgent?: string): Promise<void> {
        try {
            logToFile(`[PlaywrightTransport] Launching Chromium (headless: ${headless})...`);
            this.browser = await chromium.launch({
                headless,
                args: ["--disable-blink-features=AutomationControlled"],
            });
            this.context = await this.browser.newContext({
                userAgent: userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
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
            // Don't leak a launched browser if init fails partway through —
            // the caller never gets a handle to close it otherwise.
            await this.close();
            throw e;
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

        const result: PageFetchResult = await this.page.evaluate(async ({ url, method, headers, body }) => {
            try {
                const res = await fetch(url, { method, headers, body: body || undefined, credentials: 'include' });
                const bodyText = await res.text();
                return { ok: res.ok, status: res.status, url: res.url, bodyText, contentType: res.headers.get('content-type') || '' };
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

        return {
            status: result.status,
            ok: result.ok,
            url: result.url || url,
            headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? (result.contentType || null) : null) },
            text: async () => result.bodyText || '',
            arrayBuffer: async () => Buffer.from(result.bodyText || '', 'utf-8').buffer,
        };
    };

    async close(): Promise<void> {
        try { await this.browser?.close(); } catch { /* already closed */ }
        this.browser = null;
        this.context = null;
        this.page = null;
    }
}
