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

// ─── KV-Backed Session Store ────────────────────────────
// Holds management OAuth access tokens between callback and credential extraction.
// In-memory by default; Redis when REDIS_URL is set.
import { getKVStore } from "@doable/shared/kv-store.js";

interface EnhancedAuthSession {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  integrationId: string;
  userId: string;
  workspaceId: string;
  scope: string;
  projectId?: string;
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function storeEnhancedAuthSession(sessionKey: string, session: EnhancedAuthSession): void {
  getKVStore().set(`eauth:${sessionKey}`, session, SESSION_TTL_MS);
}

export async function getEnhancedAuthSession(sessionKey: string): Promise<EnhancedAuthSession | undefined> {
  return getKVStore().get<EnhancedAuthSession>(`eauth:${sessionKey}`);
}

export async function deleteEnhancedAuthSession(sessionKey: string): Promise<void> {
  return getKVStore().delete(`eauth:${sessionKey}`);
}
