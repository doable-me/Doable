/**
 * User & Cookie Management for NotebookLM MCP Server
 *
 * Per-user cookie files layout (user_data/ directory):
 *   users.json          — registry of all known users (token, label, timestamps)
 *   cookies/<token>.json — one cookie file per user (isolated writes, no shared corruption)
 *   cookies/__legacy__.json — fallback for extension installs with no token set
 *
 * The token is the user's Doable user ID (set manually in the extension popup).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const USER_DATA_DIR = path.join(__dirname, '../user_data');
export const USER_COOKIES_DIR = path.join(USER_DATA_DIR, 'cookies');
const USERS_FILE = path.join(USER_DATA_DIR, 'users.json');

const COOKIE_MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChromeCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    expirationDate?: number;
    sameSite?: string;
}

export interface UserRecord {
    token: string;
    label?: string;
    createdAt: number;
    lastSeenAt?: number;
}

export interface UserCookieData {
    cookies: ChromeCookie[];
    receivedAt: number;
    userAgent?: string;
}

export interface UserStatus extends UserRecord {
    hasCookies: boolean;
    cookiesFresh: boolean;
    cookieCount: number;
    cookiesReceivedAt?: number;
}

// ─── In-memory stores ─────────────────────────────────────────────────────────

const userRegistry: Map<string, UserRecord> = new Map();
const userCookies: Map<string, UserCookieData> = new Map();
// Track file mtimes so stdio/HTTP processes can detect cross-process cookie updates
const cookieFileMtimes: Map<string, number> = new Map();

let legacyCookies: ChromeCookie[] = [];
let legacyCookiesReceivedAt: number | null = null;
let legacyCookiesUserAgent: string | undefined;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDirs() {
    if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });
    if (!fs.existsSync(USER_COOKIES_DIR)) fs.mkdirSync(USER_COOKIES_DIR, { recursive: true });
}

function writeJson(filePath: string, data: unknown) {
    try {
        ensureDirs();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch { /* non-fatal */ }
}

/** Sanitize a token so it's safe to use as a filename. */
function cookieFilePath(token: string): string {
    const safe = token.replace(/[/\\:*?"<>|]/g, '_');
    return path.join(USER_COOKIES_DIR, `${safe}.json`);
}

// ─── User Registry ────────────────────────────────────────────────────────────

export function generateUserToken(): string {
    return 'user_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function registerUser(token: string, label?: string): UserRecord {
    const existing = userRegistry.get(token);
    if (existing) {
        if (label !== undefined) existing.label = label;
        persistUserRegistry();
        return existing;
    }
    const record: UserRecord = { token, createdAt: Date.now(), label };
    userRegistry.set(token, record);
    persistUserRegistry();
    return record;
}

export function touchUser(token: string) {
    const record = userRegistry.get(token);
    if (record) {
        record.lastSeenAt = Date.now();
        persistUserRegistry();
    }
}

export function updateUserLabel(token: string, label: string): boolean {
    const record = userRegistry.get(token);
    if (!record) return false;
    record.label = label;
    persistUserRegistry();
    return true;
}

export function deleteUser(token: string): boolean {
    const existed = userRegistry.has(token) || userCookies.has(token);
    userRegistry.delete(token);
    userCookies.delete(token);
    // Delete this user's cookie file
    const filePath = cookieFilePath(token);
    if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* non-fatal */ }
    }
    persistUserRegistry();
    return existed;
}

export function listUsers(): UserStatus[] {
    const allTokens = new Set([...userRegistry.keys(), ...userCookies.keys()]);
    const result: UserStatus[] = [];

    for (const token of allTokens) {
        if (token === '__legacy__') continue;
        const record = userRegistry.get(token) ?? { token, createdAt: 0 };
        const cookieData = userCookies.get(token);
        const cookiesFresh = !!cookieData && (Date.now() - cookieData.receivedAt) < COOKIE_MAX_AGE_MS;
        result.push({
            ...record,
            hasCookies: !!cookieData && cookieData.cookies.length > 0,
            cookiesFresh,
            cookieCount: cookieData?.cookies.length ?? 0,
            cookiesReceivedAt: cookieData?.receivedAt,
        });
    }

    return result.sort((a, b) => (b.lastSeenAt ?? b.createdAt) - (a.lastSeenAt ?? a.createdAt));
}

export function isValidUserToken(token: string): boolean {
    return userRegistry.has(token) || userCookies.has(token);
}

/**
 * Re-reads any per-user cookie file whose mtime on disk is newer than what we
 * loaded into memory.  This is needed because the HTTP server and the stdio
 * server are separate Node processes — when the extension calls /sync-cookies
 * the HTTP process updates its in-memory Map AND writes the file, but the
 * stdio process only ever loaded the files at startup.  Calling this before
 * getMostRecentActiveUser() makes both processes see fresh cookies.
 */
export function refreshCookiesFromDisk(): void {
    try {
        const files = fs.readdirSync(USER_COOKIES_DIR);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            const token = file.slice(0, -5);
            const filePath = path.join(USER_COOKIES_DIR, file);
            const stat = fs.statSync(filePath);
            const diskMtime = stat.mtimeMs;
            const loadedMtime = cookieFileMtimes.get(filePath) ?? 0;
            if (diskMtime <= loadedMtime) continue; // file unchanged since last load
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UserCookieData;
                if (!Array.isArray(data.cookies) || typeof data.receivedAt !== 'number') continue;
                if (token === '__legacy__') {
                    legacyCookies = data.cookies;
                    legacyCookiesReceivedAt = data.receivedAt;
                    legacyCookiesUserAgent = data.userAgent;
                } else {
                    userCookies.set(token, data);
                    if (!userRegistry.has(token)) {
                        userRegistry.set(token, { token, createdAt: data.receivedAt });
                    }
                }
                cookieFileMtimes.set(filePath, diskMtime);
            } catch { /* corrupt file — skip */ }
        }
    } catch { /* dir unreadable — skip */ }
}

/**
 * Returns the token of the user who most recently synced fresh cookies.
 * Used to auto-detect the active user when no user_token is passed in a tool call.
 */
export function getMostRecentActiveUser(): string | undefined {
    // Always pick up cookie files written by the sibling HTTP server process.
    refreshCookiesFromDisk();

    let bestToken: string | undefined;
    let bestTime = 0;

    for (const [token, data] of userCookies) {
        if (token === '__legacy__') continue;
        const fresh = (Date.now() - data.receivedAt) < COOKIE_MAX_AGE_MS;
        if (fresh && data.receivedAt > bestTime) {
            bestTime = data.receivedAt;
            bestToken = token;
        }
    }
    return bestToken;
}

function persistUserRegistry() {
    const data: Record<string, UserRecord> = {};
    userRegistry.forEach((v, k) => { data[k] = v; });
    writeJson(USERS_FILE, data);
}

export function loadUserRegistry() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as Record<string, UserRecord>;
            for (const [key, value] of Object.entries(data)) {
                userRegistry.set(key, value);
            }
        }
    } catch { /* non-fatal */ }
}

// ─── Cookie Management ────────────────────────────────────────────────────────

/**
 * Stores cookies for a specific user token in their own isolated file.
 */
export function setCookiesFromExtension(cookies: ChromeCookie[], userToken?: string, userAgent?: string) {
    if (userToken) {
        userCookies.set(userToken, { cookies, receivedAt: Date.now(), userAgent });
        if (!userRegistry.has(userToken)) {
            registerUser(userToken);
        } else {
            touchUser(userToken);
        }
        persistCookiesForUser(userToken);
    } else {
        legacyCookies = cookies;
        legacyCookiesReceivedAt = Date.now();
        legacyCookiesUserAgent = userAgent;
        persistLegacyCookies();
    }
}

/**
 * Returns cookies for the given user token.
 * Strict isolation — no cross-user borrowing.
 * Always refreshes from disk first to pick up recently-synced cookies
 * (important when stdio and HTTP servers are separate processes).
 */
export function getCookiesForUser(userToken?: string): { cookies: ChromeCookie[]; fresh: boolean; userAgent?: string } {
    // Always sync fresh from disk before checking memory — this ensures both
    // the HTTP server (which handles /sync-cookies) and the stdio server
    // (which handles MCP tool calls) see the latest cookies even though they're
    // separate Node processes with separate in-memory Maps.
    refreshCookiesFromDisk();

    if (userToken && userCookies.has(userToken)) {
        const data = userCookies.get(userToken)!;
        const fresh = (Date.now() - data.receivedAt) < COOKIE_MAX_AGE_MS;
        return { cookies: data.cookies, fresh, userAgent: data.userAgent };
    }

    if (!userToken && legacyCookies.length > 0 && legacyCookiesReceivedAt) {
        const fresh = (Date.now() - legacyCookiesReceivedAt) < COOKIE_MAX_AGE_MS;
        return { cookies: legacyCookies, fresh, userAgent: legacyCookiesUserAgent };
    }

    return { cookies: [], fresh: false };
}

export function hasFreshCookies(userToken?: string): boolean {
    const { cookies, fresh } = getCookiesForUser(userToken);
    return cookies.length > 0 && fresh;
}

export function getUserCookiesMap(): ReadonlyMap<string, UserCookieData> {
    return userCookies;
}

function persistCookiesForUser(token: string) {
    const data = userCookies.get(token);
    if (!data) return;
    writeJson(cookieFilePath(token), data);
}

function persistLegacyCookies() {
    if (legacyCookies.length === 0 || !legacyCookiesReceivedAt) return;
    writeJson(path.join(USER_COOKIES_DIR, '__legacy__.json'), {
        cookies: legacyCookies,
        receivedAt: legacyCookiesReceivedAt,
        userAgent: legacyCookiesUserAgent,
    });
}

export function loadAllCookies() {
    ensureDirs();

    // ── Migration: old single user_cookies.json → per-user files ──
    const oldCookiesFile = path.join(USER_DATA_DIR, 'user_cookies.json');
    if (fs.existsSync(oldCookiesFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(oldCookiesFile, 'utf-8')) as Record<string, UserCookieData>;
            for (const [key, value] of Object.entries(data)) {
                if (!Array.isArray(value.cookies) || typeof value.receivedAt !== 'number') continue;
                if (key === '__legacy__') {
                    legacyCookies = value.cookies;
                    legacyCookiesReceivedAt = value.receivedAt;
                    legacyCookiesUserAgent = value.userAgent;
                    persistLegacyCookies();
                } else {
                    userCookies.set(key, value);
                    writeJson(cookieFilePath(key), value);
                    if (!userRegistry.has(key)) {
                        userRegistry.set(key, { token: key, createdAt: value.receivedAt });
                    }
                }
            }
            persistUserRegistry();
            // Rename migrated file so we don't re-migrate on next start
            fs.renameSync(oldCookiesFile, oldCookiesFile + '.migrated');
        } catch { /* non-fatal */ }
    }

    // ── Load per-user cookie files ──
    // First from users already in the registry
    for (const token of userRegistry.keys()) {
        const filePath = cookieFilePath(token);
        if (!fs.existsSync(filePath)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as UserCookieData;
            if (Array.isArray(data.cookies) && typeof data.receivedAt === 'number') {
                userCookies.set(token, data);
            }
        } catch { /* corrupt file — skip, will be overwritten on next sync */ }
    }

    // Then scan the directory for any orphaned cookie files not yet in the registry
    for (const file of fs.readdirSync(USER_COOKIES_DIR)) {
        if (!file.endsWith('.json')) continue;
        const token = file.slice(0, -5); // strip .json
        if (token === '__legacy__' || userCookies.has(token)) continue;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(USER_COOKIES_DIR, file), 'utf-8')) as UserCookieData;
            if (Array.isArray(data.cookies) && typeof data.receivedAt === 'number') {
                userCookies.set(token, data);
                if (!userRegistry.has(token)) {
                    userRegistry.set(token, { token, createdAt: data.receivedAt });
                }
            }
        } catch { /* corrupt file — skip */ }
    }

    // ── Load legacy cookies ──
    const legacyFile = path.join(USER_COOKIES_DIR, '__legacy__.json');
    if (fs.existsSync(legacyFile)) {
        try {
            const data = JSON.parse(fs.readFileSync(legacyFile, 'utf-8')) as UserCookieData;
            legacyCookies = data.cookies;
            legacyCookiesReceivedAt = data.receivedAt;
            legacyCookiesUserAgent = data.userAgent;
        } catch { /* non-fatal */ }
    }
}
