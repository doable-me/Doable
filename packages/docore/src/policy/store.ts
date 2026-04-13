/**
 * docore policy store
 *
 * Central runtime configuration store with global + per-user scoping.
 * Every security rule, resource limit, and tool permission lives here.
 *
 * Features:
 *   - Typed get/set for all policy keys
 *   - Per-user overrides with smart merging (SetPolicy for arrays)
 *   - Change listeners for reactive updates
 *   - Pluggable persistence (file, memory, or custom)
 *   - Auto-save on write (debounced)
 */

import type {
  PolicyKey,
  PolicyMap,
  PolicyValue,
  PolicyChange,
  SerializedPolicies,
  UserOverrideValue,
} from "./types.js";
import { mergePolicy } from "./merge.js";
import { POLICY_DEFAULTS } from "./defaults.js";
import type { PolicyPersistence } from "./persistence.js";
import { MemoryPersistence } from "./persistence.js";

// ============================================================================
// Options
// ============================================================================

export interface PolicyStoreOptions {
  /** Persistence backend. Defaults to MemoryPersistence (no disk). */
  persistence?: PolicyPersistence;
  /** Auto-save after every write. @default true */
  autoSave?: boolean;
  /** Debounce auto-save by this many ms. @default 500 */
  autoSaveDebounceMs?: number;
}

// ============================================================================
// PolicyStore
// ============================================================================

export class PolicyStore {
  private global: Partial<Record<PolicyKey, unknown>> = {};
  private users: Map<string, Partial<Record<PolicyKey, unknown>>> = new Map();
  private listeners = new Set<(change: PolicyChange) => void>();
  private persistence: PolicyPersistence;
  private autoSave: boolean;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveDebounceMs: number;

  constructor(options: PolicyStoreOptions = {}) {
    this.persistence = options.persistence ?? new MemoryPersistence();
    this.autoSave = options.autoSave !== false;
    this.saveDebounceMs = options.autoSaveDebounceMs ?? 500;
  }

  // --------------------------------------------------------------------------
  // Read
  // --------------------------------------------------------------------------

  /** Get the global value for a key (falls back to built-in default). */
  getGlobal<K extends PolicyKey>(key: K): PolicyValue<K> {
    if (key in this.global) return this.global[key] as PolicyValue<K>;
    return this.getDefault(key);
  }

  /** Get the per-user override for a key (undefined if not set). */
  getUser<K extends PolicyKey>(userId: string, key: K): UserOverrideValue<K> | undefined {
    const userMap = this.users.get(userId);
    if (!userMap || !(key in userMap)) return undefined;
    return userMap[key] as UserOverrideValue<K>;
  }

  /** Get the effective value for a user (global merged with user override). */
  getEffective<K extends PolicyKey>(userId: string, key: K): PolicyValue<K> {
    const globalVal = this.getGlobal(key);
    const userOverride = this.getUser(userId, key);
    return mergePolicy(key, globalVal, userOverride);
  }

  // --------------------------------------------------------------------------
  // Write
  // --------------------------------------------------------------------------

  /** Set a global policy value. */
  setGlobal<K extends PolicyKey>(key: K, value: PolicyValue<K>): void {
    const prev = this.getGlobal(key);
    this.global[key] = value;
    this.notifyAndSave({ key, scope: "global", previousValue: prev, newValue: value, timestamp: iso() });
  }

  /** Set a per-user override. */
  setUser<K extends PolicyKey>(userId: string, key: K, value: UserOverrideValue<K>): void {
    let userMap = this.users.get(userId);
    if (!userMap) {
      userMap = {};
      this.users.set(userId, userMap);
    }
    const prev = userMap[key];
    userMap[key] = value as unknown;
    this.notifyAndSave({ key, scope: "user", userId, previousValue: prev, newValue: value, timestamp: iso() });
  }

  /** Clear a per-user override (falls back to global). */
  clearUser<K extends PolicyKey>(userId: string, key: K): void {
    const userMap = this.users.get(userId);
    if (!userMap || !(key in userMap)) return;
    const prev = userMap[key];
    delete userMap[key];
    if (Object.keys(userMap).length === 0) this.users.delete(userId);
    this.notifyAndSave({ key, scope: "user", userId, previousValue: prev, newValue: undefined, timestamp: iso() });
  }

  /** Remove ALL overrides for a user. */
  clearAllUser(userId: string): void {
    const userMap = this.users.get(userId);
    if (!userMap) return;
    this.users.delete(userId);
    for (const key of Object.keys(userMap) as PolicyKey[]) {
      this.notify({ key, scope: "user", userId, previousValue: userMap[key], newValue: undefined, timestamp: iso() });
    }
    this.scheduleSave();
  }

  // --------------------------------------------------------------------------
  // Bulk / export
  // --------------------------------------------------------------------------

  exportAll(): SerializedPolicies {
    const usersObj: Record<string, Partial<Record<PolicyKey, unknown>>> = {};
    for (const [uid, overrides] of this.users) {
      usersObj[uid] = { ...overrides };
    }
    return { version: 1, global: { ...this.global }, users: usersObj };
  }

  importAll(data: SerializedPolicies): void {
    if (data.version !== 1) throw new Error(`Unsupported policy version: ${data.version}`);
    this.global = { ...data.global };
    this.users.clear();
    for (const [uid, overrides] of Object.entries(data.users)) {
      this.users.set(uid, { ...overrides });
    }
    this.scheduleSave();
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  async save(): Promise<void> {
    await this.persistence.save(this.exportAll());
  }

  async load(): Promise<void> {
    const data = await this.persistence.load();
    if (data) this.importAll(data);
  }

  // --------------------------------------------------------------------------
  // Change listeners
  // --------------------------------------------------------------------------

  /** Subscribe to policy changes. Returns unsubscribe function. */
  onChange(listener: (change: PolicyChange) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // --------------------------------------------------------------------------
  // Utility
  // --------------------------------------------------------------------------

  /** Get all user IDs that have overrides. */
  get userIds(): string[] {
    return [...this.users.keys()];
  }

  /** Check if a user has any overrides. */
  hasUserOverrides(userId: string): boolean {
    return this.users.has(userId);
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private getDefault<K extends PolicyKey>(key: K): PolicyValue<K> {
    return POLICY_DEFAULTS[key] as PolicyValue<K>;
  }

  private notify(change: PolicyChange): void {
    for (const listener of this.listeners) {
      try { listener(change); } catch { /* swallow */ }
    }
  }

  private notifyAndSave(change: PolicyChange): void {
    this.notify(change);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (!this.autoSave) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.save().catch(() => { /* swallow persistence errors */ });
    }, this.saveDebounceMs);
  }
}

function iso(): string {
  return new Date().toISOString();
}
