/**
 * DEPRECATED LEGACY CODE — Extension-side RPC Pipeline
 *
 * This file was the original implementation before the MCP server took over
 * infographic generation. The pipeline (token scraping → RPC → polling) now
 * runs entirely inside src/server.ts via Playwright/NativeFetchClient.
 *
 * Kept for reference. NOT loaded by manifest.json.
 */

// --- CONFIGURATION ---
const BASE_URL = "https://notebooklm.google.com";
const RPC_ENDPOINT = `${BASE_URL}/_/LabsTailwindUi/data/batchexecute`;

// RPC IDs
const RPC = {
    CREATE_NOTEBOOK: "CCqFvf",
    ADD_SOURCE: "izAoDd",
    GENERATE_INFOGRAPHIC: "R7cb6c",
    LIST_ARTIFACTS: "gArtLc",
    DELETE_NOTEBOOK: "f61S6e"
};

// State
let sessionTokens = { at: null, bl: null, fsid: null };

// --- 1. TOKEN SCRAPER ---
async function refreshTokens() {
    console.log("[Headless] 🔄 Fetching new auth tokens...");
    try {
        const response = await fetch(BASE_URL, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const html = await response.text();

        const atMatch = html.match(/"SNlM0e":"([^"]+)"/);
        const blMatch = html.match(/"(boq_labs-tailwind-[^"]+)"/);
        const fsidMatch = html.match(/"FdrFJe":"([^"]+)"/);

        if (!atMatch || !blMatch) throw new Error("Could not scrape tokens. User might be logged out.");

        sessionTokens = {
            at: atMatch[1],
            bl: blMatch[1],
            fsid: fsidMatch ? fsidMatch[1] : ""
        };
        console.log("[Headless] ✅ Tokens acquired:", sessionTokens.bl);
        return true;

    } catch (e) {
        console.error("[Headless] Token Error:", e);
        return false;
    }
}

// --- 2. RPC EXECUTOR ---
async function executeRPC(rpcId, payload) {
    if (!sessionTokens.at) await refreshTokens();

    const reqId = Math.floor(Math.random() * 100000) + 100000;
    const innerPayload = JSON.stringify(payload);
    const envelope = JSON.stringify([[[rpcId, innerPayload, null, "generic"]]]);

    const params = new URLSearchParams({
        "rpcids": rpcId,
        "source-path": "/",
        "bl": sessionTokens.bl,
        "f.sid": sessionTokens.fsid,
        "hl": "en",
        "rt": "c",
        "_reqid": reqId
    });

    const body = new URLSearchParams();
    body.append("f.req", envelope);
    body.append("at", sessionTokens.at);

    const response = await fetch(`${RPC_ENDPOINT}?${params.toString()}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Same-Domain": "1"
        },
        body: body,
        credentials: "include"
    });

    if (!response.ok) throw new Error(`RPC ${rpcId} failed: ${response.status}`);

    const text = await response.text();
    return parseRPCResponse(text);
}

function parseRPCResponse(text) {
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[[')) {
            try {
                const json = JSON.parse(trimmed);
                if (json[0] && json[0][0] === 'wrb.fr') {
                    return json;
                }
            } catch (e) { }
        }
    }
    return null;
}

// --- 3. CORE LOGIC FLOW ---
async function runGenerationPipeline(youtubeTabId, videoUrl) {
    try {
        notifyUI(youtubeTabId, "Initializing (Headless Mode)...");

        if (!await refreshTokens()) {
            notifyUI(youtubeTabId, "LOGIN_REQUIRED");
            return;
        }

        notifyUI(youtubeTabId, "Creating Notebook...");
        const createPayload = ["", null, null, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
        const createRes = await executeRPC(RPC.CREATE_NOTEBOOK, createPayload);

        const innerCreate = JSON.parse(createRes[0][2]);
        const notebookId = innerCreate[2];
        console.log("[Headless] Notebook Created:", notebookId);

        notifyUI(youtubeTabId, "Adding Source...");
        const sourcePayload = [[[null, null, null, null, null, null, null, [videoUrl], null, null, 1]], notebookId, [2], [1, null, null, null, null, null, null, null, null, null, [1]]];
        const sourceRes = await executeRPC(RPC.ADD_SOURCE, sourcePayload);

        const innerSource = JSON.parse(sourceRes[0][2]);
        const sourceId = findSourceID(innerSource);

        if (!sourceId) throw new Error("Google rejected video (No Transcript?)");
        console.log("[Headless] Source Added:", sourceId);

        notifyUI(youtubeTabId, "Processing Transcript (10s)...");
        console.log("[Headless] ⏳ Pausing 10s for transcript processing...");
        await new Promise(r => setTimeout(r, 10000));

        notifyUI(youtubeTabId, "Triggering Generation...");
        console.log("[Headless] 🚀 Triggering Generation RPC...");

        const triggerPayload = [[2], notebookId, [null, null, 7, [[[sourceId]]], null, null, null, null, null, null, null, null, null, null, [[null, null, null, 1, 2]]]];
        await executeRPC(RPC.GENERATE_INFOGRAPHIC, triggerPayload);
        console.log("[Headless] ✅ Trigger Sent.");

        notifyUI(youtubeTabId, "Generating Infographic...");
        await pollForArtifacts(youtubeTabId, notebookId, sourceId);

    } catch (e) {
        console.error("[Headless] Pipeline Failed:", e);
        notifyUI(youtubeTabId, "ERROR", { error: e.message });
    }
}

async function pollForArtifacts(tabId, notebookId, sourceId) {
    let attempts = 0;
    const maxAttempts = 30;

    const interval = setInterval(async () => {
        attempts++;
        if (attempts > maxAttempts) {
            clearInterval(interval);
            notifyUI(tabId, "ERROR", { error: "Timeout" });
            return;
        }

        try {
            console.log(`[Headless] Polling #${attempts}...`);

            const payload = [[2], notebookId];
            const response = await executeRPC(RPC.LIST_ARTIFACTS, payload);

            if (response && response[0] && typeof response[0][2] === 'string') {
                const innerData = JSON.parse(response[0][2]);
                const imageUrl = findImageUrl(innerData);

                if (imageUrl) {
                    console.log("[Headless] 📸 Image Found:", imageUrl);
                    clearInterval(interval);

                    let finalImage = imageUrl;
                    try {
                        const base64 = await urlToBase64(imageUrl);
                        finalImage = base64;
                        console.log("[Headless] ✅ Base64 Conversion Success");
                    } catch (e) {
                        console.warn("[Headless] ⚠️ Base64 failed (CORS?), sending URL directly.", e);
                    }

                    notifyUI(tabId, "COMPLETED", { imageUrl: finalImage });
                }
            }
        } catch (e) {
            console.warn("Poll failed, retrying...", e);
        }
    }, 20000);
}

// --- HELPERS ---
function notifyUI(tabId, status, payload = {}) {
    chrome.tabs.sendMessage(tabId, { type: 'UPDATE_STATUS', status, payload }).catch(() => { });
}

function findSourceID(obj) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (typeof obj === 'string' && uuidRegex.test(obj)) return obj;
    if (Array.isArray(obj)) {
        for (let item of obj) {
            const found = findSourceID(item);
            if (found) return found;
        }
    }
    return null;
}

function findImageUrl(obj) {
    if (typeof obj === 'string' && (obj.includes('googleusercontent.com') || obj.startsWith('data:image/'))) return obj;
    if (Array.isArray(obj)) {
        for (let item of obj) {
            const res = findImageUrl(item);
            if (res) return res;
        }
    }
    return null;
}

async function urlToBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
}

// --- ENTRY POINT (no longer wired up in background.js) ---
// chrome.runtime.onMessage.addListener((msg, sender) => {
//     if (msg.type === 'INIT_GENERATION') {
//         runGenerationPipeline(sender.tab.id, msg.videoUrl);
//     }
// });
