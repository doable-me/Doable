import type { EnhancedAuthModule } from "./types.js";

// ─── Module Loader ──────────────────────────────────────

const moduleCache = new Map<string, EnhancedAuthModule>();

/**
 * Load an enhanced auth module by provider key.
 * Uses dynamic import for lazy loading — modules only loaded when needed.
 */
export async function getEnhancedAuthModule(providerKey: string): Promise<EnhancedAuthModule | null> {
  if (moduleCache.has(providerKey)) return moduleCache.get(providerKey)!;

  try {
    const mod = await import(`./${providerKey}.js`);
    const module = mod.default as EnhancedAuthModule;
    moduleCache.set(providerKey, module);
    return module;
  } catch {
    return null;
  }
}

// ─── In-Memory Session Store ────────────────────────────
// Holds management OAuth access tokens between callback and credential extraction.
// 5-minute TTL, no Redis needed for ~100 users.

interface EnhancedAuthSession {
  accessToken: string;
  integrationId: string;
  userId: string;
  workspaceId: string;
  scope: string;
  projectId?: string;
  expiresAt: number;
}

const sessions = new Map<string, EnhancedAuthSession>();

// Cleanup expired sessions every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(key);
  }
}, 60_000);

export function storeEnhancedAuthSession(sessionKey: string, session: Omit<EnhancedAuthSession, "expiresAt">): void {
  sessions.set(sessionKey, { ...session, expiresAt: Date.now() + 5 * 60 * 1000 });
}

export function getEnhancedAuthSession(sessionKey: string): EnhancedAuthSession | undefined {
  const session = sessions.get(sessionKey);
  if (!session) return undefined;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionKey);
    return undefined;
  }
  return session;
}

export function deleteEnhancedAuthSession(sessionKey: string): void {
  sessions.delete(sessionKey);
}
