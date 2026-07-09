/**
 * NotebookLM MCP Server
 * 
 * Supports both Stdio and HTTP transports.
 * - Stdio: For programmatic clients or legacy integrations
 * - HTTP: For Claude Desktop via Connectors (use cloudflared tunnel)
 * 
 * Usage:
 *   Stdio mode:  node dist/server.js --stdio
 *   HTTP mode:   node dist/server.js (default, uses port 3001)
 * 
 * For Claude Desktop with MCP Apps UI:
 *   1. Run: node dist/server.js
 *   2. Run: npx cloudflared tunnel --url http://localhost:3001
 *   3. Add the generated URL as a Custom Connector in Claude Settings > Connectors
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
    registerAppTool,
    registerAppResource,
    RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import * as fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from 'url';
import { z } from "zod";
import { NotebookLMClient } from "./notebooklm_client.js";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
const LOG_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../server.log');
const HTTP_PORT = Number(process.env.PORT) || 3001;

// Public origin at which THIS server's HTTP endpoints are reachable from an END
// USER'S browser. The infographic image URL is embedded into generated apps,
// which run in remote browsers — so it must be an absolute, publicly-reachable
// URL, NOT localhost. In local dev the browser and server share a host, so the
// localhost default works. In a hosted deployment, set NOTEBOOKLM_PUBLIC_URL to
// the same public origin the Chrome extension already uses to reach this server
// (e.g. https://staging-api.doable.me). Trailing slash is trimmed so we can
// safely append paths.
const PUBLIC_BASE_URL = (process.env.NOTEBOOKLM_PUBLIC_URL || `http://localhost:${HTTP_PORT}`).replace(/\/+$/, "");

// --- State Management ---
interface ActiveNotebook {
    notebookId: string;
    url: string;
    title?: string;
    lastUsedAt: number;
    sourceIds?: string[];
}

// Per-user active notebooks — keyed by userToken (or '__legacy__' for no-token requests)
const activeNotebooksMap: Map<string, ActiveNotebook[]> = new Map();

function setActiveNotebook(url: string, notebookId: string, title?: string, sourceIds?: string[], userToken?: string) {
    const key = userToken || '__legacy__';
    let list = activeNotebooksMap.get(key) ?? [];
    list = list.filter(n => n.url !== url);
    list.unshift({ notebookId, url, title, lastUsedAt: Date.now(), sourceIds });
    if (list.length > 5) list.pop();
    activeNotebooksMap.set(key, list);
    logToFile(`[Session] Active notebook set for ${key}: ${url} (${notebookId})`);
}

function getActiveNotebook(userToken?: string): ActiveNotebook | null {
    const key = userToken || '__legacy__';
    const list = activeNotebooksMap.get(key) ?? [];
    return list.length > 0 ? list[0] : null;
}

// --- Async Job Queue for Infographic Generation ---
interface InfographicJob {
    id: string;
    videoUrl: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    imageUrl?: string;
    viewerUrl?: string;
    imageData?: string; // base64
    error?: string;
    createdAt: number;
    completedAt?: number;
    lastPolledAt?: number; // last time check_infographic_status answered for this job
}

// Minimum spacing enforced between two check_infographic_status answers for the
// same still-processing job. Enforced server-side (by holding the response, not
// just asking nicely in the tool description) because the calling model doesn't
// reliably honor a "wait 15s" instruction — a synchronous tool call is the only
// thing that actually throttles it: the caller can't get its next answer faster
// than we choose to give it.
const MIN_POLL_GAP_MS = 10000;

const infographicJobs = new Map<string, InfographicJob>();

// --- Per-User Re-Auth (SSE Push) ---
// Connected extension SSE clients, keyed by user token
import { Response as ExpressResponse } from 'express';
const reauthSseClients = new Map<string, Set<ExpressResponse>>();
const needsReauth = new Map<string, boolean>();

function pushReauthEvent(userToken: string) {
    const key = userToken || '__legacy__';
    needsReauth.set(key, true);

    const clients = reauthSseClients.get(key);
    if (clients && clients.size > 0) {
        const event = `data: ${JSON.stringify({ type: 'reauth', user_token: key })}\n\n`;
        for (const res of clients) {
            try { res.write(event); } catch (e) { /* client disconnected */ }
        }
        logToFile(`[SSE] Pushed reauth event to ${clients.size} client(s) for ${key}`);
    } else {
        // Fallback: Broadcast to ALL connected extensions (e.g. if legacy request failed using borrowed cookies)
        logToFile(`[SSE] No direct connection for ${key}. Broadcasting re-auth to ALL connected extensions...`);
        let broadcastCount = 0;
        for (const [otherKey, otherClients] of reauthSseClients.entries()) {
            if (otherClients && otherClients.size > 0) {
                const event = `data: ${JSON.stringify({ type: 'reauth', user_token: key })}\n\n`;
                for (const res of otherClients) {
                    try { res.write(event); broadcastCount++; } catch (e) { }
                }
            }
        }
        if (broadcastCount > 0) {
            logToFile(`[SSE] Broadcast re-auth to ${broadcastCount} other client(s).`);
        } else {
            logToFile(`[SSE] No connected extensions at all. User must manually re-sync.`);
        }
    }
}

function generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// Completed infographic images are persisted to this shared on-disk directory,
// keyed by job_id, so ANY process serving port 3001 can serve them. This matters
// because the tool call (which runs the job and holds job.imageData in memory)
// and the HTTP server that answers GET /infographic-image are often DIFFERENT
// processes: Doable spawns its own stdio child for tool calls, while a separate
// background instance owns the HTTP port. In-memory job state is not shared
// across those processes; the filesystem is.
const INFOGRAPHIC_DIR = path.resolve(__dirname, "../user_data/infographics");

// job_ids we generate are `job_<ts>_<rand>` — strictly [A-Za-z0-9_]. Reject
// anything else so a request path can never escape INFOGRAPHIC_DIR.
function safeJobFilePath(jobId: string): string | null {
    if (!/^[A-Za-z0-9_]+$/.test(jobId)) return null;
    return path.join(INFOGRAPHIC_DIR, `${jobId}.jpg`);
}

function persistInfographicImage(jobId: string, buffer: Buffer): void {
    const filePath = safeJobFilePath(jobId);
    if (!filePath) return;
    try {
        fsSync.mkdirSync(INFOGRAPHIC_DIR, { recursive: true });
        fsSync.writeFileSync(filePath, buffer);
        logToFile(`[Jobs] 💾 Persisted infographic image to ${filePath} (${buffer.length} bytes)`);
    } catch (e: any) {
        logToFile(`[Jobs] ⚠️ Failed to persist infographic image for ${jobId}: ${e.message}`);
    }
}

// Download the infographic bytes from Google's CDN, process to JPEG, then store
// them both in-memory (base64) and on disk. Returns the base64 string on success
// or null if the image could not be fetched.
//
// The download is retried a few times because the CDN hop occasionally 302s to a
// re-verification page on transient cookie hiccups. Crucially, a caller must NOT
// mark a job 'completed' when this returns null: NotebookLM generated the
// artifact but we never got the bytes, so reporting success would hand the model
// an image_url of null and it has nothing to embed (the exact "completed but
// image_url is null" failure). Mark the job 'failed' with an actionable error
// instead so the caller retries rather than flailing.
async function downloadAndStoreInfographic(
    client: { downloadResource(url: string): Promise<Buffer> },
    imageUrl: string,
    jobId: string
): Promise<string | null> {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const imageBytes = await client.downloadResource(imageUrl);
            const processedBuffer = await sharp(imageBytes, { failOnError: false })
                .resize({ width: 1024, withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            const base64 = processedBuffer.toString('base64');
            persistInfographicImage(jobId, processedBuffer);
            logToFile(`[Jobs] Image downloaded for ${jobId} (${base64.length} chars, attempt ${attempt}/${MAX_ATTEMPTS})`);
            return base64;
        } catch (err: any) {
            logToFile(`[Jobs] Image download attempt ${attempt}/${MAX_ATTEMPTS} failed for ${jobId}: ${err.message}`);
            if (attempt < MAX_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
            }
        }
    }
    logToFile(`[Jobs] ❌ Image download exhausted all ${MAX_ATTEMPTS} attempts for ${jobId} (url: ${imageUrl.substring(0, 80)}...)`);
    return null;
}

const INFOGRAPHIC_DOWNLOAD_ERROR = 'The infographic was generated but its image could not be downloaded from Google (session/CDN hiccup). This is usually transient — please try generating the infographic again.';

// Shared completed/failed formatting for check_infographic_status, used both on
// the normal path and after MIN_POLL_GAP_MS was enforced and the job turned out
// to have finished during the hold.
function handleFinalJobStatus(job: InfographicJob, jobId: string) {
    if (job.status === 'failed') {
        return { content: [{ type: "text" as const, text: `❌ Job failed: ${job.error}` }], isError: true };
    }

    logToFile(`[Jobs] Returning completed job ${jobId}, hasImageData: ${!!job.imageData}, imageDataLength: ${job.imageData?.length || 0}`);

    const responseContent: any[] = [{
        type: "text" as const,
        text: JSON.stringify({
            status: "completed",
            job_id: jobId,
            image_url: job.imageData ? `${PUBLIC_BASE_URL}/infographic-image/${jobId}` : null,
            elapsed_s: Math.round((job.completedAt! - job.createdAt) / 1000)
        })
    }];

    if (job.imageData) {
        responseContent.push({
            type: "image" as const,
            data: job.imageData,
            mimeType: "image/jpeg"
        });
    }

    return { content: responseContent };
}

// Cleanup old jobs (older than 10 minutes)
function cleanupOldJobs() {
    const TEN_MINUTES = 10 * 60 * 1000;
    const now = Date.now();
    for (const [id, job] of infographicJobs.entries()) {
        if (now - job.createdAt > TEN_MINUTES) {
            infographicJobs.delete(id);
            const filePath = safeJobFilePath(id);
            if (filePath) fsSync.promises.unlink(filePath).catch(() => {});
            logToFile(`[Jobs] Cleaned up old job: ${id}`);
        }
    }
}

// --- DEBUG LOGGING ---
function logToFile(msg: string) {
    const timestamp = new Date().toLocaleString();
    try {
        fsSync.appendFileSync(LOG_FILE, `[${timestamp}] ${msg}\n`);
    } catch { }
    console.error(`[${timestamp}] ${msg}`);
}

// --- Cookie & User Management ---
import { NativeFetchClient, NotebookDisambiguationNeeded } from "./native_fetch_client.js";
import { PlaywrightTransport } from "./playwright_transport.js";
import {
    type ChromeCookie,
    generateUserToken,
    registerUser,
    deleteUser,
    listUsers,
    updateUserLabel,
    setCookiesFromExtension,
    getCookiesForUser,
    hasFreshCookies,
    getUserCookiesMap,
    loadAllCookies,
    loadUserRegistry,
} from "./user-manager.js";

// Load persisted state on startup
loadUserRegistry();
loadAllCookies();

// --- Per-User Client Management ---
const userClients: Map<string, { client: NativeFetchClient | NotebookLMClient, isNative: boolean, transportHandle?: PlaywrightTransport }> = new Map();

async function evictUserClient(key: string) {
    const existing = userClients.get(key);
    if (!existing) return;
    userClients.delete(key);
    if (existing.transportHandle) {
        try { await existing.transportHandle.close(); } catch { }
    } else if (!existing.isNative) {
        try { await (existing.client as NotebookLMClient).stop(); } catch { }
    }
}

async function getClient(userToken?: string): Promise<NotebookLMClient | NativeFetchClient> {
    const clientKey = userToken || '__legacy__';
    const { cookies, fresh, userAgent } = getCookiesForUser(userToken);

    // If we have fresh cookies for this user, prefer NativeFetchClient, routed
    // through a real Playwright-controlled Chromium page rather than Node's
    // own fetch — the requests then carry a genuine browser TLS/HTTP2
    // fingerprint, so Google's session-binding checks have nothing to flag.
    if (fresh && cookies.length > 0) {
        const existing = userClients.get(clientKey);
        if (!existing || !existing.isNative) {
            logToFile(`[Client] 🎭 Using NativeFetchClient + Playwright in-page transport for ${userToken || 'legacy user'}`);
            await evictUserClient(clientKey);

            const headlessEnv = process.env.NOTEBOOKLM_HEADLESS;
            const headless = headlessEnv === undefined ? true : headlessEnv === "true";
            const transportHandle = new PlaywrightTransport();
            await transportHandle.init(cookies, headless, userAgent);

            const client = new NativeFetchClient(cookies, userAgent, transportHandle.fetch, clientKey, transportHandle.fetchBinary.bind(transportHandle));
            await client.start();
            userClients.set(clientKey, { client, isNative: true, transportHandle });
        }
        const nativeClient = userClients.get(clientKey)!.client as NativeFetchClient;
        // Fire-and-forget: self-rate-limited to once per 20 minutes internally,
        // so this is a cheap no-op on most calls and never blocks the actual
        // tool request waiting on it. See NativeFetchClient.reconcileCache().
        nativeClient.reconcileCache().catch(e =>
            logToFile(`[Client] reconcileCache background error (non-fatal): ${e.message}`)
        );
        return nativeClient;
    }

    // Fallback to Playwright client (shared singleton for legacy mode)
    const existing = userClients.get(clientKey);
    if (!existing || existing.isNative) {
        logToFile(`[Client] 🎭 Falling back to Playwright NotebookLMClient for ${userToken || 'legacy user'}`);
        const headlessEnv = process.env.NOTEBOOKLM_HEADLESS;
        const headless = headlessEnv === undefined ? true : headlessEnv === "true";
        await evictUserClient(clientKey);
        const client = new NotebookLMClient(headless, clientKey);
        await client.start();
        userClients.set(clientKey, { client, isNative: false });
        logToFile("NotebookLMClient started successfully.");
    }
    return userClients.get(clientKey)!.client;
}

// --- Resource URI ---
const resourceUri = "ui://infographic/view.html";

// --- Tool & Resource Registration ---
// --- Tool & Resource Registration ---
function registerTools(server: McpServer) {
    // Register AppResource (serves bundled HTML for MCP App UI)
    registerAppResource(
        server,
        resourceUri,
        resourceUri,
        { mimeType: RESOURCE_MIME_TYPE },
        async () => {
            logToFile(`[MCP] Resource requested: ${resourceUri}`);
            try {
                const htmlPath = path.join(__dirname, "../dist/src/mcp-app.html");
                logToFile(`[MCP] Serving UI from: ${htmlPath}`);
                const html = await fs.readFile(htmlPath, "utf-8");
                return {
                    contents: [
                        { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html },
                    ],
                };
            } catch (e) {
                logToFile(`Failed to read mcp-app.html: ${e}`);
                throw e;
            }
        }
    );

    // --- Helper for wrapping errors ---
    const wrapError = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

    // --- Helper: same source found in multiple notebooks ---
    // Not treated as an error (isError is omitted) — this is a normal fork in
    // the flow that needs a human decision, not a failure. The instruction is
    // deliberately blunt ("STOP", "do NOT guess") because a model asked
    // nicely to "wait for input" will otherwise just pick one and move on.
    function buildDisambiguationResponse(e: NotebookDisambiguationNeeded) {
        const optionsList = e.candidates
            .map((c, i) => `${i + 1}. **${c.title || '(untitled notebook)'}** — notebook_id: \`${c.notebookId}\``)
            .join('\n');
        return {
            content: [{
                type: "text" as const,
                text: `🔀 **This source already exists in ${e.candidates.length} different notebooks.**\n\n${optionsList}\n\n` +
                    `STOP here — do NOT guess or auto-pick one. Ask the user which notebook they want to use (show them the titles above), and WAIT for their reply before doing anything else. ` +
                    `Once they answer, call this same tool again with the identical url and notebook_id set to the notebookId of the one they chose.`
            }],
            meta: { status: "disambiguation_required", candidates: e.candidates }
        };
    }

    // --- Tool: ping (Debug) ---
    server.tool(
        "ping",
        "A simple ping tool to verify tool discovery works.",
        { message: z.string().optional() },
        async ({ message }) => {
            return {
                content: [{ type: "text", text: `Pong! You said: ${message || "nothing"}` }]
            };
        }
    );

    // --- Tool: sync_cookies (Stdio cookie injection) ---
    server.tool(
        "sync_cookies",
        "Injects Google authentication cookies so the server can access NotebookLM on your behalf. Pass the cookies array as a JSON string (same format the Chrome extension sends). Useful when running in stdio mode where the HTTP /sync-cookies endpoint is not available.",
        {
            cookies: z.string().describe("JSON array of Chrome cookie objects with fields: name, value, domain, path, secure, httpOnly, expirationDate (optional)."),
            user_token: z.string().optional().describe("Optional user token for multi-user setups. Omit for single-user (legacy) mode."),
            user_agent: z.string().optional().describe("Optional User-Agent string from the browser."),
        },
        async ({ cookies, user_token, user_agent }) => {
            let parsed: ChromeCookie[];
            try {
                parsed = JSON.parse(cookies);
                if (!Array.isArray(parsed)) throw new Error("cookies must be a JSON array");
            } catch (e: any) {
                return wrapError(`Failed to parse cookies JSON: ${e.message}`);
            }
            setCookiesFromExtension(parsed, user_token, user_agent);
            return {
                content: [{
                    type: "text",
                    text: `✅ Synced ${parsed.length} cookies${user_token ? ` for user ${user_token}` : " (legacy mode)"}.`
                }]
            };
        }
    );

    // --- Tool: generate_summary (Standard MCP) ---
    logToFile("Registering tool: generate_summary");
    server.tool(
        "generate_summary",
        "Generates a comprehensive summary of a YouTube video or NotebookLM notebook content. Side-effect: Sets this as the active notebook. If the source already exists in more than one notebook, returns a disambiguation prompt instead of guessing — when that happens, ask the user which one to use, wait for their answer, then call this tool again with the same url and notebook_id set to their choice.",
        {
            url: z.string().url().describe("The URL of the YouTube video OR a direct NotebookLM link. Optional if an active notebook exists in the session."),
            user_token: z.string().optional().describe("Optional user token for multi-user mode. Get this from the /register.html page and configure your extension with it."),
            notebook_id: z.string().optional().describe("Only set this after the user answered a 'this source exists in multiple notebooks' prompt from a previous call — pass the notebookId they chose. Omit on the first call.")
        },
        async (args) => {
            const targetUrl = args.url;
            const userToken = args.user_token;
            const notebookIdOverride = args.notebook_id;
            logToFile(`[MCP] Request: Summary for ${targetUrl} (user: ${userToken || 'legacy'})`);
            let notebookId = "unknown";
            try {
                const client = await getClient(userToken);

                // Race the summary against a 40s timeout to beat Cloudflare's ~60s limit
                const SUMMARY_TIMEOUT = 40000;
                const summaryPromise = client.generateSummary(targetUrl, notebookIdOverride);
                const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), SUMMARY_TIMEOUT));
                const summary = await Promise.race([summaryPromise, timeoutPromise]);

                // Update Session State
                notebookId = client._parseNotebookUrl(targetUrl) || "unknown";
                setActiveNotebook(targetUrl, notebookId, undefined, undefined, userToken);

                if (summary === null) {
                    logToFile(`[MCP] Summary timed out after ${SUMMARY_TIMEOUT / 1000}s for ${targetUrl}`);
                    return {
                        content: [{ type: "text", text: `⏳ **Summary is taking longer than expected.**\n\nThe notebook is loaded and processing. Please try asking again in a moment — it should be much faster on retry since the notebook is now cached.` }],
                    };
                }

                return {
                    content: [{ type: "text", text: `📝 **Summary Generated**\n\n${summary}` }],
                    meta: { source: targetUrl, notebookId }
                };
            } catch (e: any) {
                if (e instanceof NotebookDisambiguationNeeded) {
                    return buildDisambiguationResponse(e);
                }
                // AUTH FAILURE HANDLER
                if (e.message.includes("Authentication required")) {
                    const reauthKey = userToken || '__legacy__';
                    pushReauthEvent(reauthKey);
                    logToFile(`[MCP] ⚠️ Summary auth failed. Pushed reauth event for ${reauthKey}.`);
                    return {
                        content: [{ type: "text", text: `🔐 **Authentication needed.** Your browser extension should prompt you to log in. Please try again after logging in.` }],
                        isError: true
                    };
                }
                logToFile(`Error: ${e.message}`);
                return { content: [{ type: "text", text: `Error generating summary: ${e.message}` }], isError: true };
            }
        }
    );

    // --- Tool: get_active_notebook ---
    logToFile("Registering tool: get_active_notebook");
    server.tool(
        "get_active_notebook",
        "Returns the most recently used notebook in this session. Use this to resolve references like 'that notebook' or 'it'.",
        { user_token: z.string().optional().describe("Optional user token for multi-user mode.") },
        async (args) => {
            const nb = getActiveNotebook(args.user_token);
            return {
                content: [{ type: "text" as const, text: JSON.stringify(nb, null, 2) }],
                meta: { activeNotebook: nb }
            };
        }
    );

    // --- Tool: list_sources (MCP App Enabled) ---
    logToFile("Registering tool: list_sources");
    registerAppTool(
        server,
        "list_sources",
        {
            title: "List Sources",
            description: "Lists all sources in a NotebookLM notebook. Returns source IDs, titles, types, and original URLs. Side-effect: Sets this as the active notebook.",
            inputSchema: z.object({
                url: z.string().url().describe("The URL of the NotebookLM notebook."),
                user_token: z.string().optional().describe("Optional user token for multi-user mode.")
            }) as any,
            _meta: { ui: { resourceUri } },
        },
        async (args: any) => {
            const url = args.url;
            const userToken = args.user_token;
            logToFile(`[MCP] Request: List Sources for ${url} (user: ${userToken || 'legacy'})`);
            try {
                const client = await getClient(userToken);
                const sources = await client.listSources(url);

                // Update Session State
                const notebookId = client._parseNotebookUrl(url) || "unknown";
                setActiveNotebook(url, notebookId, undefined, sources.map(s => s.sourceId), userToken);

                // Format as markdown list for UI
                const sourceList = sources.map(s => `- **${s.title}** (${s.type})\n  Link: [Open](${s.originalUrl || '#'}) | ID: \`${s.sourceId}\``).join('\n\n');

                return {
                    content: [{ type: "text" as const, text: `📚 **Notebook Sources**\n\n${sourceList}` }],
                    meta: { count: sources.length, sources }
                };
            } catch (e: any) {
                return wrapError(`Error listing sources: ${e.message}`);
            }
        }
    );

    // --- Tool: list_notebooks ---
    // Ground truth from NotebookLM's own account-wide notebook list (the same
    // RPC its home page uses to render "Recent notebooks") — independent of
    // our local notebook_cache, which is a URL->notebookId mapping we maintain
    // ourselves and can get out of sync (e.g. after a notebook is deleted, or
    // when duplicates pile up). Useful for spotting duplicate notebooks for
    // the same source, or confirming what actually exists before troubleshooting
    // a stuck job.
    logToFile("Registering tool: list_notebooks");
    server.tool(
        "list_notebooks",
        "Lists every notebook in the NotebookLM account directly from Google (not from any local cache), each with its title and sources. Use this to see what notebooks actually exist — e.g. to spot duplicates holding the same source, or to confirm a notebook wasn't actually deleted.",
        { user_token: z.string().optional().describe("Optional user token for multi-user mode.") },
        async (args) => {
            const userToken = args.user_token;
            logToFile(`[MCP] Request: List Notebooks (user: ${userToken || 'legacy'})`);
            try {
                const client = await getClient(userToken);
                if (!(client instanceof NativeFetchClient)) {
                    return { content: [{ type: "text", text: "list_notebooks requires fresh synced cookies (native-fetch mode). Please re-sync via the Chrome extension." }], isError: true };
                }
                const notebooks = await client.listAllNotebooks();

                const formatted = notebooks.map(nb => {
                    const sourceLines = nb.sources.map(s => `  - ${s.title}${s.originalUrl ? ` (${s.originalUrl})` : ''}`).join('\n');
                    return `**${nb.emoji ?? ''} ${nb.title}** (\`${nb.notebookId}\`)\n${sourceLines || '  (no sources)'}`;
                }).join('\n\n');

                return {
                    content: [{ type: "text" as const, text: `📓 **${notebooks.length} Notebook(s)**\n\n${formatted}` }],
                    meta: { count: notebooks.length, notebooks }
                };
            } catch (e: any) {
                logToFile(`[MCP] list_notebooks error: ${e.message}`);
                return { content: [{ type: "text", text: `Error listing notebooks: ${e.message}` }], isError: true };
            }
        }
    );

    // --- Tool: ask_question (MCP App Enabled) ---
    logToFile("Registering tool: ask_question");
    registerAppTool(
        server,
        "ask_question",
        {
            title: "Ask Question",
            description: "Asks a question about the active video/notebook. USE THIS TOOL for any follow-up questions about the content, even if no URL is provided (it will use the active session). Do not answer from general knowledge if the user is asking about the video's topic. If the source already exists in more than one notebook, returns a disambiguation prompt instead of guessing — ask the user which one to use, wait for their answer, then call this tool again with the same url and notebook_id set to their choice.",
            inputSchema: z.object({
                url: z.string().url().optional().describe("The URL of the YouTube video OR a direct NotebookLM link. Optional if an active notebook exists in the session."),
                question: z.string().describe("The question to ask"),
                source_id: z.string().optional().describe("Optional: The specific Source ID to target (if known from list_sources)."),
                user_token: z.string().optional().describe("Optional user token for multi-user mode."),
                notebook_id: z.string().optional().describe("Only set this after the user answered a 'this source exists in multiple notebooks' prompt from a previous call — pass the notebookId they chose. Omit on the first call.")
            }) as any,
            _meta: { ui: { resourceUri } },
        },
        async (args: any) => {
            const userToken = args.user_token;
            const targetUrl = args.url || getActiveNotebook(userToken)?.url;
            const question = args.question;
            const source_id = args.source_id;
            const notebookIdOverride = args.notebook_id;

            if (!targetUrl) {
                return wrapError("No URL provided and no active notebook in session. Please provide a URL.");
            }

            logToFile(`[MCP] Request: Question for ${targetUrl}: "${question}" (user: ${userToken || 'legacy'})`);
            try {
                const client = await getClient(userToken);

                // Race against 40s timeout to beat Cloudflare's ~60s limit
                const QUERY_TIMEOUT = 40000;
                const queryPromise = client.query(targetUrl, question, source_id, notebookIdOverride);
                const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), QUERY_TIMEOUT));
                const answer = await Promise.race([queryPromise, timeoutPromise]);

                // Update Session State
                const notebookId = client._parseNotebookUrl(targetUrl) || "unknown";
                setActiveNotebook(targetUrl, notebookId, undefined, undefined, userToken);

                if (answer === null) {
                    logToFile(`[MCP] Question timed out after ${QUERY_TIMEOUT / 1000}s`);
                    return {
                        content: [{ type: "text" as const, text: `⏳ **Taking longer than expected.** The notebook is loaded. Please ask your question again — it should work on retry.` }],
                    };
                }

                return {
                    content: [{ type: "text" as const, text: `❓ **Question:** ${question}\n\n💡 **Answer:**\n${answer}` }],
                    meta: { sourceId: source_id || "auto", source: targetUrl, notebookId }
                };
            } catch (e: any) {
                if (e instanceof NotebookDisambiguationNeeded) {
                    return buildDisambiguationResponse(e);
                }
                if (e.message.includes("Authentication required")) {
                    const reauthKey = userToken || '__legacy__';
                    pushReauthEvent(reauthKey);
                    logToFile(`[MCP] ⚠️ Question auth failed. Pushed reauth event for ${reauthKey}.`);
                    return {
                        content: [{ type: "text" as const, text: `🔐 **Authentication needed.** Your browser extension should prompt you to log in. Please try again after logging in.` }],
                        isError: true
                    };
                }
                logToFile(`Error: ${e.message}`);
                return wrapError(`Error asking question: ${e.message}`);
            }
        }
    );

    // --- Tool: generate_infographic (ASYNC - Returns job ID immediately) ---
    logToFile("Registering tool: generate_infographic");
    server.tool(
        "generate_infographic",
        "Generates a visual infographic. Accepts a YouTube video URL OR a NotebookLM notebook URL. ALWAYS call this tool when the user asks to 'show', 'display', or 'embed' an infographic — do NOT use get_active_notebook as a substitute. When complete, returns JSON with image_url (a ready-to-use absolute image URL — the server already downloaded and processed the image; this URL just serves those bytes). ALWAYS embed image_url directly and verbatim as <img src={image_url}> in the generated app. Do NOT fetch the URL yourself and inline it as base64 — the whole point of image_url is that the browser loads it directly, so nothing needs to pass through you. Do NOT use the raw Google CDN URL either, as it requires user authentication. If status is 'processing', call check_infographic_status with the job_id to poll until complete. If the source already exists in more than one notebook, or an infographic already exists for this source, this tool returns a prompt instead of guessing — ask the user, wait for their answer, then call this tool again with notebook_id and/or regenerate set accordingly.",
        {
            video_url: z.string().describe("YouTube video URL or NotebookLM notebook URL (e.g. https://notebooklm.google.com/notebook/xxx)"),
            user_token: z.string().optional().describe("Optional user token for multi-user mode."),
            notebook_id: z.string().optional().describe("Only set this after the user answered a 'this source exists in multiple notebooks' prompt from a previous call — pass the notebookId they chose. Omit on the first call."),
            regenerate: z.boolean().optional().describe("Only set this after the user answered an 'an infographic already exists' prompt from a previous call. false = reuse the existing infographic. true = generate a brand-new one even though one already exists. Omit on the first call for a given source.")
        },
        async (args: any) => {
            // Guard: AI sometimes wraps args in inputSchema due to other tools using registerAppTool
            const flat = args.inputSchema ?? args;
            const video_url = flat.video_url;
            const userToken: string | undefined = flat.user_token;
            const notebookIdOverride: string | undefined = flat.notebook_id;
            const regenerate: boolean | undefined = flat.regenerate;
            logToFile(`[MCP] Request: Infographic for ${video_url} (user: ${userToken || 'legacy'})`);

            // Cleanup old jobs
            cleanupOldJobs();

            // --- Deduplication: Reuse in-flight job for same video + user ---
            const userKey = userToken || '__legacy__';
            let job: InfographicJob | undefined;
            let jobId: string = '';
            for (const [existingId, existingJob] of infographicJobs) {
                if (
                    existingJob.videoUrl === video_url &&
                    (existingJob.status === 'pending' || existingJob.status === 'processing') &&
                    (Date.now() - existingJob.createdAt) < 300000 // Only reuse if less than 5 min old
                ) {
                    job = existingJob;
                    jobId = existingId;
                    logToFile(`[Jobs] ♻️ Reusing existing in-flight job ${jobId} for ${video_url} (dedup)`);
                    break;
                }
            }

            if (!job) {
                // Resolve the notebook + check whether an infographic already
                // exists BEFORE creating any job, so a "multiple notebooks" or
                // "infographic already exists" question can be asked without
                // kicking off wasted work while we wait for the user's answer.
                // Native-fetch only (matches list_notebooks' precedent) — the
                // legacy Playwright client has no equivalent pre-check.
                const precheckClient = await getClient(userToken);
                if (precheckClient instanceof NativeFetchClient) {
                    try {
                        const target = await precheckClient.resolveInfographicTarget(video_url, notebookIdOverride);
                        if (target.existingImageUrl && regenerate === undefined) {
                            logToFile(`[Jobs] Infographic already exists for ${video_url} on notebook ${target.notebookId} — asking user to confirm reuse vs regenerate.`);
                            return {
                                content: [{
                                    type: "text" as const,
                                    text: `🖼️ **An infographic already exists for this source.**\n\n` +
                                        `STOP here — do NOT decide on your own. Ask the user: do they want to reuse the existing infographic, or generate a brand-new one? WAIT for their answer.\n\n` +
                                        `Once they answer, call generate_infographic again with the same video_url and:\n` +
                                        `- regenerate=false to reuse the existing infographic\n` +
                                        `- regenerate=true to generate a new one`
                                }],
                                meta: { status: "confirmation_required", notebookId: target.notebookId }
                            };
                        }
                    } catch (e: any) {
                        if (e instanceof NotebookDisambiguationNeeded) {
                            return buildDisambiguationResponse(e);
                        }
                        if (e.message?.includes("Authentication required")) {
                            const reauthKey = userToken || '__legacy__';
                            pushReauthEvent(reauthKey);
                            logToFile(`[MCP] ⚠️ Infographic pre-check auth failed. Pushed reauth event for ${reauthKey}.`);
                            return {
                                content: [{ type: "text" as const, text: `🔐 **Authentication needed.** Your browser extension should prompt you to log in. Please try again after logging in.` }],
                                isError: true
                            };
                        }
                        // Any other pre-check failure (e.g. a transient RPC hiccup)
                        // is non-fatal — fall through to the normal job-creation
                        // path below, which surfaces the real error there via the
                        // async job's own error handling.
                        logToFile(`[Jobs] Infographic pre-check failed non-fatally for ${video_url}: ${e.message}`);
                    }
                }

                // Create new job
                jobId = generateJobId();
                job = {
                    id: jobId,
                    videoUrl: video_url,
                    status: 'pending',
                    createdAt: Date.now()
                };
                infographicJobs.set(jobId, job);
                logToFile(`[Jobs] Created job ${jobId} for ${video_url}`);

                // Start async processing (don't await!)
                (async () => {
                    try {
                        job.status = 'processing';
                        logToFile(`[Jobs] Processing job ${jobId}...`);

                        // Note: getClient handles choosing correct cookies based on userToken
                        const client = await getClient(userToken);

                        // Ensure browser is healthy before operations
                        await client.ensureBrowserReady();

                        const imageUrl = await client.generateInfographic(video_url, { notebookIdOverride, forceNew: regenerate === true });
                        logToFile(`[Jobs] Job ${jobId} got image URL: ${imageUrl}`);

                        // Store image info but don't mark complete yet
                        job.imageUrl = imageUrl;
                        job.viewerUrl = `http://localhost:${HTTP_PORT}/view?url=${encodeURIComponent(imageUrl)}${userToken ? `&user_token=${userToken}` : ''}`;

                        // Download and embed image BEFORE marking complete. Only a
                        // job with real image bytes may be reported 'completed' —
                        // otherwise image_url would be null and the model has
                        // nothing to embed.
                        const imageData = await downloadAndStoreInfographic(client, imageUrl, jobId);
                        if (imageData) {
                            job.imageData = imageData;
                            job.status = 'completed';
                            job.completedAt = Date.now();
                            logToFile(`[Jobs] Job ${jobId} completed, hasImageData: true`);
                        } else {
                            job.status = 'failed';
                            job.error = INFOGRAPHIC_DOWNLOAD_ERROR;
                            job.completedAt = Date.now();
                            logToFile(`[Jobs] Job ${jobId} FAILED: artifact generated (${imageUrl.substring(0, 80)}...) but image download failed.`);
                        }
                    } catch (e: any) {
                        if (e.message.includes("Authentication required")) {
                            // ---- FLAG FOR EXTENSION RE-AUTH ----
                            const reauthKey = userToken || '__legacy__';
                            pushReauthEvent(reauthKey);
                            logToFile(`[Jobs] ⚠️ Auth failed for job ${jobId}. Pushed reauth event for ${reauthKey}. Waiting for extension to re-sync cookies...`);

                            // Wait up to 120s for the extension to re-sync fresh cookies
                            const REAUTH_TIMEOUT = 120000;
                            const REAUTH_POLL = 3000;
                            const reauthStart = Date.now();
                            let reauthSucceeded = false;

                            while (Date.now() - reauthStart < REAUTH_TIMEOUT) {
                                await new Promise(resolve => setTimeout(resolve, REAUTH_POLL));
                                if (!needsReauth.get(reauthKey)) {
                                    // Extension re-synced! needsReauth was cleared by /sync-cookies
                                    // (only observable here if this job is running in the SAME
                                    // process that handled the /sync-cookies request).
                                    reauthSucceeded = true;
                                    break;
                                }
                                // needsReauth is a plain in-memory Map — when this job runs in a
                                // stdio child process (spawned per MCP call) it is a DIFFERENT
                                // process than the long-lived HTTP server that handles
                                // /sync-cookies, so that flag can never be cleared from here and
                                // this branch alone would always time out even after a real
                                // re-sync. Cookies themselves ARE shared cross-process via disk
                                // (see refreshCookiesFromDisk), so fall back to checking whether a
                                // NEW cookie sync landed after we started waiting.
                                const { fresh, receivedAt } = getCookiesForUser(userToken);
                                if (fresh && receivedAt && receivedAt > reauthStart) {
                                    needsReauth.set(reauthKey, false);
                                    reauthSucceeded = true;
                                    break;
                                }
                            }

                            if (reauthSucceeded) {
                                logToFile(`[Jobs] ✅ Fresh cookies received! Retrying job ${jobId}...`);
                                try {
                                    // Remove old broken client (closes its Playwright browser, if any)
                                    await evictUserClient(reauthKey);
                                    const freshClient = await getClient(userToken);
                                    await freshClient.ensureBrowserReady();

                                    const imageUrl = await freshClient.generateInfographic(video_url, { notebookIdOverride, forceNew: regenerate === true });
                                    logToFile(`[Jobs] Job ${jobId} got image URL after re-auth: ${imageUrl}`);

                                    job.imageUrl = imageUrl;
                                    job.viewerUrl = `http://localhost:${HTTP_PORT}/view?url=${encodeURIComponent(imageUrl)}${userToken ? `&user_token=${userToken}` : ''}`;

                                    const imageData = await downloadAndStoreInfographic(freshClient, imageUrl, jobId);
                                    if (imageData) {
                                        job.imageData = imageData;
                                        job.status = 'completed';
                                        job.completedAt = Date.now();
                                        logToFile(`[Jobs] ✅ Job ${jobId} completed after re-auth!`);
                                    } else {
                                        job.status = 'failed';
                                        job.error = INFOGRAPHIC_DOWNLOAD_ERROR;
                                        job.completedAt = Date.now();
                                        logToFile(`[Jobs] Job ${jobId} FAILED after re-auth: artifact generated but image download failed.`);
                                    }
                                    return;
                                } catch (retryErr: any) {
                                    logToFile(`[Jobs] Retry after re-auth failed for ${jobId}: ${retryErr.message}`);
                                    job.status = 'failed';
                                    job.error = `Re-auth succeeded but retry failed: ${retryErr.message}`;
                                    job.completedAt = Date.now();
                                    return;
                                }
                            } else {
                                logToFile(`[Jobs] ⏰ Re-auth timeout for job ${jobId}. User did not re-sync cookies within 120s.`);
                                needsReauth.delete(reauthKey);
                                job.status = 'failed';
                                job.error = 'Session expired. Please re-sync your cookies using the Chrome extension, then try again.';
                                job.completedAt = Date.now();
                                return;
                            }
                        }
                        // Non-auth error: just fail normally
                        logToFile(`[Jobs] Job ${jobId} failed: ${e.message}`);
                        job.status = 'failed';
                        job.error = e.message;
                        job.completedAt = Date.now();
                    }
                })();
            }

            // Wait for completion (up to 10s)
            const MAX_WAIT = 10000; // 10 seconds (User requested fast feedback)
            const POLL_INTERVAL = 2000; // 2 seconds — must be < MAX_WAIT!
            const startTime = Date.now();
            logToFile(`[Jobs] Waiting for job ${jobId} to complete (streaming mode)...`);

            while (Date.now() - startTime < MAX_WAIT) {
                if (job.status === 'completed') {
                    // Completed! Return with image for MCP App viewer
                    logToFile(`[Jobs] Returning completed job ${jobId} immediately.`);

                    const responseContent: any[] = [{
                        type: "text" as const,
                        text: JSON.stringify({
                            status: "completed",
                            job_id: jobId,
                            image_url: job.imageData ? `${PUBLIC_BASE_URL}/infographic-image/${jobId}` : null,
                            elapsed_s: Math.round((job.completedAt! - job.createdAt) / 1000)
                        })
                    }];

                    // Add embedded image for MCP App viewer
                    if (job.imageData) {
                        responseContent.push({
                            type: "image" as const,
                            data: job.imageData,
                            mimeType: "image/jpeg"
                        });
                    }
                    return { content: responseContent };
                }

                if (job.status === 'failed') {
                    return { content: [{ type: "text" as const, text: `❌ Job failed: ${job.error}` }], isError: true };
                }

                await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
            }

            // Timeout Fallback
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ status: "processing", job_id: jobId })
                }]
            };
        },
    );

    // --- Tool: check_infographic_status (MCP App Enabled for image display) ---
    logToFile("Registering tool: check_infographic_status");
    registerAppTool(
        server,
        "check_infographic_status",
        {
            title: "Check Infographic Status",
            description: "Polls a generate_infographic job. Returns {status, job_id, image_url, elapsed_s} when complete. Keep calling until status is 'completed' — the call itself will not return until it's been at least 10s since the job was last polled, so just call it again immediately in a loop; no need to add your own delay. Then embed image_url directly and verbatim as <img src={image_url}> — do not fetch it and inline as base64, and never use the raw Google CDN URL.",
            inputSchema: z.object({
                job_id: z.string().describe("The job ID returned by generate_infographic"),
                user_token: z.string().optional().describe("Optional user token for multi-user mode.")
            }) as any,
            _meta: { ui: { resourceUri } },
        },
        async (args: any) => {
            const job_id = args.job_id;
            const userToken = args.user_token;
            logToFile(`[Jobs] Checking status for job: ${job_id} (user: ${userToken || 'legacy'})`);

            const job = infographicJobs.get(job_id);
            if (!job) {
                return { content: [{ type: "text" as const, text: `❌ Job not found: ${job_id}. Jobs expire after 10 minutes.` }], isError: true };
            }

            if (job.status === 'pending' || job.status === 'processing') {
                // Hold the response until at least MIN_POLL_GAP_MS has passed since
                // this job was last polled (or created, on the first poll). A tool
                // description asking the model to "wait 15s between calls" is only
                // advisory — models re-poll within a few seconds anyway. Delaying the
                // response here is what actually guarantees the spacing: the caller
                // can't get an answer any sooner than we choose to return one.
                const sinceLastPoll = Date.now() - (job.lastPolledAt ?? job.createdAt);
                if (sinceLastPoll < MIN_POLL_GAP_MS) {
                    const waitMs = MIN_POLL_GAP_MS - sinceLastPoll;
                    logToFile(`[Jobs] check_infographic_status for ${job_id} called ${sinceLastPoll}ms after last poll — holding response for ${waitMs}ms to enforce ${MIN_POLL_GAP_MS}ms minimum gap.`);
                    await new Promise(resolve => setTimeout(resolve, waitMs));
                }

                // Re-fetch: the job may have completed/failed while we were holding.
                const latest = infographicJobs.get(job_id) ?? job;
                latest.lastPolledAt = Date.now();

                if (latest.status === 'pending' || latest.status === 'processing') {
                    const elapsed = Math.round((Date.now() - latest.createdAt) / 1000);
                    return {
                        content: [{
                            type: "text" as const,
                            text: JSON.stringify({ status: latest.status, job_id, elapsed_s: elapsed })
                        }]
                    };
                }
                // Fell through to completed/failed after the hold — handle below with `latest`.
                return handleFinalJobStatus(latest, job_id);
            }

            return handleFinalJobStatus(job, job_id);
        }
    );

    logToFile("All tools registered.");
}

// --- HTTP Server Setup ---
function startHttpServer(server: McpServer) {
    const expressApp = express();

    // Middleware
    expressApp.use((req, res, next) => {
        logToFile(`[HTTP] ${req.method} ${req.url}`);
        next();
    });

    expressApp.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
    }));
    expressApp.use(express.json({ limit: '10mb' }));

    // --- User Registration Endpoint ---
    expressApp.get("/register", (req, res) => {
        const label = (req.query.label as string) || undefined;
        const token = generateUserToken();
        registerUser(token, label);
        logToFile(`[Register] Generated new user token: ${token}${label ? ` (label: ${label})` : ''}`);
        res.json({
            success: true,
            user_token: token,
            instructions: "Copy this token into your Chrome extension settings, then sync your cookies."
        });
    });

    // Serve a simple registration page
    expressApp.get("/register.html", (req, res) => {
        res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>NotebookLM MCP - User Registration</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: #eee; }
        h1 { color: #00d4ff; }
        .token-box { background: #16213e; padding: 20px; border-radius: 10px; margin: 20px 0; font-family: monospace; font-size: 18px; word-break: break-all; }
        button { background: #00d4ff; color: #1a1a2e; border: none; padding: 12px 24px; font-size: 16px; cursor: pointer; border-radius: 5px; margin: 10px 5px 10px 0; }
        button:hover { background: #00b4dd; }
        .instructions { background: #16213e; padding: 15px; border-radius: 10px; margin-top: 20px; }
        .instructions ol { padding-left: 20px; }
        .instructions li { margin: 10px 0; }
    </style>
</head>
<body>
    <h1>🔐 NotebookLM MCP Registration</h1>
    <p>Generate a unique token to link your Google account with this server.</p>
    <button onclick="generateToken()">Generate New Token</button>
    <div id="tokenDisplay" class="token-box" style="display:none;">
        <strong>Your Token:</strong><br><br>
        <span id="token"></span>
        <br><br>
        <button onclick="copyToken()">📋 Copy Token</button>
    </div>
    <div class="instructions">
        <h3>📋 Instructions</h3>
        <ol>
            <li>Click "Generate New Token" above</li>
            <li>Copy the token</li>
            <li>Open the NotebookLM Extension popup in Chrome</li>
            <li>Paste your token in the "User Token" field</li>
            <li>Click "Sync Cookies"</li>
            <li>When using ChatGPT, include your token: <em>"Summarize [URL] with token YOUR_TOKEN"</em></li>
        </ol>
    </div>
    <script>
        async function generateToken() {
            const res = await fetch('/register');
            const data = await res.json();
            document.getElementById('token').textContent = data.user_token;
            document.getElementById('tokenDisplay').style.display = 'block';
        }
        function copyToken() {
            navigator.clipboard.writeText(document.getElementById('token').textContent);
            alert('Token copied!');
        }
    </script>
</body>
</html>
        `);
    });

    // --- Admin: User Management Endpoints ---

    // List all users with their cookie status
    expressApp.get("/admin/users", (_req, res) => {
        const users = listUsers();
        res.json({ success: true, count: users.length, users });
    });

    // Update a user's display label
    expressApp.patch("/admin/users/:token", (req, res) => {
        const { token } = req.params;
        const { label } = req.body ?? {};
        if (typeof label !== 'string') {
            res.status(400).json({ error: "label must be a string" });
            return;
        }
        const ok = updateUserLabel(token, label);
        if (!ok) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json({ success: true, token, label });
    });

    // Delete a user and all their cookies
    expressApp.delete("/admin/users/:token", async (req, res) => {
        const { token } = req.params;
        await evictUserClient(token);
        const ok = deleteUser(token);
        if (!ok) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        logToFile(`[Admin] Deleted user ${token}`);
        res.json({ success: true, token });
    });

    // --- Cookie Sync Endpoint (from Chrome Extension) ---
    expressApp.post("/sync-cookies", async (req, res) => {
        try {
            const { cookies, user_token } = req.body;
            const user_agent = req.get('User-Agent');
            if (!Array.isArray(cookies)) {
                res.status(400).json({ error: "Invalid cookies format" });
                return;
            }
            setCookiesFromExtension(cookies, user_token, user_agent);

            // Clear re-auth flag (fresh cookies received!)
            const reauthKey = user_token || '__legacy__';
            if (needsReauth.get(reauthKey)) {
                needsReauth.set(reauthKey, false);
                await evictUserClient(reauthKey);
                logToFile(`[Cookies] ✅ Re-auth flag cleared for ${reauthKey}. Fresh cookies received.`);
            }
            // Safety net: if a job ran as __legacy__ (no user_token passed by AI) but the extension
            // syncs with its own token, clear __legacy__ too so the waiting job can proceed.
            if (user_token && needsReauth.get('__legacy__')) {
                needsReauth.set('__legacy__', false);
                await evictUserClient('__legacy__');
                logToFile(`[Cookies] ✅ Also cleared __legacy__ re-auth flag (user ${user_token} synced fresh cookies).`);
            }

            res.json({
                success: true,
                count: cookies.length,
                user_token: user_token || null,
                mode: user_token ? 'per-user' : 'legacy'
            });
        } catch (e: any) {
            logToFile(`[Cookies] Error processing cookies: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // --- Auth Events SSE Endpoint (extension connects once, server pushes when re-auth needed) ---
    expressApp.get("/auth-events", (req, res) => {
        const userToken = (req.query.user_token as string) || '__legacy__';

        // Set up SSE headers
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write(`data: ${JSON.stringify({ type: 'connected', user_token: userToken })}\n\n`);

        // Register this client
        if (!reauthSseClients.has(userToken)) {
            reauthSseClients.set(userToken, new Set());
        }
        reauthSseClients.get(userToken)!.add(res);
        logToFile(`[SSE] Extension connected for ${userToken}. Total clients: ${reauthSseClients.get(userToken)!.size}`);

        // Cleanup on disconnect
        req.on('close', () => {
            const clients = reauthSseClients.get(userToken);
            clients?.delete(res);
            if (clients && clients.size === 0) {
                reauthSseClients.delete(userToken);
            }
            logToFile(`[SSE] Extension disconnected for ${userToken}.`);
        });

        // Keep-alive ping every 30s
        const keepAlive = setInterval(() => {
            try { res.write(': keepalive\n\n'); } catch (e) { clearInterval(keepAlive); }
        }, 30000);
        req.on('close', () => clearInterval(keepAlive));
    });

    // Store transports by session ID (supports both SSE and Streamable HTTP)
    const sessionTransports = new Map<string, SSEServerTransport | StreamableHTTPServerTransport>();

    // SSE Connection Endpoint
    // Clients connect here (GET) to start the session.
    // We support both /sse (standard) and /mcp (what user tried)
    const handleSseConnection = async (req: express.Request, res: express.Response) => {
        logToFile(`[HTTP] New SSE connection request: ${req.path}`);
        req.socket.setTimeout(0); // Disable socket timeout for SSE connection

        // Prevent buffering and caching at all layers (Cloudflare, Nginx, Browser)
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.setHeader("Content-Encoding", "none");

        // The client needs to know where to send messages (POST).
        // We tell it to send to /messages.
        const transport = new SSEServerTransport("/messages", res);

        logToFile(`[HTTP] Created transport with sessionId: ${transport.sessionId}`);
        sessionTransports.set(transport.sessionId, transport);

        // Heartbeat to keep connection alive (prevent Cloudflare/Proxy timeout)
        const heartbeatInterval = setInterval(() => {
            if (res.writableEnded) {
                clearInterval(heartbeatInterval);
                return;
            }
            res.write(": keepalive\n\n");
            logToFile(`[HTTP] Sent heartbeat for session: ${transport.sessionId}`);
        }, 15000); // 15 seconds

        transport.onclose = () => {
            logToFile(`[HTTP] SSE connection closed: ${transport.sessionId}`);
            clearInterval(heartbeatInterval);
            sessionTransports.delete(transport.sessionId);
        };

        (transport as any).onerror = (error: any) => {
            logToFile(`[HTTP] SSE Transport Error (session: ${transport.sessionId}): ${error?.message || String(error)}`);
        };

        req.on("close", () => {
            logToFile(`[HTTP] Express Request 'close' event (Client disconnected?) for session: ${transport.sessionId}`);
        });

        req.on("error", (err) => {
            logToFile(`[HTTP] Express Request 'error' event: ${err.message}`);
        });

        try {
            await server.connect(transport);
            logToFile(`[HTTP] server.connect() completed for session: ${transport.sessionId}`);
        } catch (error) {
            logToFile(`[HTTP] Error processing SSE connection: ${error}`);
        }
    };

    expressApp.get("/sse", handleSseConnection);

    //=========================================================================
    // STREAMABLE HTTP TRANSPORT (Protocol Version 2025-06-18)
    // ChatGPT Connectors prefer this newer transport.
    //=========================================================================
    expressApp.all("/mcp", async (req, res) => {
        logToFile(`[HTTP] ${req.method} /mcp received`);

        try {
            // Check for existing session ID
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            let transport: StreamableHTTPServerTransport | undefined;

            if (sessionId && sessionTransports.has(sessionId)) {
                const existingTransport = sessionTransports.get(sessionId);
                if (existingTransport instanceof StreamableHTTPServerTransport) {
                    transport = existingTransport;
                } else {
                    // Session exists but uses a different transport protocol (SSE)
                    res.status(400).json({
                        jsonrpc: '2.0',
                        error: { code: -32000, message: 'Session uses a different transport protocol' },
                        id: null
                    });
                    return;
                }
            } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
                // New session initialization
                logToFile(`[HTTP] Initializing new Streamable HTTP session...`);
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => crypto.randomUUID(),
                    onsessioninitialized: (newSessionId) => {
                        logToFile(`[HTTP] Streamable HTTP session initialized: ${newSessionId}`);
                        sessionTransports.set(newSessionId, transport!);
                    }
                });

                transport.onclose = () => {
                    const sid = transport!.sessionId;
                    if (sid && sessionTransports.has(sid)) {
                        logToFile(`[HTTP] Streamable HTTP session closed: ${sid}`);
                        sessionTransports.delete(sid);
                    }
                };

                // Connect to MCP server
                await server.connect(transport);
            } else if (!sessionId) {
                // No session and not an initialize request
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Missing session ID or not an initialize request' },
                    id: null
                });
                return;
            }

            if (!transport) {
                res.status(404).json({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Session not found' },
                    id: null
                });
                return;
            }

            // Handle the request using Streamable HTTP transport
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            logToFile(`[HTTP] Error handling /mcp: ${error}`);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null
                });
            }
        }
    });

    //=========================================================================
    // DEPRECATED HTTP+SSE TRANSPORT (Protocol Version 2024-11-05)
    // POST /messages endpoint for backwards compatibility
    //=========================================================================
    expressApp.post("/messages", async (req, res) => {
        const sessionId = req.query.sessionId as string;
        logToFile(`[HTTP] POST /messages (session: ${sessionId})`);

        const transport = sessionTransports.get(sessionId);
        if (!transport || !(transport instanceof SSEServerTransport)) {
            logToFile(`[HTTP] Session not found or wrong type: ${sessionId}`);
            res.status(404).send("Session not found");
            return;
        }

        // Pass req.body to fix known SDK parsing issue
        await transport.handlePostMessage(req, res, req.body);
    });

    // Serve static files from public directory (one level up from dist/)
    const publicPath = path.resolve(__dirname, '../public');
    expressApp.use('/public', express.static(publicPath));

    // Infographic Viewer endpoint - redirect to static HTML
    expressApp.get("/view", (req, res) => {
        const imageUrl = req.query.url as string;
        if (!imageUrl) {
            res.status(400).send("Missing 'url' query parameter");
            return;
        }

        logToFile(`[HTTP] Serving infographic view for: ${imageUrl.substring(0, 50)}...`);

        // Serve the HTML file
        const htmlPath = path.join(publicPath, 'infographic-viewer.html');
        logToFile(`[HTTP] Serving file from: ${htmlPath}`);
        res.sendFile(htmlPath);
    });

    // Serves the already-downloaded, already-processed infographic JPEG for a
    // completed job. This exists so generated apps (and the AI agent writing
    // them) can reference a short, stable <img src="..."> URL instead of the
    // agent needing to retype a ~150-200KB base64 string into source code —
    // that's the failure mode a raw base64 field invites (truncation/drift).
    //
    // Resolution order: in-memory job (same-process fast path) → on-disk file.
    // The disk fallback is essential: the process that RAN the job (often
    // Doable's stdio child) and the process serving THIS port (a separate
    // background instance) don't share memory, but they do share the
    // INFOGRAPHIC_DIR filesystem, where every completed job's image is persisted.
    expressApp.get("/infographic-image/:job_id", (req, res) => {
        const jobId = req.params.job_id;

        const job = infographicJobs.get(jobId);
        if (job?.imageData) {
            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=86400, immutable");
            res.send(Buffer.from(job.imageData, "base64"));
            return;
        }

        const filePath = safeJobFilePath(jobId);
        if (filePath && fsSync.existsSync(filePath)) {
            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=86400, immutable");
            res.sendFile(filePath);
            return;
        }

        res.status(404).send("Infographic image not found (job unknown, still processing, or expired).");
    });

    // Image Proxy for authenticated Google content
    expressApp.get("/proxy-image", async (req, res) => {
        const imageUrl = req.query.url as string;
        const userToken = req.query.user_token as string;

        if (!imageUrl) {
            res.status(400).send("Missing URL");
            return;
        }

        // Cookies are strictly per-user — only use the requesting user's own cookies
        const { cookies, userAgent } = getCookiesForUser(userToken);

        // 2. Fetch Image
        try {
            // Dynamic import to handle potential ESM/CJS issues
            // @ts-ignore
            const fetch = (await import('node-fetch')).default;
            const headers: Record<string, string> = {
                'User-Agent': userAgent || "Mozilla/5.0",
                'Referer': 'https://notebooklm.google.com/'
            };

            if (cookies.length > 0) {
                headers['Cookie'] = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            }

            const imgRes = await fetch(imageUrl, { headers });

            if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status}`);

            const contentType = imgRes.headers.get('content-type') || 'image/png';
            res.setHeader('Content-Type', contentType);
            // Cache for 1 hour
            res.setHeader('Cache-Control', 'public, max-age=3600');

            if (imgRes.body) {
                imgRes.body.pipe(res);
            } else {
                res.end();
            }
        } catch (e: any) {
            logToFile(`[Proxy] Error serving image: ${e.message}`);
            res.status(500).send("Error serving image");
        }
    });

    // Health check endpoint
    expressApp.get("/health", (_req, res) => {
        res.json({ status: "ok", mode: "http", port: HTTP_PORT });
    });

    // NOTE: /sse is already registered at line 985 via handleSseConnection
    // Removed duplicate registration

    // Root info endpoint (Supports SSE auto-discovery)
    expressApp.get("/", async (req, res) => {
        const accept = req.headers.accept || "";
        if (accept.includes("text/event-stream")) {
            logToFile(`[HTTP] Root request with Accept: text/event-stream -> Handling as SSE`);
            await handleSseConnection(req, res);
            return;
        }

        res.json({
            name: "NotebookLM MCP Server",
            version: "1.0.0",
            endpoints: {
                mcp: "POST /mcp",
                view: "GET /view?url=<image_url>",
                health: "GET /health",
            },
            instructions: "Use cloudflared to create a tunnel: npx cloudflared tunnel --url http://localhost:" + HTTP_PORT,
        });
    });

    const httpServer = expressApp.listen(HTTP_PORT, () => {
        logToFile(`HTTP/WS Server listening on port ${HTTP_PORT}`);
    });

    httpServer.on('error', (e: any) => {
        if (e.code === 'EADDRINUSE') {
            logToFile(`Port ${HTTP_PORT} is in use. Assuming background server is running. Continuing in Stdio/Transport mode.`);
        } else {
            logToFile(`HTTP Server Error: ${e}`);
        }
    });
}

// --- Stdio Server Setup ---
async function startStdioServer(server: McpServer) {
    // In stdio mode, redirect console.log to stderr to keep stdout clean for MCP
    console.log = console.error;

    const transport = new StdioServerTransport();
    await server.connect(transport);
    logToFile("NotebookLM MCP Server running on Stdio");
}

// --- Main Entry Point ---
async function main() {
    const useStdio = process.argv.includes("--stdio");
    if (useStdio) {
        console.log = console.error;
    }

    logToFile("SERVER STARTING...");
    logToFile("Initializing Transports...");



    const server = new McpServer({
        name: "NotebookLM",
        version: "1.0.0",
    });

    registerTools(server);

    // Always start HTTP server (provides dual support and serves UI assets)
    startHttpServer(server);

    if (useStdio) {
        await startStdioServer(server);
    }
}

main().catch((e) => {
    logToFile(`FATAL ERROR: ${e}`);
    console.error(`FATAL ERROR: ${e}`);
    process.exit(1);
});
