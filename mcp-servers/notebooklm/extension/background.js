/**
 * NotebookLM Extension — Background Service Worker
 *
 * Responsibilities:
 *   1. Extract Google cookies and sync them to the MCP server (per-user isolation)
 *   2. Auto-detect the logged-in Doable user from open tabs
 *   3. Maintain an SSE connection so the server can push re-auth events
 *   4. Handle messages from popup.js and content scripts
 *
 * The infographic generation pipeline that used to live here has been moved to
 * the MCP server (src/server.ts + src/notebooklm_client.ts).
 * The old extension-side RPC code is preserved in legacy/rpc_pipeline.js for reference.
 */

// ── Configuration ──────────────────────────────────────────────────────────────
const MCP_SERVER_URL = "https://staging-api.doable.me";

// ── Structured Logger ──────────────────────────────────────────────────────────
// tag   : short label shown in brackets, e.g. "AutoSync", "Cookies", "SSE"
// level : "log" | "warn" | "error"
function log(tag, level, ...args) {
    const ts = new Date().toLocaleTimeString();
    const prefix = `[${ts}] [${tag}]`;
    console[level](prefix, ...args);
}

// ── User Detection ─────────────────────────────────────────────────────────────

/**
 * Reads the Doable user ID from an open Doable tab's localStorage.
 * Returns the UUID string, or null if no Doable tab is found / user not logged in.
 */
async function detectDoableUserId() {
    try {
        const tabs = await chrome.tabs.query({
            url: ['http://localhost:3000/*', 'https://*.doable.me/*']
        });

        if (tabs.length === 0) {
            log('UserDetect', 'log', 'No open Doable tab found.');
            return null;
        }

        log('UserDetect', 'log', `Found ${tabs.length} Doable tab(s) — checking tab ${tabs[0].id} (${tabs[0].url})`);

        const results = await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            func: () => {
                try {
                    const raw = localStorage.getItem('doable_auth_user');
                    if (raw) {
                        const user = JSON.parse(raw);
                        if (user?.id) return user.id;
                    }
                } catch (_) { /* storage may be restricted */ }
                return null;
            }
        });

        const userId = results?.[0]?.result ?? null;
        if (userId) {
            log('UserDetect', 'log', `✅ Detected user ID: ${userId}`);
        } else {
            log('UserDetect', 'log', 'Tab found but no doable_auth_user in localStorage (not logged in?)');
        }
        return userId;
    } catch (e) {
        log('UserDetect', 'warn', 'Failed to detect user ID:', e.message);
        return null;
    }
}

// ── Cookie Sync ────────────────────────────────────────────────────────────────

/**
 * Extracts all Google cookies from the browser and POSTs them to the MCP server.
 * @param {string} trigger - Why the sync was triggered (for logging).
 */
async function extractAndSyncCookies(trigger = 'manual') {
    log('AutoSync', 'log', `▶ Sync triggered by: ${trigger}`);

    try {
        const storage = await chrome.storage.local.get(['user_token', 'server_url']);
        const serverUrl = storage.server_url || MCP_SERVER_URL;

        // Always try to detect the active Doable user first so the token stays
        // current if the user logs in/out between sync cycles.
        let userToken = null;
        const detected = await detectDoableUserId();

        if (detected) {
            userToken = detected;
            if (userToken !== storage.user_token) {
                await chrome.storage.local.set({ user_token: userToken });
                log('AutoSync', 'log', `🔄 User token updated: ${userToken}`);
            } else {
                log('AutoSync', 'log', `👤 User token unchanged: ${userToken}`);
            }
        } else {
            userToken = storage.user_token?.trim() || null;
            if (userToken) {
                log('AutoSync', 'log', `👤 Using saved token (no live tab): ${userToken}`);
            } else {
                log('AutoSync', 'warn', '⚠️ No user ID found — open Doable in a tab or enter your ID in the popup.');
                return { success: false, error: 'Could not detect your Doable User ID. Open Doable in a tab and try again, or enter your ID manually in the popup.' };
            }
        }

        // Gather cookies via multiple strategies to catch SID/HSID variants
        const [d1, d2, u1, u2, sid, hsid, sid_www, hsid_www] = await Promise.all([
            chrome.cookies.getAll({ domain: "google.com" }),
            chrome.cookies.getAll({ domain: ".google.com" }),
            chrome.cookies.getAll({ url: "https://notebooklm.google.com" }),
            chrome.cookies.getAll({ url: "https://accounts.google.com" }),
            chrome.cookies.get({ url: "https://google.com", name: "SID" }),
            chrome.cookies.get({ url: "https://google.com", name: "HSID" }),
            chrome.cookies.get({ url: "https://www.google.com", name: "SID" }),
            chrome.cookies.get({ url: "https://www.google.com", name: "HSID" }),
        ]);

        const explicitCookies = [sid, hsid, sid_www, hsid_www].filter(Boolean);

        // Deduplicate by name@domain@path
        const seen = new Set();
        const uniqueCookies = [...d1, ...d2, ...u1, ...u2, ...explicitCookies].filter(c => {
            const key = `${c.name}@${c.domain}@${c.path}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        log('Cookies', 'log', `Extracted ${uniqueCookies.length} unique cookies (d1:${d1.length} d2:${d2.length} u1:${u1.length} u2:${u2.length} explicit:${explicitCookies.length})`);

        // POST to MCP server
        log('AutoSync', 'log', `→ Sending to ${serverUrl}/sync-cookies (user: ${userToken})`);
        const response = await fetch(`${serverUrl}/sync-cookies`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cookies: uniqueCookies, user_token: userToken })
        });

        if (response.ok) {
            const result = await response.json();
            log('AutoSync', 'log', `✅ Sync complete — server confirmed ${result.count ?? uniqueCookies.length} cookies (mode: ${result.mode ?? '?'})`);
            return { success: true, ...result };
        } else {
            log('AutoSync', 'warn', `⚠️ Server responded with HTTP ${response.status}`);
            return { success: false, error: `Server error: ${response.status}` };
        }
    } catch (e) {
        log('AutoSync', 'warn', `Failed to sync (server may not be running): ${e.message}`);
        return { success: false, error: e.message };
    }
}

// ── Auto-Sync Triggers ─────────────────────────────────────────────────────────

const SYNC_INTERVAL_MINUTES = 2;

/**
 * Ensures the cookie-sync alarm exists with the correct period.
 * Called on every service worker activation (top-level) so that reloading
 * the extension via chrome://extensions always picks up interval changes.
 * chrome.runtime.onInstalled does NOT fire on manual reload — only on install/update.
 */
async function ensureAlarm() {
    const existing = await chrome.alarms.get('cookie-sync');
    if (!existing || existing.periodInMinutes !== SYNC_INTERVAL_MINUTES) {
        chrome.alarms.create('cookie-sync', { periodInMinutes: SYNC_INTERVAL_MINUTES });
        log('AutoSync', 'log', `🔔 Alarm (re)created: every ${SYNC_INTERVAL_MINUTES} min (was: ${existing?.periodInMinutes ?? 'none'})`);
    } else {
        log('AutoSync', 'log', `🔔 Alarm OK: every ${SYNC_INTERVAL_MINUTES} min, next in ~${Math.round((existing.scheduledTime - Date.now()) / 1000)}s`);
    }
}

// Runs every time the service worker activates (install, update, browser start, AND reload)
ensureAlarm();

chrome.runtime.onInstalled.addListener(() => {
    log('AutoSync', 'log', `🔌 Extension installed/updated — running initial sync.`);
    extractAndSyncCookies('extension-install');
});

chrome.runtime.onStartup.addListener(() => {
    log('AutoSync', 'log', `🚀 Browser startup — running sync.`);
    extractAndSyncCookies('browser-startup');
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cookie-sync') {
        log('AutoSync', 'log', `⏰ ${SYNC_INTERVAL_MINUTES}-min periodic alarm fired.`);
        extractAndSyncCookies(`${SYNC_INTERVAL_MINUTES}min-alarm`);
    }
});

// Sync whenever a Doable tab finishes loading — catches the case where the user
// opens Doable after the extension is already running.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    const url = tab.url || '';
    const isDoable = url.startsWith('http://localhost:3000') || url.includes('.doable.me');
    if (!isDoable) return;
    log('AutoSync', 'log', `🌐 Doable tab loaded (tab ${tabId}): ${url}`);
    extractAndSyncCookies('doable-tab-load');
});

// ── SSE — Server pushes re-auth events ────────────────────────────────────────

let authEventSource = null;
let isReauthInProgress = false;
let sseReconnectDelay = 1000;

async function connectAuthEvents() {
    try {
        const storage = await chrome.storage.local.get(['user_token', 'server_url']);
        const userToken = storage.user_token || '';
        const serverUrl = storage.server_url || MCP_SERVER_URL;
        const url = `${serverUrl}/auth-events?user_token=${encodeURIComponent(userToken)}`;

        if (authEventSource) {
            authEventSource.close();
            authEventSource = null;
        }

        authEventSource = new EventSource(url);

        authEventSource.onopen = () => {
            sseReconnectDelay = 1000;
            log('SSE', 'log', `✅ Connected to auth-events (user: ${userToken || 'none'})`);
        };

        authEventSource.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'reauth' && !isReauthInProgress) {
                    log('SSE', 'log', '🔴 Server says re-auth needed — opening login tab...');
                    try {
                        isReauthInProgress = true;
                        await handleReauth();
                    } finally {
                        isReauthInProgress = false;
                    }
                } else if (data.type === 'connected') {
                    log('SSE', 'log', `Server acknowledged connection for: ${data.user_token}`);
                }
            } catch (e) {
                log('SSE', 'error', 'Error parsing event:', e);
            }
        };

        authEventSource.onerror = () => {
            log('SSE', 'log', `Connection lost. Reconnecting in ${sseReconnectDelay / 1000}s...`);
            authEventSource.close();
            authEventSource = null;
            setTimeout(connectAuthEvents, sseReconnectDelay);
            sseReconnectDelay = Math.min(sseReconnectDelay * 2, 60000);
        };

        log('SSE', 'log', `Connecting to ${url}`);
    } catch (e) {
        log('SSE', 'log', `Failed to connect (server may not be running): ${e.message}`);
        setTimeout(connectAuthEvents, sseReconnectDelay);
        sseReconnectDelay = Math.min(sseReconnectDelay * 2, 60000);
    }
}

async function handleReauth() {
    try {
        chrome.notifications.create('reauth', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'NotebookLM - Login Required',
            message: 'Your session expired. A login tab has been opened. Please log in to continue.',
            priority: 2
        });

        const tab = await chrome.tabs.create({ url: 'https://notebooklm.google.com', active: true });
        log('SSE', 'log', `Opened login tab: ${tab.id}`);

        const MAX_WAIT = 300000;
        const POLL_INTERVAL = 3000;
        const start = Date.now();

        await new Promise((resolve) => {
            const check = setInterval(async () => {
                try {
                    const updatedTab = await chrome.tabs.get(tab.id);
                    const tabUrl = updatedTab.url || '';
                    if (tabUrl.includes('notebooklm.google.com') && !tabUrl.includes('accounts.google.com')) {
                        log('SSE', 'log', `✅ Login detected! URL: ${tabUrl}`);
                        clearInterval(check);
                        resolve();
                    }
                    if (Date.now() - start > MAX_WAIT) {
                        log('SSE', 'log', '⏰ Login timeout (5 min)');
                        clearInterval(check);
                        resolve();
                    }
                } catch (e) {
                    log('SSE', 'log', 'Login tab closed by user.');
                    clearInterval(check);
                    resolve();
                }
            }, POLL_INTERVAL);
        });

        log('SSE', 'log', 'Extracting fresh cookies after login...');
        const result = await extractAndSyncCookies('post-reauth');
        log('SSE', 'log', `Cookie sync result: success=${result.success}`);

        try { await chrome.tabs.remove(tab.id); } catch (_) { /* already closed */ }

        chrome.notifications.create('reauth-done', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'NotebookLM - Re-authenticated!',
            message: 'Cookies re-synced. Your request will now continue automatically.',
            priority: 1
        });
    } catch (e) {
        log('SSE', 'error', 're-auth handling failed:', e);
        isReauthInProgress = false;
    }
}

// Connect on extension load (will auto-reconnect if server isn't running yet)
connectAuthEvents();

// ── Message Handlers ───────────────────────────────────────────────────────────

// External messages (e.g. from the MCP server page via chrome.runtime.sendMessage)
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === 'REFRESH_COOKIES') {
        log('Cookies', 'log', `🔄 External refresh request from: ${sender.url || 'unknown'}`);
        extractAndSyncCookies('external-request').then(sendResponse);
        return true;
    }
});

// Internal messages (from popup.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'REFRESH_COOKIES':
            log('Cookies', 'log', '🔄 Refresh requested from popup.');
            extractAndSyncCookies('popup-manual').then(sendResponse);
            return true;

        case 'SET_USER_TOKEN':
            log('Cookies', 'log', `🔑 Setting user token: ${message.token}`);
            chrome.storage.local.set({ user_token: message.token }, () => sendResponse({ success: true }));
            return true;

        case 'SET_SERVER_URL':
            log('Cookies', 'log', `🌐 Setting server URL: ${message.url}`);
            chrome.storage.local.set({ server_url: message.url }, () => sendResponse({ success: true }));
            return true;

        case 'GET_SETTINGS':
            chrome.storage.local.get(['user_token', 'server_url'], (result) => {
                sendResponse({
                    user_token: result.user_token || '',
                    server_url: result.server_url || MCP_SERVER_URL
                });
            });
            return true;

        case 'DETECT_USER_ID':
            detectDoableUserId().then(async (userId) => {
                if (userId) await chrome.storage.local.set({ user_token: userId });
                sendResponse({ userId: userId || null });
            });
            return true;
    }
});
